import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measure } from '../src/achievements/measure.js';
import { emptyState, type State } from '../src/cache/state.js';
import type { PrRecord, ProfileData } from '../src/github/types.js';

const profile: ProfileData = {
  login: 'someone',
  name: 'Someone',
  avatarUrl: 'https://example.invalid/a.png',
  searchMergedPrCount: 42,
  topStars: 130,
  topStarsRepo: 'someone/thing',
  acceptedAnswers: 3,
  sponsorships: 1,
};

function pr(overrides: Partial<PrRecord>): PrRecord {
  return {
    id: overrides.id ?? Math.random().toString(36),
    repo: overrides.isPublic === false ? null : 'someone/thing',
    number: overrides.isPublic === false ? null : 1,
    isPublic: true,
    createdAt: '2024-01-01T00:00:00Z',
    closedAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    reviewCount: 1,
    mergedByMe: false,
    hasCoauthoredCommit: false,
    commitsTruncated: false,
    ...overrides,
  };
}

function stateWith(prs: PrRecord[]): State {
  const state = emptyState('someone');
  for (const record of prs) state.prs[record.id] = record;
  return state;
}

describe('measure', () => {
  it('1クエリで取れる実績はプロフィールの値をそのまま使う', () => {
    const state = emptyState('someone');
    assert.equal(measure('starstruck', profile, state, false).count, 130);
    assert.equal(measure('galaxy-brain', profile, state, false).count, 3);
    // 終了済みのスポンサーも数える（バッジは永続なので）
    assert.equal(measure('public-sponsor', profile, state, false).count, 1);
  });

  it('Pull Shark は検索件数ではなく走査結果から数える', () => {
    // 検索 API は Copilot などの Bot が作った PR も author: で拾ってしまうため、
    // 作成者が本人だと確認できている走査結果を使う
    const state = stateWith([pr({ id: 'a' }), pr({ id: 'b' }), pr({ id: 'c', isPublic: false })]);
    assert.equal(profile.searchMergedPrCount, 42, '検索件数は別の値');
    assert.equal(measure('pull-shark', profile, state, false).count, 2, 'public な走査結果の件数');
  });

  it('Pair Extraordinaire は共著コミットを含む public PR を数える', () => {
    const state = stateWith([
      pr({ id: 'a', hasCoauthoredCommit: true }),
      pr({ id: 'b', hasCoauthoredCommit: true }),
      pr({ id: 'c', hasCoauthoredCommit: false }),
      // private は実績の対象外なので数えない
      pr({ id: 'd', hasCoauthoredCommit: true, isPublic: false }),
    ]);
    const result = measure('pair-extraordinaire', profile, state, false);
    assert.equal(result.count, 2);
    assert.equal(result.approximate, false);
  });

  it('コミットを全部見られなかった PR があれば近似フラグを立てる', () => {
    const state = stateWith([pr({ id: 'a', commitsTruncated: true })]);
    assert.equal(measure('pair-extraordinaire', profile, state, false).approximate, true);
  });

  it('共著が確定している PR の打ち切りは近似扱いにしない', () => {
    // 1つでも共著コミットが見つかっていれば、残りを見なくても結論は変わらない
    const state = stateWith([pr({ id: 'a', hasCoauthoredCommit: true, commitsTruncated: false })]);
    const result = measure('pair-extraordinaire', profile, state, false);
    assert.equal(result.count, 1);
    assert.equal(result.approximate, false);
  });

  it('YOLO はレビュー0件かつ自分でマージした public PR を数える', () => {
    const state = stateWith([
      pr({ id: 'a', reviewCount: 0, mergedByMe: true }),
      pr({ id: 'b', reviewCount: 2, mergedByMe: true }),
      pr({ id: 'c', reviewCount: 0, mergedByMe: false }),
      pr({ id: 'd', reviewCount: 0, mergedByMe: true, isPublic: false }),
    ]);
    assert.equal(measure('yolo', profile, state, false).count, 1);
  });

  it('Quickdraw はキャッシュに焼かれた真偽値を使う', () => {
    const before = emptyState('someone');
    assert.equal(measure('quickdraw', profile, before, false).count, 0);

    const after = emptyState('someone');
    after.quickdrawPublic = true;
    assert.equal(measure('quickdraw', profile, after, false).count, 1);
  });
});

describe('includePrivate', () => {
  // GitHub の「Include private contributions on my profile」を有効にしていると
  // 実績にも private の活動が含まれる。その切り替えを検証する。
  const state = stateWith([
    pr({ id: 'pub1', hasCoauthoredCommit: true, reviewCount: 0, mergedByMe: true }),
    pr({ id: 'pub2' }),
    pr({ id: 'priv1', isPublic: false, hasCoauthoredCommit: true, reviewCount: 0, mergedByMe: true }),
    pr({ id: 'priv2', isPublic: false, hasCoauthoredCommit: true }),
  ]);

  it('false なら public だけ数える', () => {
    assert.equal(measure('pull-shark', profile, state, false).count, 2);
    assert.equal(measure('pair-extraordinaire', profile, state, false).count, 1);
    assert.equal(measure('yolo', profile, state, false).count, 1);
  });

  it('true なら private も数える', () => {
    assert.equal(measure('pull-shark', profile, state, true).count, 4);
    assert.equal(measure('pair-extraordinaire', profile, state, true).count, 3);
    assert.equal(measure('yolo', profile, state, true).count, 2);
  });

  it('Quickdraw は public 限定と private 込みを別々に持つ', () => {
    const onlyPrivate = emptyState('someone');
    onlyPrivate.quickdrawAny = true;

    assert.equal(measure('quickdraw', profile, onlyPrivate, false).count, 0, 'public だけなら未達成');
    assert.equal(measure('quickdraw', profile, onlyPrivate, true).count, 1, 'private 込みなら達成');
  });
});
