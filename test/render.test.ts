import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACHIEVEMENTS, getAchievement } from '../src/achievements/definitions.js';
import { computeProgress } from '../src/achievements/progress.js';
import { renderBadge, textWidth } from '../src/render/badge.js';
import { renderCard, type MeterRow } from '../src/render/card.js';

const GENERATED_AT = new Date('2026-09-16T00:00:00Z');

function rows(counts: Partial<Record<string, number>> = {}): MeterRow[] {
  return ACHIEVEMENTS.map((achievement) => ({
    achievement,
    progress: computeProgress(achievement, counts[achievement.id] ?? 0),
  }));
}

function card(overrides: Partial<Parameters<typeof renderCard>[0]> = {}): string {
  return renderCard({
    login: 'someone',
    displayName: 'Someone',
    avatarDataUri: null,
    rows: rows(),
    locale: 'ja',
    theme: 'auto',
    generatedAt: GENERATED_AT,
    ...overrides,
  });
}

describe('renderCard', () => {
  it('SVG として出力され、行数分の高さを持つ', () => {
    const svg = card();
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<\/svg>\s*$/);
    const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
    assert.ok(height > 7 * 40, `7行ぶんの高さがない: ${height}`);
  });

  it('未定義値がそのまま描画に漏れない', () => {
    for (const theme of ['auto', 'light', 'dark'] as const) {
      const svg = card({ theme });
      assert.doesNotMatch(svg, /undefined|NaN|\[object/, `theme=${theme} に壊れた値が混ざっている`);
    }
  });

  it('auto テーマだけが prefers-color-scheme を持つ', () => {
    assert.match(card({ theme: 'auto' }), /prefers-color-scheme: dark/);
    assert.doesNotMatch(card({ theme: 'light' }), /prefers-color-scheme/);
    assert.doesNotMatch(card({ theme: 'dark' }), /prefers-color-scheme/);
  });

  it('残り件数とティア表記を出す', () => {
    const svg = card({ rows: rows({ 'pull-shark': 128 }) });
    assert.match(svg, /×3/, '達成済みティアの表記がない');
    assert.match(svg, /あと 896 PR/);
    assert.match(svg, /128 \/ 1,024/);
  });

  it('全ティア達成なら残りではなく達成済みと出す', () => {
    const svg = card({ rows: rows({ 'pull-shark': 2000 }) });
    assert.match(svg, /達成済み/);
  });

  it('近似値には ≈ を付ける', () => {
    const pairEx = getAchievement('pair-extraordinaire');
    const svg = card({
      rows: [{ achievement: pairEx, progress: computeProgress(pairEx, 5, { approximate: true }) }],
    });
    assert.match(svg, /≈5 \/ 10/);
  });

  it('locale=en では英語表記になる', () => {
    const svg = card({ locale: 'en', rows: rows({ 'pull-shark': 128 }) });
    assert.match(svg, /896 PRs to go/);
    assert.doesNotMatch(svg, /あと/);
  });

  it('アバターがあるときだけ image と clipPath を出す', () => {
    assert.doesNotMatch(card(), /<image/);
    const withAvatar = card({ avatarDataUri: 'data:image/png;base64,AAAA' });
    assert.match(withAvatar, /<image/);
    assert.match(withAvatar, /clipPath/);
  });

  it('ユーザー名の特殊文字をエスケープする', () => {
    const svg = card({ displayName: 'a<b>&"c"' });
    assert.doesNotMatch(svg, /a<b>/);
    assert.match(svg, /a&lt;b&gt;&amp;/);
  });
});

describe('renderBadge', () => {
  it('全実績のバッジが壊れずに出る', () => {
    for (const achievement of ACHIEVEMENTS) {
      const svg = renderBadge(achievement, computeProgress(achievement, 3), 'ja');
      assert.match(svg, /^<svg /, `${achievement.id} が SVG になっていない`);
      assert.doesNotMatch(svg, /undefined|NaN/, `${achievement.id} に壊れた値がある`);
    }
  });

  it('幅がラベルの長さに追従する', () => {
    const pullShark = getAchievement('pull-shark');
    const width = (svg: string) => Number(/width="([\d.]+)"/.exec(svg)?.[1]);
    const short = width(renderBadge(pullShark, computeProgress(pullShark, 2000), 'ja'));
    const long = width(renderBadge(pullShark, computeProgress(pullShark, 128), 'ja'));
    assert.ok(long > short, `残り表示のほうが広いはず: ${long} vs ${short}`);
  });

  it('全角は半角より広く見積もる', () => {
    assert.ok(textWidth('あああ', 11) > textWidth('aaa', 11));
  });
});

describe('スタイルのスコープ', () => {
  it('文書全体に漏れる :root や裸のセレクタを使わない', () => {
    const svg = card({ theme: 'light' });
    const style = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
    assert.ok(style.length > 0, 'style ブロックがない');
    assert.doesNotMatch(style, /:root/);
    // すべての宣言がカードのクラスに紐づいていること
    for (const selector of style.split('}').map((s) => s.split('{')[0]?.trim() ?? '')) {
      if (selector === '' || selector.startsWith('@media')) continue;
      assert.match(selector, /^\.gcm-/, `スコープされていないセレクタ: ${selector}`);
    }
  });

  it('テーマごとにクラス名が違うので同じ文書に並べても衝突しない', () => {
    const light = card({ theme: 'light' });
    const dark = card({ theme: 'dark' });
    assert.match(light, /class="gcm-light"/);
    assert.match(dark, /class="gcm-dark"/);
    // dark の style が light のクラスを巻き込まないこと
    const darkStyle = /<style>([\s\S]*?)<\/style>/.exec(dark)?.[1] ?? '';
    assert.doesNotMatch(darkStyle, /gcm-light/);
  });
});
