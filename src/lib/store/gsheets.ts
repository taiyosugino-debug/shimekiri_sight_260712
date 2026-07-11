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
  Source,
  SourceInput,
  SourceRuntimePatch,
  Store,
} from '../types';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const CACHE_TTL_MS = 60 * 1000;

const TAB_COMPANIES = 'companies';
const TAB_ENTRIES = 'entries';
const TAB_SOURCES = 'sources';

const COMPANIES_HEADER = ['id', 'name', 'industry', 'size', 'hp_url', 'note', 'created_at', 'updated_at', 'deleted'];
const ENTRIES_HEADER = [
  'id',
  'company_id',
  'title',
  'type',
  'grad_year',
  'deadline_at',
  'difficulty',
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

// ---------------- 環境変数・アクセストークン ----------------

function getEnv(): { spreadsheetId: string; email: string; privateKey: string } {
  const spreadsheetId = process.env.GSHEETS_SPREADSHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!spreadsheetId || !email || !rawKey) {
    throw new Error('gsheets バックエンドの必須環境変数が不足しています');
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');
  return { spreadsheetId, email, privateKey };
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
    for (const tab of [TAB_COMPANIES, TAB_ENTRIES, TAB_SOURCES]) {
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
  const ranges = [TAB_COMPANIES, TAB_ENTRIES, TAB_SOURCES]
    .map((t) => `ranges=${encodeURIComponent(t)}`)
    .join('&');
  const data = await sheetsJson<{ valueRanges?: { values?: string[][] }[] }>(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${ranges}`,
  );
  const [companiesRaw, entriesRaw, sourcesRaw] = data.valueRanges ?? [];
  const result: RawTables = {
    companies: companiesRaw?.values ?? [],
    entries: entriesRaw?.values ?? [],
    sources: sourcesRaw?.values ?? [],
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
  const [id, name, industry, size, hpUrl, note, createdAt, updatedAt, deleted] = cells;
  if (cellToBool(deleted)) return null;
  if (!id) return null;
  return {
    id,
    name: cellOrEmpty(name),
    industry: cellOrEmpty(industry) as Company['industry'],
    size: cellOrEmpty(size) as Company['size'],
    hpUrl: emptyToUndefined(hpUrl),
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
    c.size,
    cellOrEmpty(c.hpUrl),
    cellOrEmpty(c.note),
    c.createdAt,
    c.updatedAt,
    boolToCell(deleted),
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
    difficulty,
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
    difficulty: Number(difficulty) || 1,
    applyUrl: emptyToUndefined(applyUrl),
    description: emptyToUndefined(description),
    sourceUrl: emptyToUndefined(sourceUrl),
    selectionFlow: emptyToUndefined(selectionFlow),
    webTest: emptyToUndefined(webTest),
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
    String(e.difficulty),
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
  ];
}

function rowToSource(cells: string[]): Source | null {
  const [id, name, type, url, configJson, enabled, lastRunAt, lastStatus, lastMessage, createdAt, updatedAt, deleted] =
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
      size: input.size,
      hpUrl: input.hpUrl,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    await appendRow(TAB_COMPANIES, companyToRow(company, false));
    return company;
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
      difficulty: input.difficulty,
      applyUrl: input.applyUrl,
      description: input.description,
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
