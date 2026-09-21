/** 対応する実績。GitHub が experimental / 引退扱いにしたものは含めない。 */
export type AchievementId =
  | 'pull-shark'
  | 'pair-extraordinaire'
  | 'starstruck'
  | 'galaxy-brain'
  | 'quickdraw'
  | 'yolo'
  | 'public-sponsor';

export type Locale = 'ja' | 'en';

/** ロケール別の文言。 */
export type Text = Readonly<Record<Locale, string>>;

/**
 * 実績のティア。GitHub のバッジ表記に合わせて、最初のティアは無印（空文字）。
 * 単一ティアの実績（Quickdraw / YOLO / Public Sponsor）は要素 1 つ。
 */
export type Tier = {
  readonly label: '' | 'x2' | 'x3' | 'x4';
  readonly threshold: number;
};

/** 実績の静的な定義。API も I/O も持たない純粋なメタデータ。 */
export type Achievement = {
  readonly id: AchievementId;
  readonly name: string;
  /** 「あと N 件」の単位 */
  readonly unit: Text;
  /** 達成条件の短い説明 */
  readonly description: Text;
  /** threshold の昇順であること */
  readonly tiers: readonly Tier[];
  /**
   * マージ済み PR の全走査が必要か。
   * false のものは GraphQL 1 クエリで件数が取れる。
   */
  readonly needsScan: boolean;
};

/** ある時点での 1 実績の進捗。 */
export type Progress = {
  readonly id: AchievementId;
  readonly count: number;
  /** 到達済みの最上位ティア。1 つも達成していなければ null */
  readonly currentTier: Tier | null;
  /** 次に狙うティア。全ティア達成済みなら null */
  readonly nextTier: Tier | null;
  /** nextTier まで残り何件か。全ティア達成済みなら null */
  readonly remaining: number | null;
  /** 直前に達成した閾値から次の閾値までの進捗 (0..1) */
  readonly ratio: number;
  /** 達成済みティア数。バッジのピップ表示に使う */
  readonly achievedTiers: number;
  /** 件数が近似値か（commit 100 件超の PR を含む場合など） */
  readonly approximate: boolean;
};
