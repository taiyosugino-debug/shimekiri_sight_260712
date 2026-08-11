// =============================================================
// Google Sheets を DB として使う Store 実装（本番用。DATA_BACKEND=gsheets）
// Google Sheets v4 REST API をグローバル fetch で直接呼び出す。
// アクセストークンは google-auth-library の JWT で取得しモジュール内キャッシュする。
// =============================================================

import { JWT } from 'google-auth-library';
import { nowIso } from '../date';
import {
  Company,
  CompanyInput,
  Entry,
  EntryInput,
  isTier,
  parseReviewDecision,
  ReviewItem,
  ReviewItemInput,
  Source,
  SourceInput,
  SourceRuntimePatch,
  Store,
  Tier,
} from '../types';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const CACHE_TTL_MS = 60 * 1000;

const TAB_COMPANIES = 'companies';
const TAB_ENTRIES = 'entries';
const TAB_SOURCES = 'sources';
const TAB_REVIEW = 'review';
const TAB_META = 'meta';

const COMPANIES_HEADER = [
  'id',
  'name',
  'industry',
  // 廃止列。列位置がずれると既存行の読み取りが全て壊れるため、枠だけ残している。
  // 読み書きともに行わない（将来シート側から物理削除する場合は rowToCompany の分割位置も直すこと）
  'size_unused',
  'hp_url',
  'note',
  'created_at',
  'updated_at',
  'deleted',
  // 追加分（採用ページURL。既存シート互換のため末尾に追加）
  'recruit_url',
  // 616社対応で追加（既存シート互換のため末尾に追加）
  'tier',
  'difficulty_score',
  'hiring_count',
  'est_entries',
  'est_ratio',
];

// review タブ: 巡回結果の「要確認リスト」。人が「承認」列に OK / NG を書き込む。
// 人が読む前提のタブなので、人が触る列（承認）を左寄りの読みやすい位置に置いている。
const REVIEW_HEADER = [
  'id',
  '承認',
  'confidence',
  'company_name',
  'title',
  'deadline_text',
  'deadline_at',
  'type',
  'reasons',
  'page_url',
  'company_id',
  'entry_id',
  'previous_deadline_at',
  'content_hash',
  'first_seen_at',
  'last_seen_at',
  'created_at',
  'updated_at',
  'deleted',
  // 追加分（実際に締切を見つけたページ。既存シート互換のため末尾に追加）
  'found_on_url',
];

// meta タブ: 巡回カーソルなど少量の状態を key-value で保持する
const META_HEADER = ['key', 'value', 'updated_at'];
const ENTRIES_HEADER = [
  'id',
  'company_id',
  'title',
  'type',
  'grad_year',
  'deadline_at',
  // 廃止列（★難易度）。列位置がずれると既存行の読み取りが壊れるため枠だけ残している
  'difficulty_unused',
  'apply_url',
  'description',
  'status',
  'pickup',
  'source',
  'created_at',
  'updated_at',
  'deleted',
  // v1.1 追加分（既存シートとの互換のため末尾に追加。ensureInitialized がヘッダーを自動更新する）
  'source_url',
  'selection_flow',
  'web_test',
  // 追加分（開催日程・期間。既存シート互換のため末尾に追加）
  'event_schedule',
  'event_period',
];
const SOURCES_HEADER = [
  'id',
  'name',
  'type',
  'url',
  'config_json',
  'enabled',
  'last_run_at',
  'last_status',
  'last_message',
  'created_at',
  'updated_at',
  'deleted',
  // 追加分（自動公開フラグ。既存シート互換のため末尾に追加）
  'auto_publish',
];

function genId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${prefix}_${rand}`;
}

function boolToCell(b: boolean): string {
  return b ? 'TRUE' : 'FALSE';
}
function cellToBool(v: string | undefined): boolean {
  return String(v).trim().toUpperCase() === 'TRUE';
}
function cellOrEmpty(v: string | undefined): string {
  return v === undefined || v === null ? '' : String(v);
}
function emptyToUndefined(v: string | undefined): string | undefined {
  return v === undefined || v === '' ? undefined : v;
}
/** 空欄・非数値は undefined。0 は有効な値として残す */
function cellToNumber(v: string | undefined): number | undefined {
  if (v === undefined || String(v).trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function numberToCell(v: number | undefined): string {
  return v === undefined || v === null ? '' : String(v);
}

// ---------------- 環境変数・アクセストークン ----------------

function getEnv(): { spreadsheetId: string; email: string; privateKey: string } {
  const spreadsheetId = process.env.GSHEETS_SPREADSHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!spreadsheetId || !email || !rawKey) {
    throw new Error('gsheets バックエンドの必須環境変数が不足しています');
  }
  return {
    spreadsheetId: spreadsheetId.trim(),
    email: email.trim(),
    privateKey: normalizePrivateKey(rawKey),
  };
}

/**
 * 環境変数に貼り付けられたサービスアカウント秘密鍵を正規化する。
 * Vercel のダッシュボードへ貼る際によくあるブレを吸収する。
 *  - JSON からコピーした \n エスケープ形式
 *  - 実際の改行を含む複数行形式
 *  - 前後にダブルクォート／シングルクォートが付いたまま貼られたケース
 *  - CRLF 改行、前後の余分な空白
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (key.length >= 2) {
    const first = key[0];
    const last = key[key.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      key = key.slice(1, -1);
    }
  }
  key = key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!key.endsWith('\n')) key += '\n';
  if (!key.startsWith('-----BEGIN') || !key.includes('PRIVATE KEY-----')) {
    // ここで落としておくと、OpenSSL の "DECODER routines::unsupported" という
    // 原因の分かりにくいエラーではなく、何を直せばよいかが分かる形で失敗する。
    throw new Error(
      'GOOGLE_PRIVATE_KEY の形式が不正です。サービスアカウントの JSON ファイル内 private_key の値' +
        '（-----BEGIN PRIVATE KEY----- で始まり -----END PRIVATE KEY----- で終わる文字列）を設定してください。',
    );
  }
  return key;
}

let cachedClient: JWT | null = null;
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getJwtClient(): JWT {
  if (cachedClient) return cachedClient;
  const { email, privateKey } = getEnv();
  cachedClient = new JWT({
    email,
    key: privateKey,
    scopes: [SHEETS_SCOPE],
  });
  return cachedClient;
}

/** アクセストークンを取得する（有効期限までモジュール内キャッシュ） */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) {
    return cachedToken.accessToken;
  }
  const client = getJwtClient();
  const credentials = await client.authorize();
  if (!credentials.access_token) {
    throw new Error('Google のアクセストークン取得に失敗しました');
  }
  cachedToken = {
    accessToken: credentials.access_token,
    expiresAt: credentials.expiry_date ?? now + 55 * 60 * 1000,
  };
  return cachedToken.accessToken;
}

// ---------------- Sheets REST 呼び出しヘルパ ----------------

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  return res;
}

async function sheetsJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await sheetsFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Sheets API エラー (${res.status}): ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

// ---------------- シート初期化 ----------------

interface SpreadsheetMeta {
  sheets?: { properties?: { title?: string; sheetId?: number } }[];
}

let initialized = false;
let initializingPromise: Promise<void> | null = null;

/** companies/entries/sources タブが無ければ作成しヘッダー行を書く */
export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (initializingPromise) return initializingPromise;
  initializingPromise = (async () => {
    const { spreadsheetId } = getEnv();
    const meta = await sheetsJson<SpreadsheetMeta>(
      `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties.title`,
    );
    const existingTitles = new Set((meta.sheets ?? []).map((s) => s.properties?.title).filter(Boolean));

    const tabsToCreate: string[] = [];
    for (const tab of [TAB_COMPANIES, TAB_ENTRIES, TAB_SOURCES, TAB_REVIEW, TAB_META]) {
      if (!existingTitles.has(tab)) tabsToCreate.push(tab);
    }

    if (tabsToCreate.length > 0) {
      await sheetsJson(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          requests: tabsToCreate.map((title) => ({ addSheet: { properties: { title } } })),
        }),
      });
    }

    // ヘッダー行を（存在しない/不足している場合に備えて）常に書き込む
    const headerWrites: { tab: string; header: string[] }[] = [
      { tab: TAB_COMPANIES, header: COMPANIES_HEADER },
      { tab: TAB_ENTRIES, header: ENTRIES_HEADER },
      { tab: TAB_SOURCES, header: SOURCES_HEADER },
      { tab: TAB_REVIEW, header: REVIEW_HEADER },
      { tab: TAB_META, header: META_HEADER },
    ];
    for (const { tab, header } of headerWrites) {
      const range = `${tab}!A1:${colLetter(header.length)}1`;
      await sheetsJson(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        {
          method: 'PUT',
          body: JSON.stringify({ range, majorDimension: 'ROWS', values: [header] }),
        },
      );
    }

    initialized = true;
  })();
  try {
    await initializingPromise;
  } finally {
    initializingPromise = null;
  }
}

function colLetter(n: number): string {
  let s = '';
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

// ---------------- 読み取りキャッシュ ----------------

interface RawTables {
  companies: string[][];
  entries: string[][];
  sources: string[][];
  review: string[][];
  meta: string[][];
}

let cache: { data: RawTables; expiresAt: number } | null = null;

function invalidateCache(): void {
  cache = null;
}

async function fetchAllTables(): Promise<RawTables> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;

  await ensureInitialized();
  const { spreadsheetId } = getEnv();
  const ranges = [TAB_COMPANIES, TAB_ENTRIES, TAB_SOURCES, TAB_REVIEW, TAB_META]
    .map((t) => `ranges=${encodeURIComponent(t)}`)
    .join('&');
  const data = await sheetsJson<{ valueRanges?: { values?: string[][] }[] }>(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${ranges}`,
  );
  const [companiesRaw, entriesRaw, sourcesRaw, reviewRaw, metaRaw] = data.valueRanges ?? [];
  const result: RawTables = {
    companies: companiesRaw?.values ?? [],
    entries: entriesRaw?.values ?? [],
    sources: sourcesRaw?.values ?? [],
    review: reviewRaw?.values ?? [],
    meta: metaRaw?.values ?? [],
  };
  cache = { data: result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

/** ヘッダー行を除く行を { rowNumber(1-indexed, シート上の実際の行), cells } の形にする */
function dataRows(table: string[][]): { rowNumber: number; cells: string[] }[] {
  const out: { rowNumber: number; cells: string[] }[] = [];
  for (let i = 1; i < table.length; i++) {
    out.push({ rowNumber: i + 1, cells: table[i] });
  }
  return out;
}

// ---------------- 行 <-> エンティティ 変換 ----------------

function rowToCompany(cells: string[]): Company | null {
  const [
    id,
    name,
    industry,
    ,
    hpUrl,
    note,
    createdAt,
    updatedAt,
    deleted,
    recruitUrl,
    tier,
    difficultyScore,
    hiringCount,
    estEntries,
    estRatio,
  ] = cells;
  if (cellToBool(deleted)) return null;
  if (!id) return null;
  return {
    id,
    name: cellOrEmpty(name),
    industry: cellOrEmpty(industry) as Company['industry'],
    tier: isTier(cellOrEmpty(tier)) ? (cellOrEmpty(tier) as Tier) : undefined,
    difficultyScore: cellToNumber(difficultyScore),
    hiringCount: cellToNumber(hiringCount),
    estEntries: cellToNumber(estEntries),
    estRatio: cellToNumber(estRatio),
    hpUrl: emptyToUndefined(hpUrl),
    recruitUrl: emptyToUndefined(recruitUrl),
    note: emptyToUndefined(note),
    createdAt: cellOrEmpty(createdAt),
    updatedAt: cellOrEmpty(updatedAt),
  };
}

function companyToRow(c: Company, deleted = false): string[] {
  return [
    c.id,
    c.name,
    c.industry,
    '', // size_unused（廃止列。枠のみ維持）
    cellOrEmpty(c.hpUrl),
    cellOrEmpty(c.note),
    c.createdAt,
    c.updatedAt,
    boolToCell(deleted),
    cellOrEmpty(c.recruitUrl),
    cellOrEmpty(c.tier),
    numberToCell(c.difficultyScore),
    numberToCell(c.hiringCount),
    numberToCell(c.estEntries),
    numberToCell(c.estRatio),
  ];
}

function rowToEntry(cells: string[]): Entry | null {
  const [
    id,
    companyId,
    title,
    type,
    gradYear,
    deadlineAt,
    ,
    applyUrl,
    description,
    status,
    pickup,
    source,
    createdAt,
    updatedAt,
    deleted,
    sourceUrl,
    selectionFlow,
    webTest,
    eventSchedule,
    eventPeriod,
  ] = cells;
  if (cellToBool(deleted)) return null;
  if (!id) return null;
  return {
    id,
    companyId: cellOrEmpty(companyId),
    title: cellOrEmpty(title),
    type: cellOrEmpty(type) as Entry['type'],
    gradYear: Number(gradYear) || 0,
    deadlineAt: cellOrEmpty(deadlineAt),
    applyUrl: emptyToUndefined(applyUrl),
    description: emptyToUndefined(description),
    sourceUrl: emptyToUndefined(sourceUrl),
    selectionFlow: emptyToUndefined(selectionFlow),
    webTest: emptyToUndefined(webTest),
    eventSchedule: emptyToUndefined(eventSchedule),
    eventPeriod: emptyToUndefined(eventPeriod),
    status: (cellOrEmpty(status) || 'draft') as Entry['status'],
    pickup: cellToBool(pickup),
    source: cellOrEmpty(source) || 'manual',
    createdAt: cellOrEmpty(createdAt),
    updatedAt: cellOrEmpty(updatedAt),
  };
}

function entryToRow(e: Entry, deleted = false): string[] {
  return [
    e.id,
    e.companyId,
    e.title,
    e.type,
    String(e.gradYear),
    e.deadlineAt,
    '', // difficulty_unused（廃止列。枠のみ維持）
    cellOrEmpty(e.applyUrl),
    cellOrEmpty(e.description),
    e.status,
    boolToCell(e.pickup),
    e.source,
    e.createdAt,
    e.updatedAt,
    boolToCell(deleted),
    cellOrEmpty(e.sourceUrl),
    cellOrEmpty(e.selectionFlow),
    cellOrEmpty(e.webTest),
    cellOrEmpty(e.eventSchedule),
    cellOrEmpty(e.eventPeriod),
  ];
}

function rowToSource(cells: string[]): Source | null {
  const [id, name, type, url, configJson, enabled, lastRunAt, lastStatus, lastMessage, createdAt, updatedAt, deleted, autoPublish] =
    cells;
  if (cellToBool(deleted)) return null;
  if (!id) return null;
  return {
    id,
    name: cellOrEmpty(name),
    type: cellOrEmpty(type) as Source['type'],
    url: cellOrEmpty(url),
    configJson: cellOrEmpty(configJson) || '{}',
    enabled: cellToBool(enabled),
    autoPublish: cellToBool(autoPublish),
    lastRunAt: emptyToUndefined(lastRunAt),
    lastStatus: emptyToUndefined(lastStatus) as Source['lastStatus'],
    lastMessage: emptyToUndefined(lastMessage),
    createdAt: cellOrEmpty(createdAt),
    updatedAt: cellOrEmpty(updatedAt),
  };
}

function sourceToRow(s: Source, deleted = false): string[] {
  return [
    s.id,
    s.name,
    s.type,
    s.url,
    s.configJson,
    boolToCell(s.enabled),
    cellOrEmpty(s.lastRunAt),
    cellOrEmpty(s.lastStatus),
    cellOrEmpty(s.lastMessage),
    s.createdAt,
    s.updatedAt,
    boolToCell(deleted),
    boolToCell(s.autoPublish),
  ];
}

function rowToReviewItem(cells: string[]): ReviewItem | null {
  const [
    id,
    decision,
    confidence,
    companyName,
    title,
    deadlineText,
    deadlineAt,
    type,
    reasons,
    pageUrl,
    companyId,
    entryId,
    previousDeadlineAt,
    contentHash,
    firstSeenAt,
    lastSeenAt,
    createdAt,
    updatedAt,
    deleted,
    foundOnUrl,
  ] = cells;
  if (cellToBool(deleted)) return null;
  if (!id) return null;
  return {
    id,
    foundOnUrl: emptyToUndefined(foundOnUrl),
    // 人が手で書いた表記ゆれ（OK / ○ / はい 等）をここで正規化する
    decision: parseReviewDecision(decision),
    confidence: (cellOrEmpty(confidence) || '低') as ReviewItem['confidence'],
    companyName: cellOrEmpty(companyName),
    title: cellOrEmpty(title),
    deadlineText: cellOrEmpty(deadlineText),
    deadlineAt: emptyToUndefined(deadlineAt),
    type: emptyToUndefined(type) as ReviewItem['type'],
    reasons: cellOrEmpty(reasons),
    pageUrl: cellOrEmpty(pageUrl),
    companyId: cellOrEmpty(companyId),
    entryId: emptyToUndefined(entryId),
    previousDeadlineAt: emptyToUndefined(previousDeadlineAt),
    contentHash: cellOrEmpty(contentHash),
    firstSeenAt: cellOrEmpty(firstSeenAt),
    lastSeenAt: cellOrEmpty(lastSeenAt),
    createdAt: cellOrEmpty(createdAt),
    updatedAt: cellOrEmpty(updatedAt),
  };
}

function reviewItemToRow(r: ReviewItem, deleted = false): string[] {
  return [
    r.id,
    r.decision,
    r.confidence,
    r.companyName,
    r.title,
    r.deadlineText,
    cellOrEmpty(r.deadlineAt),
    cellOrEmpty(r.type),
    r.reasons,
    r.pageUrl,
    r.companyId,
    cellOrEmpty(r.entryId),
    cellOrEmpty(r.previousDeadlineAt),
    r.contentHash,
    r.firstSeenAt,
    r.lastSeenAt,
    r.createdAt,
    r.updatedAt,
    boolToCell(deleted),
    cellOrEmpty(r.foundOnUrl),
  ];
}

// ---------------- 汎用 upsert ヘルパ ----------------

interface FoundRow {
  rowNumber: number;
  cells: string[];
}

/**
 * 書き込み直前に対象タブの「最新データ」を読み直し、id で行を特定する。
 * 60秒キャッシュ中にスプレッドシート側で行の並び替え・挿入・編集が行われても、
 * 誤った行を上書きしたり古い値でシート側の編集を潰したりしないための対策。
 * 更新・削除系は必ずこちらを使うこと（キャッシュ由来の行番号を使わない）。
 */
async function findRowByIdFresh(tab: string, id: string, columnCount: number): Promise<FoundRow | null> {
  const { spreadsheetId } = getEnv();
  const range = `${tab}!A:${colLetter(columnCount)}`;
  const data = await sheetsJson<{ values?: string[][] }>(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
  const rows = data.values ?? [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i]?.[0] ?? '') === id) return { rowNumber: i + 1, cells: rows[i] };
  }
  return null;
}

async function appendRow(tab: string, row: string[]): Promise<void> {
  const { spreadsheetId } = getEnv();
  const range = `${tab}!A:A`;
  await sheetsJson(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [row] }),
    },
  );
  invalidateCache();
}

/** 複数行を1回のAPI呼び出しでまとめて追記する（616社の一括投入で必須） */
async function appendRows(tab: string, rows: string[][]): Promise<void> {
  if (rows.length === 0) return;
  const { spreadsheetId } = getEnv();
  const range = `${tab}!A:A`;
  await sheetsJson(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: rows }),
    },
  );
  invalidateCache();
}

async function updateRow(tab: string, rowNumber: number, row: string[], columnCount: number): Promise<void> {
  const { spreadsheetId } = getEnv();
  const range = `${tab}!A${rowNumber}:${colLetter(columnCount)}${rowNumber}`;
  await sheetsJson(`${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: [row] }),
  });
  invalidateCache();
}

// ---------------- Store 実装 ----------------

export class GSheetsStore implements Store {
  backendName: 'gsheets' = 'gsheets';

  // ---------------- companies ----------------

  async listCompanies(): Promise<Company[]> {
    const tables = await fetchAllTables();
    return dataRows(tables.companies)
      .map((r) => rowToCompany(r.cells))
      .filter((c): c is Company => c !== null);
  }

  async getCompany(id: string): Promise<Company | null> {
    const list = await this.listCompanies();
    return list.find((c) => c.id === id) ?? null;
  }

  async createCompany(input: CompanyInput & { id?: string }): Promise<Company> {
    const now = nowIso();
    const company: Company = {
      id: input.id || genId('co'),
      name: input.name,
      industry: input.industry,
      tier: input.tier,
      difficultyScore: input.difficultyScore,
      hiringCount: input.hiringCount,
      estEntries: input.estEntries,
      estRatio: input.estRatio,
      hpUrl: input.hpUrl,
      recruitUrl: input.recruitUrl,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    await appendRow(TAB_COMPANIES, companyToRow(company, false));
    return company;
  }

  async createCompaniesBulk(inputs: (CompanyInput & { id?: string })[]): Promise<Company[]> {
    if (inputs.length === 0) return [];
    const now = nowIso();
    const companies: Company[] = inputs.map((input) => ({
      id: input.id || genId('co'),
      name: input.name,
      industry: input.industry,
      tier: input.tier,
      difficultyScore: input.difficultyScore,
      hiringCount: input.hiringCount,
      estEntries: input.estEntries,
      estRatio: input.estRatio,
      hpUrl: input.hpUrl,
      recruitUrl: input.recruitUrl,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    }));
    // Sheets API の1リクエストが大きくなりすぎないよう分割して追記する
    const CHUNK = 200;
    for (let i = 0; i < companies.length; i += CHUNK) {
      await appendRows(TAB_COMPANIES, companies.slice(i, i + CHUNK).map((c) => companyToRow(c, false)));
    }
    return companies;
  }

  async updateCompany(id: string, patch: Partial<CompanyInput>): Promise<Company | null> {
    const found = await findRowByIdFresh(TAB_COMPANIES, id, COMPANIES_HEADER.length);
    if (!found) return null;
    const existing = rowToCompany(found.cells);
    if (!existing) return null; // 削除済み行
    const updated: Company = { ...existing, ...patch, updatedAt: nowIso() };
    await updateRow(TAB_COMPANIES, found.rowNumber, companyToRow(updated, false), COMPANIES_HEADER.length);
    return updated;
  }

  async deleteCompany(id: string): Promise<boolean> {
    const found = await findRowByIdFresh(TAB_COMPANIES, id, COMPANIES_HEADER.length);
    if (!found) return false;
    const existing = rowToCompany(found.cells);
    if (!existing) return false;
    const deletedRow = { ...existing, updatedAt: nowIso() };
    await updateRow(TAB_COMPANIES, found.rowNumber, companyToRow(deletedRow, true), COMPANIES_HEADER.length);
    return true;
  }

  // ---------------- entries ----------------

  async listEntries(): Promise<Entry[]> {
    const tables = await fetchAllTables();
    return dataRows(tables.entries)
      .map((r) => rowToEntry(r.cells))
      .filter((e): e is Entry => e !== null);
  }

  async getEntry(id: string): Promise<Entry | null> {
    const list = await this.listEntries();
    return list.find((e) => e.id === id) ?? null;
  }

  async createEntry(input: EntryInput & { id?: string }): Promise<Entry> {
    const now = nowIso();
    const entry: Entry = {
      id: input.id || genId('en'),
      companyId: input.companyId,
      title: input.title,
      type: input.type,
      gradYear: input.gradYear,
      deadlineAt: input.deadlineAt,
      applyUrl: input.applyUrl,
      description: input.description,
      // これらが欠けていると entryToRow で常に空欄になり、
      // 取り込んだ Entry から出典ページを辿れなくなる
      sourceUrl: input.sourceUrl,
      selectionFlow: input.selectionFlow,
      webTest: input.webTest,
      eventSchedule: input.eventSchedule,
      eventPeriod: input.eventPeriod,
      status: input.status ?? 'draft',
      pickup: input.pickup ?? false,
      source: input.source ?? 'manual',
      createdAt: now,
      updatedAt: now,
    };
    await appendRow(TAB_ENTRIES, entryToRow(entry, false));
    return entry;
  }

  async updateEntry(id: string, patch: Partial<EntryInput>): Promise<Entry | null> {
    const found = await findRowByIdFresh(TAB_ENTRIES, id, ENTRIES_HEADER.length);
    if (!found) return null;
    const existing = rowToEntry(found.cells);
    if (!existing) return null; // 削除済み行
    const updated: Entry = { ...existing, ...patch, updatedAt: nowIso() };
    await updateRow(TAB_ENTRIES, found.rowNumber, entryToRow(updated, false), ENTRIES_HEADER.length);
    return updated;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const found = await findRowByIdFresh(TAB_ENTRIES, id, ENTRIES_HEADER.length);
    if (!found) return false;
    const existing = rowToEntry(found.cells);
    if (!existing) return false;
    const deletedRow = { ...existing, updatedAt: nowIso() };
    await updateRow(TAB_ENTRIES, found.rowNumber, entryToRow(deletedRow, true), ENTRIES_HEADER.length);
    return true;
  }

  // ---------------- review（要確認リスト） ----------------

  async listReviewItems(): Promise<ReviewItem[]> {
    const tables = await fetchAllTables();
    return dataRows(tables.review)
      .map((r) => rowToReviewItem(r.cells))
      .filter((r): r is ReviewItem => r !== null);
  }

  async getReviewItem(id: string): Promise<ReviewItem | null> {
    const list = await this.listReviewItems();
    return list.find((r) => r.id === id) ?? null;
  }

  async createReviewItem(input: ReviewItemInput & { id?: string }): Promise<ReviewItem> {
    const now = nowIso();
    const item: ReviewItem = {
      id: input.id || genId('rv'),
      companyId: input.companyId,
      companyName: input.companyName,
      pageUrl: input.pageUrl,
      foundOnUrl: input.foundOnUrl,
      title: input.title,
      deadlineText: input.deadlineText,
      deadlineAt: input.deadlineAt,
      type: input.type,
      confidence: input.confidence,
      reasons: input.reasons,
      decision: input.decision ?? '未確認',
      entryId: input.entryId,
      previousDeadlineAt: input.previousDeadlineAt,
      contentHash: input.contentHash,
      firstSeenAt: input.firstSeenAt ?? now,
      lastSeenAt: input.lastSeenAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
    await ensureInitialized();
    await appendRow(TAB_REVIEW, reviewItemToRow(item));
    return item;
  }

  async updateReviewItem(id: string, patch: Partial<ReviewItemInput>): Promise<ReviewItem | null> {
    await ensureInitialized();
    const found = await findRowByIdFresh(TAB_REVIEW, id, REVIEW_HEADER.length);
    if (!found) return null;
    const current = rowToReviewItem(found.cells);
    if (!current) return null;
    const updated: ReviewItem = { ...current, ...patch, updatedAt: nowIso() };
    await updateRow(TAB_REVIEW, found.rowNumber, reviewItemToRow(updated), REVIEW_HEADER.length);
    return updated;
  }

  async deleteReviewItem(id: string): Promise<boolean> {
    await ensureInitialized();
    const found = await findRowByIdFresh(TAB_REVIEW, id, REVIEW_HEADER.length);
    if (!found) return false;
    const current = rowToReviewItem(found.cells);
    if (!current) return false;
    await updateRow(TAB_REVIEW, found.rowNumber, reviewItemToRow(current, true), REVIEW_HEADER.length);
    return true;
  }

  // ---------------- meta（巡回カーソル等） ----------------

  async getMeta(key: string): Promise<string | null> {
    const tables = await fetchAllTables();
    for (const { cells } of dataRows(tables.meta)) {
      if ((cells[0] ?? '') === key) return cells[1] ?? '';
    }
    return null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await ensureInitialized();
    // meta は id 列ではなく key 列で引くため findRowByIdFresh をそのまま使える
    const found = await findRowByIdFresh(TAB_META, key, META_HEADER.length);
    const row = [key, value, nowIso()];
    if (found) {
      await updateRow(TAB_META, found.rowNumber, row, META_HEADER.length);
    } else {
      await appendRow(TAB_META, row);
    }
  }

  // ---------------- sources ----------------

  async listSources(): Promise<Source[]> {
    const tables = await fetchAllTables();
    return dataRows(tables.sources)
      .map((r) => rowToSource(r.cells))
      .filter((s): s is Source => s !== null);
  }

  async getSource(id: string): Promise<Source | null> {
    const list = await this.listSources();
    return list.find((s) => s.id === id) ?? null;
  }

  async createSource(input: SourceInput & { id?: string }): Promise<Source> {
    const now = nowIso();
    const source: Source = {
      id: input.id || genId('src'),
      name: input.name,
      type: input.type,
      url: input.url,
      configJson: input.configJson,
      enabled: input.enabled,
      autoPublish: input.autoPublish ?? false,
      lastRunAt: undefined,
      lastStatus: undefined,
      lastMessage: undefined,
      createdAt: now,
      updatedAt: now,
    };
    await appendRow(TAB_SOURCES, sourceToRow(source, false));
    return source;
  }

  async updateSource(id: string, patch: Partial<SourceInput> & SourceRuntimePatch): Promise<Source | null> {
    const found = await findRowByIdFresh(TAB_SOURCES, id, SOURCES_HEADER.length);
    if (!found) return null;
    const existing = rowToSource(found.cells);
    if (!existing) return null; // 削除済み行
    const updated: Source = { ...existing, ...patch, updatedAt: nowIso() };
    await updateRow(TAB_SOURCES, found.rowNumber, sourceToRow(updated, false), SOURCES_HEADER.length);
    return updated;
  }

  async deleteSource(id: string): Promise<boolean> {
    const found = await findRowByIdFresh(TAB_SOURCES, id, SOURCES_HEADER.length);
    if (!found) return false;
    const existing = rowToSource(found.cells);
    if (!existing) return false;
    const deletedRow = { ...existing, updatedAt: nowIso() };
    await updateRow(TAB_SOURCES, found.rowNumber, sourceToRow(deletedRow, true), SOURCES_HEADER.length);
    return true;
  }
}
