import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { getAchievement } from './achievements/definitions.js';
import { measureAll } from './achievements/measure.js';
import type { Progress } from './achievements/types.js';
import { loadState, saveState } from './cache/state.js';
import { loadConfig } from './config.js';
import {
  ensureQuickdraw,
  fetchProfile,
  resolveLogin,
  scanMergedPullRequests,
} from './github/collect.js';
import { createClient, GitHubApiError } from './github/graphql.js';
import type { ProfileData } from './github/types.js';
import { renderBadge } from './render/badge.js';
import { renderCard, type MeterRow } from './render/card.js';
import type { ThemeName } from './render/theme.js';

const USAGE = [
  '使い方: github-collection-meter [options]',
  '',
  '  --user <login>     対象ユーザー。省略時はトークンの持ち主',
  '  --config <path>    設定ファイル (既定: meter.config.json)',
  '  --out <dir>        出力先 (既定: output)',
  '  --cache <path>     キャッシュ (既定: .cache/state.json)',
  '  --full             キャッシュを無視して全走査する',
  '  --theme <name>     統合カードの既定テーマ auto|light|dark (既定: auto)',
  '  --no-avatar        アバターを埋め込まない',
  '  --quiet            進捗ログを出さない',
  '  --help             このヘルプ',
  '',
  '環境変数 GITHUB_TOKEN (または GH_TOKEN) にトークンが必要です。',
].join('\n');

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      config: { type: 'string', default: 'meter.config.json' },
      out: { type: 'string', default: 'output' },
      cache: { type: 'string', default: join('.cache', 'state.json') },
      full: { type: 'boolean', default: false },
      theme: { type: 'string', default: 'auto' },
      'no-avatar': { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const log = values.quiet ? undefined : (message: string) => console.error(message);
  const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'] ?? '';
  const config = await loadConfig(resolve(values.config));
  const theme = normalizeTheme(values.theme);

  const client = createClient({ token, log });
  const login = await resolveLogin(client, values.user ?? config.username);
  if (login.endsWith('[bot]')) {
    // Actions 既定の GITHUB_TOKEN の持ち主は github-actions[bot] なので、
    // ユーザー指定を省くとボットの実績を数えに行ってしまう
    throw new GitHubApiError(
      `トークンの持ち主が ${login} です。--user か meter.config.json の username で対象ユーザーを指定してください。`,
    );
  }
  log?.(`対象: @${login}`);

  const cachePath = resolve(values.cache);
  const state = await loadState(cachePath, login);
  const profile = await fetchProfile(client, login);

  const achievements = config.achievements.map(getAchievement);
  if (achievements.some((a) => a.needsScan)) {
    await scanMergedPullRequests(client, login, state, { full: values.full, log });
    await ensureQuickdraw(client, login, state, { full: values.full, log });
  }

  const progresses = measureAll(config.achievements, profile, state);
  const rows: MeterRow[] = achievements.map((achievement, index) => ({
    achievement,
    progress: progresses[index] as Progress,
  }));

  const avatarDataUri =
    config.avatar && !values['no-avatar'] ? await fetchAvatar(profile.avatarUrl, log) : null;

  const outDir = resolve(values.out);
  const generatedAt = new Date();
  const cardOptions = {
    login: profile.login,
    displayName: profile.name,
    avatarDataUri,
    rows,
    locale: config.locale,
    generatedAt,
  };

  await write(join(outDir, 'meter.svg'), renderCard({ ...cardOptions, theme }));
  await write(join(outDir, 'meter-light.svg'), renderCard({ ...cardOptions, theme: 'light' }));
  await write(join(outDir, 'meter-dark.svg'), renderCard({ ...cardOptions, theme: 'dark' }));

  for (const row of rows) {
    await write(
      join(outDir, 'badges', `${row.achievement.id}.svg`),
      renderBadge(row.achievement, row.progress, config.locale),
    );
  }

  const json = toJson(profile, generatedAt, rows);
  await write(join(outDir, 'meter.json'), `${JSON.stringify(json, null, 2)}\n`);
  await saveState(cachePath, state);

  const { requests, retries, rateLimitRemaining } = client.stats;
  log?.(
    `完了: HTTP ${requests} 回 / リトライ ${retries} 回 / 残りレート ${rateLimitRemaining ?? '不明'}`,
  );
  for (const { achievement, progress } of rows) {
    const tail =
      progress.nextTier === null
        ? '達成済み'
        : `あと ${progress.remaining} で ${progress.nextTier.threshold}`;
    log?.(`  ${achievement.name.padEnd(20)} ${String(progress.count).padStart(5)}  ${tail}`);
  }
}

function toJson(profile: ProfileData, generatedAt: Date, rows: readonly MeterRow[]): unknown {
  const scanned = rows.find((r) => r.achievement.id === 'pull-shark')?.progress.count ?? null;
  return {
    generatedAt: generatedAt.toISOString(),
    user: { login: profile.login, name: profile.name },
    note: 'GitHub API から算出した推定値です。GitHub 内部のカウントとは差が出ることがあります。',
    // 検索インデックスは Bot が作った PR も author: で拾うことがあるので、
    // 走査で数えた件数と食い違うことがある。差が出たときに気づけるよう残しておく。
    crossCheck: {
      searchMergedPrCount: profile.searchMergedPrCount,
      scannedMergedPrCount: scanned,
      matches: scanned === null || scanned === profile.searchMergedPrCount,
    },
    achievements: rows.map(({ achievement, progress }) => ({
      id: achievement.id,
      name: achievement.name,
      count: progress.count,
      approximate: progress.approximate,
      currentTier: tierName(progress.currentTier?.label),
      nextThreshold: progress.nextTier?.threshold ?? null,
      remaining: progress.remaining,
      ratio: Math.round(progress.ratio * 1000) / 1000,
    })),
  };
}

function tierName(label: string | undefined): string | null {
  if (label === undefined) return null;
  return label === '' ? 'x1' : label;
}

async function fetchAvatar(url: string, log?: (m: string) => void): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') ?? 'image/png';
    const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    log?.(`アバターを取得できなかったので省略します: ${String(error)}`);
    return null;
  }
}

function normalizeTheme(value: string): ThemeName {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

main().catch((error: unknown) => {
  if (error instanceof GitHubApiError) console.error(`エラー: ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
});
