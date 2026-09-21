import type { State } from '../cache/state.js';
import type { ProfileData } from '../github/types.js';
import { getAchievement } from './definitions.js';
import { computeProgress } from './progress.js';
import type { AchievementId, Progress } from './types.js';

type Measurement = { count: number; approximate: boolean };

/**
 * 走査結果とプロフィール情報から各実績の件数を出す。
 * 実績は public リポジトリしか数えないので、PR は isPublic で絞る。
 */
export function measure(id: AchievementId, profile: ProfileData, state: State): Measurement {
  switch (id) {
    case 'pull-shark': {
      // 条件は「自分が開いた PR がマージされたこと」。
      // 検索 API は Copilot などの Bot が作った PR も author: で拾ってしまうので、
      // 作成者が本人だと確認できている走査結果から数える。
      let count = 0;
      for (const pr of Object.values(state.prs)) {
        if (pr.isPublic) count += 1;
      }
      return { count, approximate: false };
    }

    case 'starstruck':
      return { count: profile.topStars, approximate: false };

    case 'galaxy-brain':
      return { count: profile.acceptedAnswers, approximate: false };

    case 'public-sponsor':
      return { count: profile.sponsorships, approximate: false };

    case 'pair-extraordinaire': {
      let count = 0;
      let approximate = false;
      for (const pr of Object.values(state.prs)) {
        if (!pr.isPublic) continue;
        if (pr.hasCoauthoredCommit) count += 1;
        else if (pr.commitsTruncated) approximate = true;
      }
      return { count, approximate };
    }

    case 'yolo': {
      let count = 0;
      for (const pr of Object.values(state.prs)) {
        if (pr.isPublic && pr.reviewCount === 0 && pr.mergedByMe) count += 1;
      }
      return { count, approximate: false };
    }

    case 'quickdraw':
      return { count: state.quickdraw ? 1 : 0, approximate: false };
  }
}

export function measureAll(
  ids: readonly AchievementId[],
  profile: ProfileData,
  state: State,
): Progress[] {
  return ids.map((id) => {
    const { count, approximate } = measure(id, profile, state);
    return computeProgress(getAchievement(id), count, { approximate });
  });
}
