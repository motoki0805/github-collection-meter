import type { Achievement, Locale, Progress } from '../achievements/types.js';
import { ICONS } from './icons.js';
import { escapeXml, round } from './svg.js';

/**
 * shields.io 風の横長バッジ。
 * README の地の文に混ぜて使うものなので、テーマ連動はせず固定色にしている
 * （light / dark どちらの背景でも読める配色）。
 */
const HEIGHT = 20;
const FONT_SIZE = 11;
const ICON_SIZE = 12;
const PAD = 6;
const GAP = 4;

const LEFT_BG = '#24292f';
const RIGHT_BG = '#0969da';
const RIGHT_BG_DONE = '#1a7f37';

const T = {
  ja: { remaining: (n: number, unit: string) => `あと ${n} ${unit}`, done: '達成済み' },
  en: { remaining: (n: number, unit: string) => `${n} ${unit} to go`, done: 'complete' },
} as const satisfies Record<Locale, unknown>;

export function renderBadge(
  achievement: Achievement,
  progress: Progress,
  locale: Locale,
): string {
  const text = T[locale];
  const complete = progress.nextTier === null;

  const tier = progress.currentTier?.label ?? '';
  const label = tier === '' ? achievement.name : `${achievement.name} ${tier.replace('x', '×')}`;
  const value = complete
    ? text.done
    : text.remaining(progress.remaining ?? 0, achievement.unit[locale]);

  const leftW = round(PAD + ICON_SIZE + GAP + textWidth(label, FONT_SIZE) + PAD);
  const rightW = round(PAD + 2 + textWidth(value, FONT_SIZE) + PAD + 2);
  const total = round(leftW + rightW);

  const iconScale = ICON_SIZE / 16;
  const iconY = (HEIGHT - ICON_SIZE) / 2;
  const baseline = 14;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}" viewBox="0 0 ${total} ${HEIGHT}" role="img" aria-label="${escapeXml(`${label}: ${value}`)}">
  <title>${escapeXml(`${label}: ${value}`)}</title>
  <clipPath id="r"><rect width="${total}" height="${HEIGHT}" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftW}" height="${HEIGHT}" fill="${LEFT_BG}"/>
    <rect x="${leftW}" width="${rightW}" height="${HEIGHT}" fill="${complete ? RIGHT_BG_DONE : RIGHT_BG}"/>
  </g>
  <g transform="translate(${PAD} ${iconY}) scale(${iconScale})"><path fill="#ffffff" d="${ICONS[achievement.id]}"/></g>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', Helvetica, Arial, sans-serif" font-size="${FONT_SIZE}" fill="#ffffff">
    <text x="${round(PAD + ICON_SIZE + GAP)}" y="${baseline}">${escapeXml(label)}</text>
    <text x="${round(leftW + PAD + 2)}" y="${baseline}">${escapeXml(value)}</text>
  </g>
</svg>
`;
}

/**
 * 文字幅の概算。SVG にレイアウトエンジンがないので自前で見積もる必要がある。
 *
 * 係数はブラウザで実際に描画して getBBox() で測った値を元にしている
 * （11px の system-ui で "Pair Extraordinaire" が 88px、"達成済み" が 44px など）。
 * 実フォントは環境によって変わるので、最後に安全係数を掛けて必ず広めに見積もる。
 * 広すぎるとバッジが間延びするだけだが、狭すぎると文字が切れるため。
 */
const SAFETY = 1.05;

const NARROW = new Set([...'iljtfrI.,:;!|()[]{}/\'"`-']);
const WIDE = new Set([...'mwMW@%']);

function charWidth(char: string): number {
  if (isFullWidth(char)) return 1;
  if (char === ' ') return 0.28;
  if (WIDE.has(char)) return 0.78;
  if (NARROW.has(char)) return 0.32;
  if (char >= '0' && char <= '9') return 0.56;
  if (char >= 'A' && char <= 'Z') return 0.72;
  if (char === '×') return 0.6;
  return 0.49;
}

export function textWidth(value: string, fontSize: number): number {
  let em = 0;
  for (const char of value) em += charWidth(char);
  return em * fontSize * SAFETY;
}

function isFullWidth(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}
