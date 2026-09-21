import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { PrRecord } from '../github/types.js';

export const SCHEMA_VERSION = 1;

export type State = {
  schemaVersion: number;
  username: string;
  /**
   * 全走査を最後まで終えたことがあるか。
   * false のうちは差分での打ち切りをせず、必ず最後まで辿る。
   */
  complete: boolean;
  /** 最後に全走査を完了した時刻 (ISO) */
  lastScanAt: string | null;
  /** Quickdraw は一度達成したら取り消されないので、true になったら焼き付ける */
  quickdraw: boolean;
  /** PR の node id をキーにした走査結果 */
  prs: Record<string, PrRecord>;
};

export function emptyState(username: string): State {
  return {
    schemaVersion: SCHEMA_VERSION,
    username,
    complete: false,
    lastScanAt: null,
    quickdraw: false,
    prs: {},
  };
}

/**
 * キャッシュを読む。ファイルが無い / 壊れている / ユーザーやスキーマが変わっている
 * 場合は空の状態を返す（次回の全走査で作り直される）。
 */
export async function loadState(path: string, username: string): Promise<State> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return emptyState(username);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<State>;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return emptyState(username);
    if (parsed.username !== username) return emptyState(username);
    return {
      schemaVersion: SCHEMA_VERSION,
      username,
      complete: parsed.complete === true,
      lastScanAt: typeof parsed.lastScanAt === 'string' ? parsed.lastScanAt : null,
      quickdraw: parsed.quickdraw === true,
      prs: isRecord(parsed.prs) ? parsed.prs : {},
    };
  } catch {
    return emptyState(username);
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // キーを並べておくと、毎回の差分コミットがノイズにならない
  const ordered: State = { ...state, prs: sortKeys(state.prs) };
  await writeFile(path, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

function sortKeys(prs: Record<string, PrRecord>): Record<string, PrRecord> {
  const out: Record<string, PrRecord> = {};
  for (const key of Object.keys(prs).sort()) {
    const value = prs[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, PrRecord> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
