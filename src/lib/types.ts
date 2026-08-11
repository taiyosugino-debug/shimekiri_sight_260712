// =============================================================
// 共通型定義 — 全レイヤー（API / UI / データ層）の唯一の契約
// 616社対応（2026-08）で変更: size 廃止 / Entry.difficulty 廃止 / Company に tier ほかを追加
// =============================================================

export const SITE_NAME = 'Abuild 締切ナビ';
export const SITE_TAGLINE = 'エントリー締切を見逃さない';

export const ENTRY_TYPES = ['インターン', '本選考', '説明会・イベント'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/**
 * 業界。616社マスタシートの生値をそのまま保持する（シートが唯一の正）。
 * 表示・絞り込み用の集約グループは lib/industry.ts 側で定義する。
 */
export type Industry = string;

/**
 * 採用難易度Tier。616社マスタシートの Tier 列に対応する。
 * 文字列ソートでは正しい順序にならないため、必ず TIER_ORDER / compareTier を使うこと。
 */
export const TIERS = ['SS+', 'SS', 'S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B'] as const;
export type Tier = (typeof TIERS)[number];

/** Tierの序列。小さいほど難関。ソート・比較はここだけを参照する */
export const TIER_ORDER: Record<Tier, number> = {
  'SS+': 1, SS: 2, 'S+': 3, S: 4, 'S-': 5, 'A+': 6, A: 7, 'A-': 8, 'B+': 9, B: 10,
};

/** 難関順（SS+ が先頭）に並べるための比較関数 */
export function compareTier(a: Tier | undefined, b: Tier | undefined): number {
  const ai = a ? TIER_ORDER[a] : Number.MAX_SAFE_INTEGER;
  const bi = b ? TIER_ORDER[b] : Number.MAX_SAFE_INTEGER;
  return ai - bi;
}

export const GRAD_YEARS = [2026, 2027, 2028, 2029] as const;

export const ENTRY_STATUSES = ['draft', 'published', 'archived'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  draft: '承認待ち',
  published: '公開中',
  archived: 'アーカイブ',
};

export const SOURCE_TYPES = ['rss', 'json', 'scrape'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// ---------------- エンティティ ----------------

export interface Company {
  id: string;
  name: string;
  /** 616社マスタシートの業界（生値） */
  industry: Industry;
  /** 採用難易度Tier。ユーザー向けに表示する唯一の難易度指標 */
  tier?: Tier;
  /** 入社難易度（数値・50.5〜68.5）。内部ソート用で画面には出さない */
  difficultyScore?: number;
  /** 採用人数 */
  hiringCount?: number;
  /** 推定エントリー数 */
  estEntries?: number;
  /** 推定内定倍率 */
  estRatio?: number;
  hpUrl?: string;
  /** 採用ページURL。巡回（週次クロール）の対象。未設定なら hpUrl を使う */
  recruitUrl?: string;
  note?: string;
  createdAt: string; // ISO8601
  updatedAt: string;
}

export interface Entry {
  id: string;
  companyId: string;
  title: string;
  type: EntryType;
  gradYear: number;
  /** 締切日時。必ず JST オフセット付き ISO8601（例 2026-07-06T23:59:00+09:00） */
  deadlineAt: string;
  applyUrl?: string;
  description?: string;
  /** 情報源URL（この締切情報の出どころ。公式採用ページ・就活サイト等） */
  sourceUrl?: string;
  /** 選考の流れ（例: ES提出 → Webテスト → GD → 面接2回） */
  selectionFlow?: string;
  /** 使うWebテストの種類（例: SPI / 玉手箱 / TG-WEB / GAB / 独自） */
  webTest?: string;
  /** 開催日程（インターン等の実施日。自由記述。例: 8/20(火)〜8/22(木)） */
  eventSchedule?: string;
  /** 開催期間（例: 3日間 / 1day / 2週間） */
  eventPeriod?: string;
  status: EntryStatus;
  /** 注目（ピックアップ）フラグ */
  pickup: boolean;
  /** 'manual' | 'csv' | `auto:<sourceId>:<hash>` */
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntryWithCompany extends Entry {
  company: Company;
}

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  /** アダプタ設定（JSON 文字列）。スキーマは PROJECT_SPEC.md §8 */
  configJson: string;
  enabled: boolean;
  /** 取込項目を承認待ち(draft)ではなく即公開(published)にするか。既定 false（＝承認制） */
  autoPublish: boolean;
  lastRunAt?: string;
  lastStatus?: 'ok' | 'error';
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------- 巡回（週次クロール）と要確認リスト ----------------

/** 抽出結果の確信度。低いほど人の確認が必要 */
export const CONFIDENCES = ['高', '中', '低'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** 人が付ける承認状態。シートの「承認」列に対応する */
export const REVIEW_DECISIONS = ['未確認', '承認', '却下', '取込済'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * 巡回で見つけた「締切かもしれない情報」1件。
 * entries には直接入れず、まず review タブに全件書き出して人が確認する。
 * 「怪しいものだけ出す」のではなく全件出して印を付ける方針（取れずに漏れた社を見逃さないため）。
 */
export interface ReviewItem {
  id: string;
  companyId: string;
  /** シート上で人が読むための企業名（非正規化。表示専用） */
  companyName: string;
  /** 巡回の起点にしたページのURL（企業マスターの採用ページURL。行を特定するキー） */
  pageUrl: string;
  /** 実際に締切を見つけたページのURL。下層リンクをたどった場合は pageUrl と異なる */
  foundOnUrl?: string;
  /** 抽出した見出し・前後の文脈 */
  title: string;
  /** ページ上で見つけた締切らしき生テキスト */
  deadlineText: string;
  /** 解釈できた場合の締切 ISO8601(+09:00)。できなければ空 */
  deadlineAt?: string;
  /** 推測できた種別。できなければ空 */
  type?: EntryType;
  confidence: Confidence;
  /** なぜ要確認なのかの理由（人が読む用。' / ' 区切り） */
  reasons: string;
  /** 人が付ける承認状態。シートの「承認」列 */
  decision: ReviewDecision;
  /** 取込済の場合に作られた Entry の id */
  entryId?: string;
  /** 前回巡回時の締切（変化検知用） */
  previousDeadlineAt?: string;
  /** ページ本文のハッシュ（変化検知用） */
  contentHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewItemInput {
  companyId: string;
  companyName: string;
  pageUrl: string;
  foundOnUrl?: string;
  title: string;
  deadlineText: string;
  deadlineAt?: string;
  type?: EntryType;
  confidence: Confidence;
  reasons: string;
  decision?: ReviewDecision;
  entryId?: string;
  previousDeadlineAt?: string;
  contentHash: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

/** 1社を巡回した結果 */
export interface CrawlCompanyResult {
  companyId: string;
  companyName: string;
  pageUrl: string;
  /** 見つけた候補の件数 */
  found: number;
  /** 実際に取得したページのURL一覧（起点＋たどった下層） */
  visitedUrls?: string[];
  created: number;
  updated: number;
  /** 取得や解析に失敗した場合の理由 */
  error?: string;
  /** robots.txt により巡回を中止した場合 true */
  robotsBlocked?: boolean;
}

/** 巡回バッチ1回分の結果 */
export interface CrawlRunResult {
  startedAt: string;
  processed: number;
  /** 次に処理を再開する企業インデックス。全件終わったら null */
  nextCursor: number | null;
  done: boolean;
  results: CrawlCompanyResult[];
}

// ---------------- 入力型 ----------------

export interface CompanyInput {
  name: string;
  industry: Industry;
  tier?: Tier;
  difficultyScore?: number;
  hiringCount?: number;
  estEntries?: number;
  estRatio?: number;
  hpUrl?: string;
  recruitUrl?: string;
  note?: string;
}

export interface EntryInput {
  companyId: string;
  title: string;
  type: EntryType;
  gradYear: number;
  deadlineAt: string;
  applyUrl?: string;
  description?: string;
  sourceUrl?: string;
  selectionFlow?: string;
  webTest?: string;
  eventSchedule?: string;
  eventPeriod?: string;
  status?: EntryStatus;
  pickup?: boolean;
  source?: string;
}

export interface SourceInput {
  name: string;
  type: SourceType;
  url: string;
  configJson: string;
  enabled: boolean;
  autoPublish?: boolean;
}

export interface SourceRuntimePatch {
  lastRunAt?: string;
  lastStatus?: 'ok' | 'error';
  lastMessage?: string;
}

// ---------------- 集計・結果型 ----------------

export interface Stats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  /** published かつ残り 0〜7 日 */
  expiring7: number;
  pickup: number;
  companies: number;
  byType: Record<EntryType, number>;
}

export interface SyncResult {
  sourceId: string;
  sourceName: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface ImportRowResult {
  line: number;
  action: 'create' | 'update' | 'error';
  message: string;
}

export interface ImportResult {
  ok: boolean;
  created: number;
  updated: number;
  errors: number;
  rows: ImportRowResult[];
}

// ---------------- Store 契約 ----------------

export interface Store {
  backendName: 'memory' | 'gsheets';

  listCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | null>;
  createCompany(input: CompanyInput & { id?: string }): Promise<Company>;
  /**
   * 複数企業をまとめて作成する。616社の一括投入で1行ずつ書くと
   * 実行時間・APIコール数が跳ね上がるため、対応バックエンドはここで一括化する。
   */
  createCompaniesBulk(inputs: (CompanyInput & { id?: string })[]): Promise<Company[]>;
  updateCompany(id: string, patch: Partial<CompanyInput>): Promise<Company | null>;
  /**
   * 複数企業をまとめて更新し、更新できた件数を返す。
   * 1件ずつ updateCompany を呼ぶとシート読み取りが件数分走り API 上限に当たるため、
   * 大量更新はこちらを使う。
   */
  updateCompaniesBulk(patches: { id: string; patch: Partial<CompanyInput> }[]): Promise<number>;
  deleteCompany(id: string): Promise<boolean>;

  listEntries(): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  createEntry(input: EntryInput & { id?: string }): Promise<Entry>;
  updateEntry(id: string, patch: Partial<EntryInput>): Promise<Entry | null>;
  deleteEntry(id: string): Promise<boolean>;

  listReviewItems(): Promise<ReviewItem[]>;
  getReviewItem(id: string): Promise<ReviewItem | null>;
  createReviewItem(input: ReviewItemInput & { id?: string }): Promise<ReviewItem>;
  updateReviewItem(id: string, patch: Partial<ReviewItemInput>): Promise<ReviewItem | null>;
  deleteReviewItem(id: string): Promise<boolean>;

  /** 巡回カーソルなど、少量の状態を key-value で保存する */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  listSources(): Promise<Source[]>;
  getSource(id: string): Promise<Source | null>;
  createSource(input: SourceInput & { id?: string }): Promise<Source>;
  updateSource(id: string, patch: Partial<SourceInput> & SourceRuntimePatch): Promise<Source | null>;
  deleteSource(id: string): Promise<boolean>;
}

// ---------------- 型ガードヘルパ ----------------

export function isEntryType(v: unknown): v is EntryType {
  return typeof v === 'string' && (ENTRY_TYPES as readonly string[]).includes(v);
}
/** 業界は616社マスタシートの生値をそのまま受け入れる（空文字だけを弾く） */
export function isIndustry(v: unknown): v is Industry {
  return typeof v === 'string' && v.trim() !== '';
}
export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v);
}
export function isEntryStatus(v: unknown): v is EntryStatus {
  return typeof v === 'string' && (ENTRY_STATUSES as readonly string[]).includes(v);
}
export function isSourceType(v: unknown): v is SourceType {
  return typeof v === 'string' && (SOURCE_TYPES as readonly string[]).includes(v);
}
export function isConfidence(v: unknown): v is Confidence {
  return typeof v === 'string' && (CONFIDENCES as readonly string[]).includes(v);
}

/**
 * シートの「承認」列に人が手で書いた文字列を ReviewDecision に正規化する。
 * 表記ゆれ（OK / ok / ○ / 〇 / o / はい など）を広く受け入れる。
 * 解釈できない文字列は安全側に倒して '未確認' とする（勝手に公開しないため）。
 */
export function parseReviewDecision(v: unknown): ReviewDecision {
  if (typeof v !== 'string') return '未確認';
  const s = v.trim().toLowerCase();
  if (s === '') return '未確認';
  if (['取込済', 'imported', 'done'].includes(s)) return '取込済';
  if (['ok', 'o', '○', '〇', '承認', 'yes', 'y', 'はい', 'true', '1'].includes(s)) return '承認';
  if (['ng', 'x', '×', '✕', '却下', 'no', 'n', 'いいえ', 'false', '0'].includes(s)) return '却下';
  return '未確認';
}
