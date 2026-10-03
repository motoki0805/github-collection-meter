import type { State } from '../cache/state.js';
import type { GraphQLClient } from './graphql.js';
import { GitHubApiError } from './graphql.js';
import {
  CLOSED_ISSUES_QUERY,
  COMMIT_PAGE_SIZE,
  MERGED_PRS_QUERY,
  PROFILE_QUERY,
  VIEWER_QUERY,
} from './queries.js';
import type { PrRecord, ProfileData } from './types.js';

/** Quickdraw の判定窓。開始から5分以内に閉じたか */
export const QUICKDRAW_WINDOW_MS = 5 * 60 * 1000;

type Log = (message: string) => void;

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

/** --user が無いときはトークンの持ち主を対象にする。 */
export async function resolveLogin(
  client: GraphQLClient,
  explicit: string | null | undefined,
): Promise<string> {
  if (explicit) return explicit;
  const data = await client.request<{ viewer: { login: string } }>(VIEWER_QUERY);
  return data.viewer.login;
}

type ProfileResponse = {
  user: {
    login: string;
    name: string | null;
    avatarUrl: string;
    repositories: { nodes: ({ nameWithOwner: string; stargazerCount: number } | null)[] | null };
    repositoryDiscussionComments: { totalCount: number };
    sponsorshipsAsSponsor: { totalCount: number };
  } | null;
  search: { issueCount: number };
};

/**
 * 1 クエリで取れる実績とプロフィールをまとめて取得する。
 *
 * includePrivate は「プロフィール設定で private の活動も実績に含めている」場合に true。
 * 対象の範囲が変わるので、Starstruck のリポジトリ絞り込みと突き合わせ用の検索に効く。
 */
export async function fetchProfile(
  client: GraphQLClient,
  login: string,
  includePrivate: boolean,
): Promise<ProfileData> {
  const data = await client.request<ProfileResponse>(PROFILE_QUERY, {
    login,
    mergedPrQuery: `is:pr author:${login} is:merged${includePrivate ? '' : ' is:public'}`,
    privacy: includePrivate ? null : 'PUBLIC',
  });

  const user = data.user;
  if (user === null) throw new GitHubApiError(`ユーザー ${login} が見つかりませんでした。`);

  const topRepo = user.repositories.nodes?.[0] ?? null;

  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    searchMergedPrCount: data.search.issueCount,
    topStars: topRepo?.stargazerCount ?? 0,
    topStarsRepo: topRepo?.nameWithOwner ?? null,
    acceptedAnswers: user.repositoryDiscussionComments.totalCount,
    sponsorships: user.sponsorshipsAsSponsor.totalCount,
  };
}

type PrNode = {
  id: string;
  number: number;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  repository: { nameWithOwner: string; isPrivate: boolean };
  mergedBy: { login: string } | null;
  reviews: { totalCount: number };
  commits: {
    totalCount: number;
    nodes: ({ commit: { authors: { totalCount: number } } } | null)[] | null;
  };
};

type MergedPrsResponse = {
  user: { pullRequests: { pageInfo: PageInfo; nodes: (PrNode | null)[] | null } } | null;
};

export type ScanOptions = {
  /** キャッシュを無視して最初から全部辿り直す */
  full?: boolean;
  log?: Log;
};

/**
 * マージ済み PR を走査して state を更新する（破壊的）。
 *
 * UPDATED_AT の降順で辿るので、前回の走査完了時刻より古い PR に到達した時点で
 * 残りはすべて走査済みだと分かる。そこで打ち切ることで2回目以降が軽くなる。
 *
 * private の PR も保存するが、リポジトリ名と番号は落とす（PrRecord の説明を参照）。
 * 集計に含めるかどうかは measure 側で切り替えるので、設定を変えても再走査は要らない。
 */
export async function scanMergedPullRequests(
  client: GraphQLClient,
  login: string,
  state: State,
  { full = false, log }: ScanOptions = {},
): Promise<void> {
  const scanStartedAt = new Date().toISOString();
  const canStopEarly = !full && state.complete && state.lastScanAt !== null;
  const cutoffMs = canStopEarly ? Date.parse(state.lastScanAt as string) : null;

  if (full) {
    state.prs = {};
    state.complete = false;
  }

  let cursor: string | null = null;
  let seen = 0;
  let stoppedEarly = false;

  for (;;) {
    const data: MergedPrsResponse = await client.request<MergedPrsResponse>(MERGED_PRS_QUERY, {
      login,
      cursor,
    });
    const connection = data.user?.pullRequests;
    if (!connection) break;

    for (const node of connection.nodes ?? []) {
      if (node === null) continue;

      if (cutoffMs !== null && Date.parse(node.updatedAt) < cutoffMs) {
        stoppedEarly = true;
        break;
      }

      state.prs[node.id] = toRecord(node, login);
      seen += 1;
    }

    if (stoppedEarly) break;
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
    if (cursor === null) break;

    log?.(`PR を ${seen} 件走査…`);
  }

  log?.(
    stoppedEarly
      ? `PR 走査: 新規・更新のあった ${seen} 件のみ取得（キャッシュ利用）`
      : `PR 走査: ${seen} 件を全件取得`,
  );

  // PR 側で Quickdraw が見つかることもあるので、ここで拾っておく
  for (const record of Object.values(state.prs)) {
    if (!closedWithin5Minutes(record.createdAt, record.closedAt)) continue;
    state.quickdrawAny = true;
    if (record.isPublic) state.quickdrawPublic = true;
    if (state.quickdrawPublic) break;
  }

  state.complete = true;
  state.lastScanAt = scanStartedAt;
}

function toRecord(node: PrNode, login: string): PrRecord {
  let hasCoauthoredCommit = false;
  for (const entry of node.commits.nodes ?? []) {
    if (entry !== null && entry.commit.authors.totalCount > 1) {
      hasCoauthoredCommit = true;
      break;
    }
  }

  const isPublic = !node.repository.isPrivate;

  return {
    id: node.id,
    // private はリポジトリ名も番号も残さない
    repo: isPublic ? node.repository.nameWithOwner : null,
    number: isPublic ? node.number : null,
    isPublic,
    createdAt: node.createdAt,
    closedAt: node.closedAt,
    updatedAt: node.updatedAt,
    reviewCount: node.reviews.totalCount,
    mergedByMe: node.mergedBy?.login === login,
    hasCoauthoredCommit,
    // 共著コミットが既に見つかっているなら、残りを見られなくても結論は変わらない
    commitsTruncated: !hasCoauthoredCommit && node.commits.totalCount > COMMIT_PAGE_SIZE,
  };
}

type IssueNode = {
  id: string;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  repository: { isPrivate: boolean };
};

type ClosedIssuesResponse = {
  user: { issues: { pageInfo: PageInfo; nodes: (IssueNode | null)[] | null } } | null;
};

export type QuickdrawOptions = ScanOptions & {
  /** private の活動も実績に数える設定か */
  includePrivate?: boolean;
};

/**
 * PR 側で Quickdraw が見つからなかった場合に issue も調べる。
 * 一度達成したら取り消されないので、該当するフラグが立っていれば何もしない。
 */
export async function ensureQuickdraw(
  client: GraphQLClient,
  login: string,
  state: State,
  { full = false, includePrivate = false, log }: QuickdrawOptions = {},
): Promise<void> {
  if (includePrivate ? state.quickdrawAny : state.quickdrawPublic) return;

  const canStopEarly = !full && state.complete && state.lastScanAt !== null;
  const cutoffMs = canStopEarly ? Date.parse(state.lastScanAt as string) : null;

  let cursor: string | null = null;

  for (;;) {
    const data: ClosedIssuesResponse = await client.request<ClosedIssuesResponse>(
      CLOSED_ISSUES_QUERY,
      { login, cursor },
    );
    const connection = data.user?.issues;
    if (!connection) return;

    for (const node of connection.nodes ?? []) {
      if (node === null) continue;
      if (cutoffMs !== null && Date.parse(node.updatedAt) < cutoffMs) return;
      if (!closedWithin5Minutes(node.createdAt, node.closedAt)) continue;

      const isPublic = !node.repository.isPrivate;
      state.quickdrawAny = true;
      if (isPublic) state.quickdrawPublic = true;

      log?.(`Quickdraw 達成を issue で確認${isPublic ? '' : '（private）'}`);
      // 求めている側のフラグが立ったら終わり
      if (includePrivate || isPublic) return;
    }

    if (!connection.pageInfo.hasNextPage) return;
    cursor = connection.pageInfo.endCursor;
    if (cursor === null) return;
  }
}

/** 開始から5分以内に閉じられているか。 */
export function closedWithin5Minutes(createdAt: string, closedAt: string | null): boolean {
  if (closedAt === null) return false;
  const elapsed = Date.parse(closedAt) - Date.parse(createdAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= QUICKDRAW_WINDOW_MS;
}
