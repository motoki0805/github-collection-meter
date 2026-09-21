export type ThemeName = 'light' | 'dark' | 'auto';

type Palette = {
  bg: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  done: string;
  track: string;
};

const LIGHT: Palette = {
  bg: '#ffffff',
  border: '#d1d9e0',
  text: '#1f2328',
  muted: '#59636e',
  accent: '#0969da',
  done: '#1a7f37',
  track: '#eaeef2',
};

const DARK: Palette = {
  bg: '#0d1117',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
  accent: '#4493f8',
  done: '#3fb950',
  track: '#21262d',
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', Helvetica, Arial, sans-serif";

/**
 * SVG 1枚を包むクラス名。
 *
 * インライン SVG の <style> は文書全体に効いてしまうので、:root ではなく
 * このクラスにスコープする。さらにテーマごとに名前を変えているのは、
 * light と dark を同じ HTML に並べたときに後勝ちしないようにするため。
 * README から <img> で参照する通常の使い方では関係しないが、
 * インライン展開しても壊れないようにしておく。
 */
export function rootClass(theme: ThemeName): string {
  return `gcm-${theme}`;
}

function vars(palette: Palette): string {
  return Object.entries(palette)
    .map(([key, value]) => `--${key}: ${value};`)
    .join(' ');
}

/**
 * <style> ブロックを組み立てる。
 *
 * auto は prefers-color-scheme で切り替える1枚版。ただし GitHub の README は
 * ページのテーマと OS のテーマが一致しない場合があるので、確実に合わせたいときは
 * light / dark を出し分けて <picture> で切り替えるほうを推奨する。
 */
export function styleBlock(theme: ThemeName): string {
  const r = `.${rootClass(theme)}`;
  const base =
    theme === 'dark'
      ? `${r} { ${vars(DARK)} }`
      : theme === 'light'
        ? `${r} { ${vars(LIGHT)} }`
        : `${r} { ${vars(LIGHT)} } @media (prefers-color-scheme: dark) { ${r} { ${vars(DARK)} } }`;

  return `
    ${base}
    ${r} .card { fill: var(--bg); stroke: var(--border); }
    ${r} text { font-family: ${FONT}; }
    ${r} .title { fill: var(--text); font-size: 15px; font-weight: 600; }
    ${r} .subtitle { fill: var(--muted); font-size: 10.5px; }
    ${r} .name { fill: var(--text); font-size: 12.5px; font-weight: 600; }
    ${r} .tier { fill: var(--muted); font-size: 11px; font-weight: 600; }
    ${r} .count { fill: var(--muted); font-size: 10.5px; }
    ${r} .remaining { fill: var(--accent); font-size: 10.5px; font-weight: 600; }
    ${r} .remaining.done { fill: var(--done); }
    ${r} .footnote { fill: var(--muted); font-size: 9px; }
    ${r} .track { fill: var(--track); }
    ${r} .fill { fill: var(--accent); }
    ${r} .fill.done { fill: var(--done); }
    ${r} .icon { fill: var(--text); }
    ${r} .icon.locked { fill: var(--muted); opacity: 0.35; }
  `
    .replace(/\s+/g, ' ')
    .trim();
}
