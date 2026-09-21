import { readFile } from 'node:fs/promises';

import { isAchievementId } from './achievements/definitions.js';
import type { AchievementId, Locale } from './achievements/types.js';

export type Config = {
  /** null ならトークンの持ち主を対象にする */
  readonly username: string | null;
  readonly locale: Locale;
  readonly avatar: boolean;
  /** 表示する実績と、その並び順 */
  readonly achievements: readonly AchievementId[];
};

export const DEFAULT_CONFIG: Config = {
  username: null,
  locale: 'ja',
  avatar: true,
  achievements: [
    'pull-shark',
    'pair-extraordinaire',
    'starstruck',
    'galaxy-brain',
    'quickdraw',
    'yolo',
    'public-sponsor',
  ],
};

/** 設定ファイルを読む。無ければ既定値。不正な値は既定値で埋める。 */
export async function loadConfig(path: string): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return DEFAULT_CONFIG;
  }

  const parsed = JSON.parse(raw) as Partial<Record<keyof Config, unknown>>;

  const achievements = Array.isArray(parsed.achievements)
    ? parsed.achievements.filter(
        (id): id is AchievementId => typeof id === 'string' && isAchievementId(id),
      )
    : DEFAULT_CONFIG.achievements;

  return {
    username:
      typeof parsed.username === 'string' && parsed.username !== '' ? parsed.username : null,
    locale: parsed.locale === 'en' ? 'en' : 'ja',
    avatar: parsed.avatar !== false,
    achievements: achievements.length > 0 ? achievements : DEFAULT_CONFIG.achievements,
  };
}
