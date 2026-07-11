// =============================================================
// 共通型定義 — 全レイヤー（API / UI / データ層）の唯一の契約
// このファイルは変更しないこと（PROJECT_SPEC.md §0 参照）
// =============================================================

export const SITE_NAME = 'Abuild 締切ナビ';
export const SITE_TAGLINE = 'エントリー締切を見逃さない';

export const ENTRY_TYPES = ['インターン', '本選考', '説明会・イベント'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const COMPANY_SIZES = ['大手', 'メガベンチャー', '中堅・中小', 'スタートアップ'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const INDUSTRIES = ['IT', 'コンサル', 'メーカー', '金融', '広告', '総合商社', '人材', 'インフラ', 'その他'] as const;
export type Industry = (typeof INDUSTRIES)[number];

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
  industry: Industry;
  size: CompanySize;
  hpUrl?: string;
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
  /** 難易度 1..5 */
  difficulty: number;
  applyUrl?: string;
  description?: string;
  /** 情報源URL（この締切情報の出どころ。公式採用ページ・就活サイト等） */
  sourceUrl?: string;
  /** 選考の流れ（例: ES提出 → Webテスト → GD → 面接2回） */
  selectionFlow?: string;
  /** 使うWebテストの種類（例: SPI / 玉手箱 / TG-WEB / GAB / 独自） */
  webTest?: string;
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
  lastRunAt?: string;
  lastStatus?: 'ok' | 'error';
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------- 入力型 ----------------

export interface CompanyInput {
  name: string;
  industry: Industry;
  size: CompanySize;
  hpUrl?: string;
  note?: string;
}

export interface EntryInput {
  companyId: string;
  title: string;
  type: EntryType;
  gradYear: number;
  deadlineAt: string;
  difficulty: number;
  applyUrl?: string;
  description?: string;
  sourceUrl?: string;
  selectionFlow?: string;
  webTest?: string;
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
  updateCompany(id: string, patch: Partial<CompanyInput>): Promise<Company | null>;
  deleteCompany(id: string): Promise<boolean>;

  listEntries(): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  createEntry(input: EntryInput & { id?: string }): Promise<Entry>;
  updateEntry(id: string, patch: Partial<EntryInput>): Promise<Entry | null>;
  deleteEntry(id: string): Promise<boolean>;

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
export function isCompanySize(v: unknown): v is CompanySize {
  return typeof v === 'string' && (COMPANY_SIZES as readonly string[]).includes(v);
}
export function isIndustry(v: unknown): v is Industry {
  return typeof v === 'string' && (INDUSTRIES as readonly string[]).includes(v);
}
export function isEntryStatus(v: unknown): v is EntryStatus {
  return typeof v === 'string' && (ENTRY_STATUSES as readonly string[]).includes(v);
}
export function isSourceType(v: unknown): v is SourceType {
  return typeof v === 'string' && (SOURCE_TYPES as readonly string[]).includes(v);
}

/** 難易度を ★★★☆☆ 形式に */
export function difficultyStars(difficulty: number): string {
  const d = Math.min(5, Math.max(1, Math.round(difficulty)));
  return '★'.repeat(d) + '☆'.repeat(5 - d);
}
