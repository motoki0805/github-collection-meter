import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { emptyState } from '../src/cache/state.js';
import { ensureQuickdraw, isQuickdraw, scanMergedPullRequests } from '../src/github/collect.js';
import { createClient } from '../src/github/graphql.js';
import { PR_PAGE_SIZE } from '../src/github/queries.js';

const LOGIN = 'someone';
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

type FakePr = {
  id: string;
  updatedAt: string;
  createdAt?: string;
  closedAt?: string;
  isPrivate?: boolean;
  reviewCount?: number;
  mergedBy?: string | null;
  authorCounts?: number[];
  commitTotal?: number;
};

type FakeIssue = { createdAt: string; closedAt: string };

/** 指定した PR 群をページングして返す偽サーバーを立てる。 */
function stubGitHub(options: { prs: FakePr[]; issues?: FakeIssue[] }) {
  let requests = 0;

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    requests += 1;
    const { query, variables } = JSON.parse(String(init.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };

    if (query.includes('MergedPullRequests')) {
      const start = variables['cursor'] == null ? 0 : Number(variables['cursor']);
      const slice = options.prs.slice(start, start + PR_PAGE_SIZE);
      const end = start + slice.length;
      return json({
        user: {
          pullRequests: {
            pageInfo: {
              hasNextPage: end < options.prs.length,
              endCursor: end < options.prs.length ? String(end) : null,
            },
            nodes: slice.map(toPrNode),
          },
        },
      });
    }

    if (query.includes('ClosedIssues')) {
      return json({
        user: {
          issues: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: (options.issues ?? []).map((issue, index) => ({
              id: 'I_' + index,
              createdAt: issue.createdAt,
              closedAt: issue.closedAt,
              updatedAt: issue.closedAt,
              repository: { isPrivate: false },
            })),
          },
        },
      });
    }

    throw new Error('想定外のクエリ: ' + query.slice(0, 40));
  }) as typeof fetch;

  return { requestCount: () => requests };
}

function toPrNode(pr: FakePr, index: number) {
  const authorCounts = pr.authorCounts ?? [1];
  return {
    id: pr.id,
    number: index + 1,
    createdAt: pr.createdAt ?? '2024-01-01T00:00:00Z',
    closedAt: pr.closedAt ?? '2024-01-05T00:00:00Z',
    updatedAt: pr.updatedAt,
    repository: { nameWithOwner: LOGIN + '/repo', isPrivate: pr.isPrivate ?? false },
    mergedBy: pr.mergedBy === null ? null : { login: pr.mergedBy ?? 'someone-else' },
    reviews: { totalCount: pr.reviewCount ?? 1 },
    commits: {
      totalCount: pr.commitTotal ?? authorCounts.length,
      nodes: authorCounts.map((count) => ({ commit: { authors: { totalCount: count } } })),
    },
  };
}

function json(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** updatedAt が新しい順に並んだ PR を n 件作る（API の返し方と同じ順序）。 */
function manyPrs(n: number): FakePr[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 'PR_' + i,
    updatedAt: new Date(Date.UTC(2024, 0, 1) - i * 86_400_000).toISOString(),
  }));
}

const client = () => createClient({ token: 'test-token' });

describe('scanMergedPullRequests', () => {
  it('ページングして全件集める', async () => {
    const server = stubGitHub({ prs: manyPrs(60) });
    const state = emptyState(LOGIN);

    await scanMergedPullRequests(client(), LOGIN, state);

    assert.equal(Object.keys(state.prs).length, 60);
    assert.equal(server.requestCount(), 3, '25件ずつ3ページのはず');
    assert.equal(state.complete, true);
    assert.ok(state.lastScanAt !== null);
  });

  it('2回目は前回時刻より古い PR に当たった時点で打ち切る', async () => {
    const prs = manyPrs(60);

    const first = stubGitHub({ prs });
    const state = emptyState(LOGIN);
    await scanMergedPullRequests(client(), LOGIN, state);
    const firstRequests = first.requestCount();

    const second = stubGitHub({ prs });
    await scanMergedPullRequests(client(), LOGIN, state);

    assert.equal(second.requestCount(), 1, '1ページ目で打ち切れるはず');
    assert.ok(second.requestCount() < firstRequests);
    assert.equal(Object.keys(state.prs).length, 60, 'キャッシュ済みの結果は保持される');
  });

  it('全走査の結果は差分更新の結果と一致する', async () => {
    const prs = manyPrs(60);

    const incremental = emptyState(LOGIN);
    stubGitHub({ prs });
    await scanMergedPullRequests(client(), LOGIN, incremental);
    stubGitHub({ prs });
    await scanMergedPullRequests(client(), LOGIN, incremental);

    const server = stubGitHub({ prs });
    const full = emptyState(LOGIN);
    await scanMergedPullRequests(client(), LOGIN, full, { full: true });

    assert.equal(server.requestCount(), 3);
    assert.deepEqual(Object.keys(full.prs).sort(), Object.keys(incremental.prs).sort());
  });

  it('共著コミットを記録し、private リポジトリの PR は保存しない', async () => {
    // キャッシュは public リポジトリにコミットされるので、
    // 非公開のリポジトリ名や PR 番号が混ざらないようにする
    stubGitHub({
      prs: [
        { id: 'PR_solo', updatedAt: '2024-01-03T00:00:00Z', authorCounts: [1, 1] },
        { id: 'PR_pair', updatedAt: '2024-01-02T00:00:00Z', authorCounts: [1, 2] },
        { id: 'PR_private', updatedAt: '2024-01-01T00:00:00Z', isPrivate: true },
      ],
    });
    const state = emptyState(LOGIN);
    await scanMergedPullRequests(client(), LOGIN, state);

    assert.equal(state.prs['PR_solo']?.hasCoauthoredCommit, false);
    assert.equal(state.prs['PR_pair']?.hasCoauthoredCommit, true);
    assert.equal(state.prs['PR_private'], undefined, 'private は保存しない');
    assert.equal(Object.keys(state.prs).length, 2);
  });

  it('コミットを見切れていない PR に打ち切りフラグを立てる', async () => {
    stubGitHub({
      prs: [
        { id: 'PR_big', updatedAt: '2024-01-02T00:00:00Z', authorCounts: [1], commitTotal: 120 },
        {
          id: 'PR_big_pair',
          updatedAt: '2024-01-01T00:00:00Z',
          authorCounts: [2],
          commitTotal: 120,
        },
      ],
    });
    const state = emptyState(LOGIN);
    await scanMergedPullRequests(client(), LOGIN, state);

    assert.equal(state.prs['PR_big']?.commitsTruncated, true);
    assert.equal(
      state.prs['PR_big_pair']?.commitsTruncated,
      false,
      '共著が確定していれば残りを見なくても結論は変わらない',
    );
  });

  it('5分以内に閉じた PR があれば Quickdraw を立てる', async () => {
    stubGitHub({
      prs: [
        {
          id: 'PR_fast',
          updatedAt: '2024-01-02T00:00:00Z',
          createdAt: '2024-01-02T00:00:00Z',
          closedAt: '2024-01-02T00:03:00Z',
        },
      ],
    });
    const state = emptyState(LOGIN);
    await scanMergedPullRequests(client(), LOGIN, state);
    assert.equal(state.quickdraw, true);
  });
});

describe('ensureQuickdraw', () => {
  it('PR で見つからなければ issue を調べる', async () => {
    stubGitHub({
      prs: [],
      issues: [{ createdAt: '2024-02-01T00:00:00Z', closedAt: '2024-02-01T00:01:00Z' }],
    });
    const state = emptyState(LOGIN);
    await ensureQuickdraw(client(), LOGIN, state);
    assert.equal(state.quickdraw, true);
  });

  it('既に達成済みなら API を叩かない', async () => {
    const server = stubGitHub({ prs: [], issues: [] });
    const state = emptyState(LOGIN);
    state.quickdraw = true;

    await ensureQuickdraw(client(), LOGIN, state);
    assert.equal(server.requestCount(), 0);
  });
});

describe('isQuickdraw', () => {
  it('public かつ5分以内のときだけ真', () => {
    const created = '2024-01-01T00:00:00Z';
    assert.equal(isQuickdraw(true, created, '2024-01-01T00:04:59Z'), true);
    assert.equal(isQuickdraw(true, created, '2024-01-01T00:05:00Z'), true, '境界はちょうど5分まで');
    assert.equal(isQuickdraw(true, created, '2024-01-01T00:05:01Z'), false);
    assert.equal(isQuickdraw(false, created, '2024-01-01T00:01:00Z'), false, 'private は対象外');
    assert.equal(isQuickdraw(true, created, null), false, '未クローズは対象外');
  });
});
