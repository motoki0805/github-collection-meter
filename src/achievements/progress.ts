import type { Achievement, Progress, Tier } from './types.js';

/**
 * 件数から進捗を算出する。純粋関数。
 *
 * バーの比率は 0 起点ではなく「直前に達成した閾値」起点で出す。
 * Pull Shark の 128 → 1024 のような広い帯で、0 起点にするとバーがほぼ動かず
 * メーターとして機能しなくなるため。
 */
export function computeProgress(
  achievement: Achievement,
  count: number,
  options: { approximate?: boolean } = {},
): Progress {
  const tiers = achievement.tiers;
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;

  let currentTier: Tier | null = null;
  let achievedTiers = 0;
  for (const tier of tiers) {
    if (safeCount >= tier.threshold) {
      currentTier = tier;
      achievedTiers += 1;
    } else {
      break;
    }
  }

  const nextTier = tiers[achievedTiers] ?? null;
  const base = currentTier?.threshold ?? 0;

  let ratio: number;
  let remaining: number | null;
  if (nextTier === null) {
    ratio = 1;
    remaining = null;
  } else {
    remaining = nextTier.threshold - safeCount;
    const span = nextTier.threshold - base;
    ratio = span > 0 ? clamp01((safeCount - base) / span) : 0;
  }

  return {
    id: achievement.id,
    count: safeCount,
    currentTier,
    nextTier,
    remaining,
    ratio,
    achievedTiers,
    approximate: options.approximate ?? false,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
