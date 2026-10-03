import type { State } from '../cache/state.js';
import type { PrRecord, ProfileData } from '../github/types.js';
import { getAchievement } from './definitions.js';
import { computeProgress } from './progress.js';
import type { AchievementId, Progress } from './types.js';

type Measurement = { count: number; approximate: boolean };

/**
 * 走査結果とプロフィール情報から各実績の件数を出す。
 *
 * includePrivate は GitHub のプロフィール設定
 * 「Include private contributions on my profile」に対応する。
 * 既定（false）だと実績は public リポジトリの活動しか数えないが、
 * 有効にしている場合は private の活動も匿名化された形で実績に反映される。
 * https://docs.github.com/en/account-and-profile/reference/profile-reference
 */
export function measure(
  id: AchievementId,
  profile: ProfileData,
  state: State,
  includePrivate: boolean,
): Measurement {
  const counts = (predicate: (pr: PrRecord) => boolean): number => {
    let total = 0;
    for (const pr of Object.values(state.prs)) {
      if (!includePrivate && !pr.isPublic) continue;
      if (predicate(pr)) total += 1;
    }
    return total;
  };

  switch (id) {
    case 'pull-shark':
      // 条件は「自分が開いた PR がマージされたこと」。
      // 検索 API は Copilot などの Bot が作った PR も author: で拾ってしまうので、
      // 作成者が本人だと確認できている走査結果から数える。
      return { count: counts(() => true), approximate: false };

    case 'pair-extraordinaire': {
      let approximate = false;
      const count = counts((pr) => {
        if (pr.hasCoauthoredCommit) return true;
        if (pr.commitsTruncated) approximate = true;
        return false;
      });
      return { count, approximate };
    }

    case 'yolo':
      return {
        count: counts((pr) => pr.reviewCount === 0 && pr.mergedByMe),
        approximate: false,
      };

    case 'quickdraw': {
      const achieved = includePrivate ? state.quickdrawAny : state.quickdrawPublic;
      return { count: achieved ? 1 : 0, approximate: false };
    }

    case 'starstruck':
      return { count: profile.topStars, approximate: false };

    case 'galaxy-brain':
      return { count: profile.acceptedAnswers, approximate: false };

    case 'public-sponsor':
      return { count: profile.sponsorships, approximate: false };
  }
}

export function measureAll(
  ids: readonly AchievementId[],
  profile: ProfileData,
  state: State,
  includePrivate: boolean,
): Progress[] {
  return ids.map((id) => {
    const { count, approximate } = measure(id, profile, state, includePrivate);
    return computeProgress(getAchievement(id), count, { approximate });
  });
}
