import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getAchievement } from '../src/achievements/definitions.js';
import { computeProgress } from '../src/achievements/progress.js';

const pullShark = getAchievement('pull-shark');   // 2 / 16 / 128 / 1024
const quickdraw = getAchievement('quickdraw');    // 1 (単一ティア)

describe('computeProgress', () => {
  it('1件もないときは最初のティアを目標にする', () => {
    const p = computeProgress(pullShark, 0);
    assert.equal(p.currentTier, null);
    assert.equal(p.achievedTiers, 0);
    assert.deepEqual(p.nextTier, { label: '', threshold: 2 });
    assert.equal(p.remaining, 2);
    assert.equal(p.ratio, 0);
  });

  it('最初のティア未満では 0 起点で比率を出す', () => {
    const p = computeProgress(pullShark, 1);
    assert.equal(p.ratio, 0.5);
    assert.equal(p.remaining, 1);
  });

  it('閾値ちょうどでそのティアを達成扱いにする', () => {
    const p = computeProgress(pullShark, 2);
    assert.deepEqual(p.currentTier, { label: '', threshold: 2 });
    assert.equal(p.achievedTiers, 1);
    assert.deepEqual(p.nextTier, { label: 'x2', threshold: 16 });
    assert.equal(p.remaining, 14);
    assert.equal(p.ratio, 0, '達成直後は次の帯の起点なので 0');
  });

  it('比率は直前の閾値を起点にする', () => {
    // 9 は 2 と 16 の中間。0 起点なら 9/16=0.56 だが、2 起点なので 7/14=0.5
    assert.equal(computeProgress(pullShark, 9).ratio, 0.5);
    // 広い帯でもバーが動くことの確認: 128→1024 の中間あたり
    const p = computeProgress(pullShark, 576);
    assert.equal(p.ratio, 0.5);
    assert.equal(p.remaining, 448);
  });

  it('最上位ティアに到達したら残りは null、バーは満タン', () => {
    const p = computeProgress(pullShark, 1024);
    assert.deepEqual(p.currentTier, { label: 'x4', threshold: 1024 });
    assert.equal(p.achievedTiers, 4);
    assert.equal(p.nextTier, null);
    assert.equal(p.remaining, null);
    assert.equal(p.ratio, 1);
  });

  it('最上位を超えても件数はそのまま保持する', () => {
    const p = computeProgress(pullShark, 2000);
    assert.equal(p.count, 2000);
    assert.equal(p.nextTier, null);
    assert.equal(p.ratio, 1);
  });

  it('単一ティアの実績を扱える', () => {
    const before = computeProgress(quickdraw, 0);
    assert.equal(before.remaining, 1);
    assert.equal(before.ratio, 0);
    assert.equal(before.achievedTiers, 0);

    const after = computeProgress(quickdraw, 1);
    assert.equal(after.remaining, null);
    assert.equal(after.ratio, 1);
    assert.equal(after.achievedTiers, 1);
  });

  it('壊れた件数は 0 として扱う', () => {
    assert.equal(computeProgress(pullShark, -5).count, 0);
    assert.equal(computeProgress(pullShark, Number.NaN).count, 0);
    assert.equal(computeProgress(pullShark, 3.7).count, 3);
  });

  it('approximate フラグを引き継ぐ', () => {
    assert.equal(computeProgress(pullShark, 10).approximate, false);
    assert.equal(computeProgress(pullShark, 10, { approximate: true }).approximate, true);
  });
});

describe('ACHIEVEMENTS の定義', () => {
  it('ティアは昇順で、ラベルは無印→x2→x3→x4 の順', () => {
    for (const id of ['pull-shark', 'pair-extraordinaire', 'starstruck', 'galaxy-brain'] as const) {
      const { tiers } = getAchievement(id);
      const thresholds = tiers.map((t) => t.threshold);
      assert.deepEqual(thresholds, [...thresholds].sort((a, b) => a - b), `${id} の閾値が昇順でない`);
      assert.deepEqual(tiers.map((t) => t.label), ['', 'x2', 'x3', 'x4'], `${id} のラベルが不正`);
    }
  });
});
