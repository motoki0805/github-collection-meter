/**
 * 走査で得た PR 1件の最小情報。そのままキャッシュに保存する。
 *
 * private リポジトリの PR は repo と number を null にして保存する。
 * キャッシュは public リポジトリにコミットされるため、非公開のリポジトリ名や
 * PR 番号を残さないようにしている。集計に使うのは真偽値だけなので支障はない
 * （GitHub 自身も private の活動は匿名化して実績に反映している）。
 */
export type PrRecord = {
  readonly id: string;
  /** public なら owner/name、private なら null */
  readonly repo: string | null;
  /** public なら PR 番号、private なら null */
  readonly number: number | null;
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
  /** Starstruck: 自作リポジトリの最多スター数 */
  readonly topStars: number;
  readonly topStarsRepo: string | null;
  /** Galaxy Brain: 採用された回答数 */
  readonly acceptedAnswers: number;
  /** Public Sponsor: 終了したものも含むスポンサー数 */
  readonly sponsorships: number;
};
