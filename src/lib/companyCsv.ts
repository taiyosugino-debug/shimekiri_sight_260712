// =============================================================
// 企業マスターの CSV 一括登録・更新
//
// 616社ぶんの企業マスターを人が用意し、あとから差し替えられるようにするための機能。
// 企業名で照合し、既にあれば更新・無ければ新規作成する（upsert）。
//
// 空欄の扱い（重要）:
//   列そのものを省略した場合は「変更しない」。
//   列はあるが値が空の場合も「変更しない」（誤って全部消さないため）。
//   値を消したいときは "-" を入れる。
// =============================================================

import { parseCsv } from './csv';
import {
  Company,
  CompanyInput,
  ImportResult,
  ImportRowResult,
  isIndustry,
  isTier,
  Store,
  Tier,
} from './types';

/** 必須列。これが無ければ取り込みを始めない */
const REQUIRED_HEADER = ['company_name'];

/** 認識する列 */
export const COMPANY_CSV_HEADER = [
  'company_name',
  'industry',
  'tier',
  'difficulty_score',
  'hiring_count',
  'est_entries',
  'est_ratio',
  'hp_url',
  'recruit_url',
  'note',
] as const;

/** tier 以外の数値列。列名 -> CompanyInput のキー */
const NUMERIC_COLUMNS = [
  ['difficulty_score', 'difficultyScore', '入社難易度'],
  ['hiring_count', 'hiringCount', '採用人数'],
  ['est_entries', 'estEntries', '推定エントリー数'],
  ['est_ratio', 'estRatio', '推定内定倍率'],
] as const;

function parseNumericCell(raw: string | undefined, label: string): number | undefined {
  const v = (raw ?? '').trim();
  if (!v || v === CLEAR_TOKEN) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${label} が数値ではありません（${v}）`);
  return n;
}

/** 値を明示的に空にしたいときに入れる記号 */
const CLEAR_TOKEN = '-';

export interface CompanyImportResult extends ImportResult {
  /** 変更が無く素通しした行数 */
  unchanged: number;
}

function rowToObject(header: string[], cells: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  header.forEach((h, i) => {
    obj[h] = (cells[i] ?? '').trim();
  });
  return obj;
}

/** URL として妥当か（http/https のみ）。空文字は「指定なし」として true */
export function isValidUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 企業マスター CSV を取り込む。
 * mode='dryrun' なら書き込まず、何が起きるかだけを返す。
 */
export async function importCompanyCsv(
  store: Store,
  csvText: string,
  mode: 'dryrun' | 'commit',
): Promise<CompanyImportResult> {
  const rows: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  const table = parseCsv(csvText);
  if (table.length === 0) {
    return { ok: false, created: 0, updated: 0, unchanged: 0, errors: 1, rows: [{ line: 1, action: 'error', message: 'CSVが空です' }] };
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_HEADER.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: 1,
      rows: [{ line: 1, action: 'error', message: `必須の列が足りません: ${missing.join(', ')}` }],
    };
  }

  const existing = await store.listCompanies();
  // 企業名（前後空白を除いたもの）で引けるようにする
  const byName = new Map<string, Company>();
  for (const c of existing) byName.set(c.name.trim(), c);

  const seenNames = new Set<string>();
  /** 新規作成分。最後に一括で書き込む */
  const pendingCreates: CompanyInput[] = [];
  /** 更新分。最後に一括で書き込む */
  const pendingUpdates: { id: string; patch: Partial<CompanyInput> }[] = [];

  for (let i = 1; i < table.length; i++) {
    const line = i + 1;
    const cells = table[i];
    if (cells.length === 1 && cells[0].trim() === '') continue; // 空行

    const obj = rowToObject(header, cells);
    const name = (obj.company_name ?? '').trim();

    try {
      if (!name) throw new Error('company_name が空です');
      if (seenNames.has(name)) throw new Error(`同じ企業名がCSV内に重複しています（${name}）`);
      seenNames.add(name);

      for (const [col, value] of [
        ['hp_url', obj.hp_url],
        ['recruit_url', obj.recruit_url],
      ] as const) {
        if (value && value !== CLEAR_TOKEN && !isValidUrl(value)) {
          throw new Error(`${col} が URL として不正です（${value}）`);
        }
      }

      const current = byName.get(name);

      if (!current) {
        // --- 新規作成: industry と tier は必須 ---
        if (!isIndustry(obj.industry)) {
          throw new Error(`新規登録には industry が必要です（${obj.industry || '空'}）`);
        }
        if (!isTier(obj.tier)) {
          throw new Error(`新規登録には正しい tier が必要です（${obj.tier || '空'}）`);
        }
        const input: CompanyInput = {
          name,
          industry: obj.industry,
          tier: obj.tier,
          difficultyScore: parseNumericCell(obj.difficulty_score, '入社難易度'),
          hiringCount: parseNumericCell(obj.hiring_count, '採用人数'),
          estEntries: parseNumericCell(obj.est_entries, '推定エントリー数'),
          estRatio: parseNumericCell(obj.est_ratio, '推定内定倍率'),
          hpUrl: cellValue(obj.hp_url),
          recruitUrl: cellValue(obj.recruit_url),
          note: cellValue(obj.note),
        };
        // 616社の一括投入では新規が数百件になる。1件ずつ書くと実行時間・APIコール数が
        // 跳ね上がるため、ここでは溜めておいて最後に createCompaniesBulk でまとめて書く。
        if (mode === 'commit') pendingCreates.push(input);
        created += 1;
        rows.push({ line, action: 'create', message: `新規登録: ${name}` });
        continue;
      }

      // --- 更新: 指定された列だけを変える ---
      const patch: Partial<CompanyInput> = {};
      const changes: string[] = [];

      if (obj.industry) {
        if (!isIndustry(obj.industry)) throw new Error(`industry が不正です（${obj.industry}）`);
        if (obj.industry !== current.industry) {
          patch.industry = obj.industry;
          changes.push(`業界 ${current.industry}→${obj.industry}`);
        }
      }
      if (obj.tier) {
        if (!isTier(obj.tier)) throw new Error(`tier が不正です（${obj.tier}）`);
        if (obj.tier !== current.tier) {
          patch.tier = obj.tier as Tier;
          changes.push(`Tier ${current.tier ?? '未設定'}→${obj.tier}`);
        }
      }
      for (const [col, key, label] of NUMERIC_COLUMNS) {
        if (!obj[col]) continue;
        const next = parseNumericCell(obj[col], label);
        if (next !== current[key]) {
          patch[key] = next;
          changes.push(`${label} ${current[key] ?? '未設定'}→${next ?? '削除'}`);
        }
      }
      applyTextPatch(patch, changes, 'hpUrl', 'HP URL', obj.hp_url, current.hpUrl);
      applyTextPatch(patch, changes, 'recruitUrl', '採用ページURL', obj.recruit_url, current.recruitUrl);
      applyTextPatch(patch, changes, 'note', '備考', obj.note, current.note);

      if (changes.length === 0) {
        unchanged += 1;
        rows.push({ line, action: 'update', message: `変更なし: ${name}` });
        continue;
      }

      // 1件ずつ書くとシート読み取りが件数分走り API 上限に当たるため、まとめて書く
      if (mode === 'commit') pendingUpdates.push({ id: current.id, patch });
      updated += 1;
      rows.push({ line, action: 'update', message: `更新: ${name}（${changes.join(' / ')}）` });
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      rows.push({ line, action: 'error', message: `${name || '(企業名なし)'}: ${message}` });
    }
  }

  if (mode === 'commit') {
    if (pendingUpdates.length > 0) await store.updateCompaniesBulk(pendingUpdates);
    if (pendingCreates.length > 0) await store.createCompaniesBulk(pendingCreates);
  }

  return { ok: errors === 0, created, updated, unchanged, errors, rows };
}

/** 空欄は「変更しない」、CLEAR_TOKEN は「消す」 */
function cellValue(raw: string | undefined): string | undefined {
  const v = (raw ?? '').trim();
  if (!v || v === CLEAR_TOKEN) return undefined;
  return v;
}

function applyTextPatch(
  patch: Partial<CompanyInput>,
  changes: string[],
  key: 'hpUrl' | 'recruitUrl' | 'note',
  label: string,
  raw: string | undefined,
  currentValue: string | undefined,
): void {
  const v = (raw ?? '').trim();
  if (!v) return; // 空欄は「変更しない」
  if (v === CLEAR_TOKEN) {
    if (currentValue !== undefined) {
      patch[key] = undefined;
      changes.push(`${label} を削除`);
    }
    return;
  }
  if (v !== currentValue) {
    patch[key] = v;
    changes.push(`${label} を変更`);
  }
}
