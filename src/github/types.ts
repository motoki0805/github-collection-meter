/** 走査で得た PR 1件の最小情報。そのままキャッシュに保存する。 */
export type PrRecord = {
  readonly id: string;
  readonly repo: string;
  readonly number: number;
  /** public リポジトリの PR か。実績は public しか数えないので集計時に絞る */
  readonly isPublic: boolean;
  readonly createdAt: string;
  readonly closedAt: string | null;
  readonly updatedAt: string;
  readonly reviewCount: number;
  /** 自分自身がマージしたか */
  readonly mergedByMe: boolean;
  /** Co-authored-by 付きコミットを含むか */
  readonly hasCoauthoredCommit: boolean;
  /** コミットを全部は見られなかった（ページサイズ超過）。近似判定に使う */
  readonly commitsTruncated: boolean;
};

/** 1 クエリで取れるプロフィール情報と件数。 */
export type ProfileData = {
  readonly login: string;
  readonly name: string | null;
  readonly avatarUrl: string;
  /**
   * 検索 API が返すマージ済み PR 数。Pull Shark の値には使わない突き合わせ用。
   * Pull Shark は「自分が開いた PR」が条件なので、走査結果から数える。
   */
  readonly searchMergedPrCount: number;
  /** Starstruck: 自作 public リポジトリの最多スター数 */
  readonly topStars: number;
  readonly topStarsRepo: string | null;
  /** Galaxy Brain: 採用された回答数 */
  readonly acceptedAnswers: number;
  /** Public Sponsor: 終了したものも含むスポンサー数 */
  readonly sponsorships: number;
};
