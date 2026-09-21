import type { Achievement, AchievementId } from './types.js';

/**
 * 実績の定義。ティア閾値は下記2つの一覧で一致を確認済み。
 *   https://github.com/drknzz/GitHub-Achievements
 *   https://github.com/Schweinepriester/github-profile-achievements
 *
 * 除外したもの:
 *   Heart On Your Sleeve / Open Sourcerer  … experimental 扱いで無効化中。閾値も不明
 *   Arctic Code Vault / Mars 2020          … 引退済みで新規取得不可
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'pull-shark',
    name: 'Pull Shark',
    unit: { ja: 'PR', en: 'PRs' },
    description: { ja: 'マージされた PR', en: 'Merged pull requests' },
    tiers: [
      { label: '', threshold: 2 },
      { label: 'x2', threshold: 16 },
      { label: 'x3', threshold: 128 },
      { label: 'x4', threshold: 1024 },
    ],
    needsScan: true,
  },
  {
    id: 'pair-extraordinaire',
    name: 'Pair Extraordinaire',
    unit: { ja: 'PR', en: 'PRs' },
    description: {
      ja: 'Co-authored-by 付きコミットを含むマージ済み PR',
      en: 'Merged PRs with a co-authored commit',
    },
    tiers: [
      { label: '', threshold: 1 },
      { label: 'x2', threshold: 10 },
      { label: 'x3', threshold: 24 },
      { label: 'x4', threshold: 48 },
    ],
    needsScan: true,
  },
  {
    id: 'starstruck',
    name: 'Starstruck',
    unit: { ja: 'スター', en: 'stars' },
    description: { ja: '自作リポジトリの最多スター数', en: 'Stars on a repository you created' },
    tiers: [
      { label: '', threshold: 16 },
      { label: 'x2', threshold: 128 },
      { label: 'x3', threshold: 512 },
      { label: 'x4', threshold: 4096 },
    ],
    needsScan: false,
  },
  {
    id: 'galaxy-brain',
    name: 'Galaxy Brain',
    unit: { ja: '回答', en: 'answers' },
    description: { ja: 'Discussions で採用された回答', en: 'Accepted answers in discussions' },
    tiers: [
      { label: '', threshold: 2 },
      { label: 'x2', threshold: 8 },
      { label: 'x3', threshold: 16 },
      { label: 'x4', threshold: 32 },
    ],
    needsScan: false,
  },
  {
    id: 'quickdraw',
    name: 'Quickdraw',
    unit: { ja: '件', en: 'items' },
    description: { ja: '開始から5分以内に閉じた issue / PR', en: 'Closed an issue or PR within 5 minutes' },
    tiers: [{ label: '', threshold: 1 }],
    needsScan: true,
  },
  {
    id: 'yolo',
    name: 'YOLO',
    unit: { ja: '件', en: 'items' },
    description: { ja: 'レビューなしでマージした PR', en: 'Merged a pull request without review' },
    tiers: [{ label: '', threshold: 1 }],
    needsScan: true,
  },
  {
    id: 'public-sponsor',
    name: 'Public Sponsor',
    unit: { ja: '件', en: 'sponsorships' },
    description: { ja: 'GitHub Sponsors での公開スポンサー', en: 'Sponsored someone via GitHub Sponsors' },
    tiers: [{ label: '', threshold: 1 }],
    needsScan: false,
  },
];

const BY_ID = new Map<AchievementId, Achievement>(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievement(id: AchievementId): Achievement {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown achievement id: ${id}`);
  return found;
}

export function isAchievementId(value: string): value is AchievementId {
  return BY_ID.has(value as AchievementId);
}
