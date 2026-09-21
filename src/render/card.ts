import type { Achievement, Locale, Progress } from '../achievements/types.js';
import { iconSvg } from './icons.js';
import { escapeXml, round } from './svg.js';
import { rootClass, styleBlock, type ThemeName } from './theme.js';

export type MeterRow = {
  readonly achievement: Achievement;
  readonly progress: Progress;
};

export type CardOptions = {
  readonly login: string;
  readonly displayName: string | null;
  /** data URI 化したアバター。null なら円だけ描かずに詰める */
  readonly avatarDataUri: string | null;
  readonly rows: readonly MeterRow[];
  readonly locale: Locale;
  readonly theme: ThemeName;
  readonly generatedAt: Date;
};

const WIDTH = 460;
const PAD = 20;
const HEADER_H = 44;
const ROW_H = 40;
const AVATAR = 34;
const ICON = 18;
const BAR_H = 6;

const T = {
  ja: {
    subtitle: '実績メーター',
    updated: (d: string) => `更新 ${d}`,
    remaining: (n: number, unit: string) => `あと ${n.toLocaleString('en-US')} ${unit}`,
    done: '達成済み',
    note: '* GitHub API から算出した推定値です',
  },
  en: {
    subtitle: 'Achievement meter',
    updated: (d: string) => `Updated ${d}`,
    remaining: (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit} to go`,
    done: 'Complete',
    note: '* Estimated from the GitHub API',
  },
} as const satisfies Record<Locale, unknown>;

export function renderCard(options: CardOptions): string {
  const { rows, locale, theme } = options;
  const text = T[locale];

  const rowsTop = PAD + HEADER_H + 10;
  const noteBaseline = rowsTop + rows.length * ROW_H + 10;
  const height = noteBaseline + 12;

  const body = [
    renderHeader(options, text),
    ...rows.map((row, index) => renderRow(row, rowsTop + index * ROW_H, locale, text)),
    `<text class="footnote" x="${PAD}" y="${noteBaseline}">${escapeXml(text.note)}</text>`,
  ].join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" class="${rootClass(theme)}" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeXml(ariaLabel(options, text))}">
  <style>${styleBlock(theme)}</style>
  ${defs(options.avatarDataUri)}
  <rect class="card" x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="8"/>
  ${body}
</svg>
`;
}

function defs(avatarDataUri: string | null): string {
  if (avatarDataUri === null) return '';
  const r = AVATAR / 2;
  return `<defs><clipPath id="avatar-clip"><circle cx="${PAD + r}" cy="${PAD + r}" r="${r}"/></clipPath></defs>`;
}

function renderHeader(options: CardOptions, text: (typeof T)[Locale]): string {
  const hasAvatar = options.avatarDataUri !== null;
  const textX = hasAvatar ? PAD + AVATAR + 12 : PAD;
  const title = options.displayName ?? options.login;
  const updated = text.updated(formatDate(options.generatedAt));

  const avatar = hasAvatar
    ? `<image href="${options.avatarDataUri}" x="${PAD}" y="${PAD}" width="${AVATAR}" height="${AVATAR}" clip-path="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice"/>`
    : '';

  return `${avatar}
  <text class="title" x="${textX}" y="${PAD + 16}">${escapeXml(title)}</text>
  <text class="subtitle" x="${textX}" y="${PAD + 31}">@${escapeXml(options.login)} · ${escapeXml(text.subtitle)}</text>
  <text class="subtitle" x="${WIDTH - PAD}" y="${PAD + 31}" text-anchor="end">${escapeXml(updated)}</text>`;
}

function renderRow(
  { achievement, progress }: MeterRow,
  y: number,
  locale: Locale,
  text: (typeof T)[Locale],
): string {
  const textX = PAD + ICON + 10;
  const barW = WIDTH - PAD - textX;
  const complete = progress.nextTier === null;
  const stateClass = complete ? ' done' : '';

  const tier = progress.currentTier?.label ?? '';
  const tierSpan =
    tier === '' ? '' : `<tspan class="tier" dx="6">${escapeXml(tier.replace('x', '×'))}</tspan>`;

  const right = complete
    ? `<tspan class="remaining done">${escapeXml(text.done)}</tspan>`
    : `<tspan class="count">${approxMark(progress)}${progress.count.toLocaleString('en-US')} / ${progress.nextTier!.threshold.toLocaleString('en-US')}</tspan>` +
      `<tspan class="remaining" dx="8">${escapeXml(text.remaining(progress.remaining ?? 0, achievement.unit[locale]))}</tspan>`;

  const fillW = progress.ratio > 0 ? Math.max(BAR_H, barW * progress.ratio) : 0;
  const bar =
    `<rect class="track" x="${textX}" y="${y + 19}" width="${barW}" height="${BAR_H}" rx="${BAR_H / 2}"/>` +
    (fillW > 0
      ? `<rect class="fill${stateClass}" x="${textX}" y="${y + 19}" width="${round(fillW)}" height="${BAR_H}" rx="${BAR_H / 2}"/>`
      : '');

  return `${iconSvg(achievement.id, PAD, y, ICON, progress.achievedTiers === 0)}
  <text class="name" x="${textX}" y="${y + 12}">${escapeXml(achievement.name)}${tierSpan}</text>
  <text x="${WIDTH - PAD}" y="${y + 12}" text-anchor="end">${right}</text>
  ${bar}`;
}

/** 件数が近似値のときだけ ≈ を付ける。 */
function approxMark(progress: Progress): string {
  return progress.approximate ? '≈' : '';
}

function ariaLabel(options: CardOptions, text: (typeof T)[Locale]): string {
  return `${options.login} ${text.subtitle}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
