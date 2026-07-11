// =============================================================
// CSV インポート（PROJECT_SPEC.md §7）
// RFC4180 準拠の小さなパーサを自作（ダブルクォート・カンマ・改行・BOM 対応）。
// =============================================================

import { formatDeadlineFull, parseDeadlineText } from './date';
import {
  Company,
  Entry,
  ImportResult,
  ImportRowResult,
  isCompanySize,
  isEntryType,
  isIndustry,
  Store,
} from './types';

const REQUIRED_HEADER = [
  'company_name',
  'industry',
  'size',
  'title',
  'type',
  'grad_year',
  'deadline',
  'difficulty',
  'apply_url',
  'description',
  'pickup',
];

// ---------------- RFC4180 パーサ ----------------

/** BOM を取り除く */
function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

/**
 * RFC4180 準拠の CSV パーサ。
 * ダブルクォートで囲まれたフィールド内のカンマ・改行・エスケープ（""）に対応する。
 * 戻り値は行×列の文字列配列（末尾の空行は除外）。
 */
export function parseCsv(input: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // \r\n または \r 単体を改行として扱う
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // 最後のフィールド・行を確定（末尾に改行が無いケース）
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // 完全に空の行（1列だけで中身が空文字）は除外
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// ---------------- インポートロジック ----------------

interface ParsedRow {
  line: number; // 1-indexed（ヘッダーを1行目として、データは2行目から）
  companyName: string;
  industry: string;
  size: string;
  title: string;
  type: string;
  gradYear: string;
  deadline: string;
  difficulty: string;
  applyUrl: string;
  description: string;
  pickup: string;
  // 任意列（ヘッダーに無くてもよい）
  sourceUrl: string;
  selectionFlow: string;
  webTest: string;
}

function rowToObject(header: string[], cells: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  header.forEach((h, idx) => {
    obj[h] = (cells[idx] ?? '').trim();
  });
  return obj;
}

function parsePickup(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === '有';
}

/**
 * CSV 文字列を取り込む。
 * mode='dryrun' の場合は Store を変更せず結果のみ返す。
 * mode='commit' の場合は実際に Store へ反映する。
 */
export async function importCsv(
  store: Store,
  csvText: string,
  mode: 'dryrun' | 'commit',
  defaultStatus: 'draft' | 'published',
  now: Date = new Date(),
): Promise<ImportResult> {
  const rawRows = parseCsv(csvText);
  if (rawRows.length === 0) {
    return { ok: false, created: 0, updated: 0, errors: 1, rows: [{ line: 1, action: 'error', message: 'CSVが空です' }] };
  }

  const header = rawRows[0].map((h) => h.trim());
  const missing = REQUIRED_HEADER.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      errors: 1,
      rows: [{ line: 1, action: 'error', message: `ヘッダーに必須列が不足しています: ${missing.join(', ')}` }],
    };
  }

  const dataRows = rawRows.slice(1);
  const rowResults: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let errors = 0;

  // 既存データをキャッシュして毎行 listCompanies/listEntries を呼ばないようにする
  const companies = await store.listCompanies();
  const entries = await store.listEntries();
  // dryrun 中でも「今回作成予定の企業」を追跡して重複作成を避ける
  const companyByName = new Map<string, Company>();
  for (const c of companies) companyByName.set(c.name.trim(), c);

  // (companyId, title, gradYear) -> Entry
  const entryKey = (companyId: string, title: string, gradYear: number) => `${companyId}::${title}::${gradYear}`;
  const entryByKey = new Map<string, Entry>();
  for (const e of entries) entryByKey.set(entryKey(e.companyId, e.title, e.gradYear), e);

  for (let idx = 0; idx < dataRows.length; idx++) {
    const line = idx + 2; // ヘッダーが1行目
    const cells = dataRows[idx];
    if (cells.length === 1 && cells[0].trim() === '') continue; // 空行スキップ

    const obj = rowToObject(header, cells);
    const parsed: ParsedRow = {
      line,
      companyName: obj.company_name || '',
      industry: obj.industry || '',
      size: obj.size || '',
      title: obj.title || '',
      type: obj.type || '',
      gradYear: obj.grad_year || '',
      deadline: obj.deadline || '',
      difficulty: obj.difficulty || '',
      applyUrl: obj.apply_url || '',
      description: obj.description || '',
      pickup: obj.pickup || '',
      sourceUrl: obj.source_url || '',
      selectionFlow: obj.selection_flow || '',
      webTest: obj.web_test || '',
    };

    try {
      if (!parsed.companyName) {
        throw new Error('company_name が空です');
      }
      if (!parsed.title) {
        throw new Error('title が空です');
      }
      if (!isEntryType(parsed.type)) {
        throw new Error(`type が不正です（${parsed.type}）`);
      }
      const gradYear = Number(parsed.gradYear);
      if (!Number.isInteger(gradYear) || gradYear < 2000) {
        throw new Error(`grad_year が不正です（${parsed.gradYear}）`);
      }
      const deadlineAt = parseDeadlineText(parsed.deadline, { now });
      if (!deadlineAt) {
        throw new Error(`deadline を解釈できません（${parsed.deadline}）`);
      }
      let difficulty = Number(parsed.difficulty);
      if (!Number.isFinite(difficulty)) difficulty = 3;
      difficulty = Math.min(5, Math.max(1, Math.round(difficulty)));

      // 企業の解決（完全一致 trim。無ければ industry/size で自動作成）
      const companyNameTrimmed = parsed.companyName.trim();
      let company = companyByName.get(companyNameTrimmed);
      if (!company) {
        if (!isIndustry(parsed.industry)) {
          throw new Error(`企業「${companyNameTrimmed}」が未登録で、industry も不正のため自動作成できません（${parsed.industry}）`);
        }
        if (!isCompanySize(parsed.size)) {
          throw new Error(`企業「${companyNameTrimmed}」が未登録で、size も不正のため自動作成できません（${parsed.size}）`);
        }
        if (mode === 'commit') {
          company = await store.createCompany({ name: companyNameTrimmed, industry: parsed.industry, size: parsed.size });
        } else {
          // dryrun: 仮の Company オブジェクトを組み立てて後続行の参照に使う
          company = {
            id: `dryrun_${companyNameTrimmed}`,
            name: companyNameTrimmed,
            industry: parsed.industry,
            size: parsed.size,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
        }
        companyByName.set(companyNameTrimmed, company);
      }

      const pickup = parsePickup(parsed.pickup);
      const key = entryKey(company.id, parsed.title, gradYear);
      const existing = entryByKey.get(key);

      if (existing) {
        // update（deadline 等を上書き、status は維持）
        if (mode === 'commit') {
          const updatedEntry = await store.updateEntry(existing.id, {
            deadlineAt,
            difficulty,
            applyUrl: parsed.applyUrl || undefined,
            description: parsed.description || undefined,
            sourceUrl: parsed.sourceUrl || undefined,
            selectionFlow: parsed.selectionFlow || undefined,
            webTest: parsed.webTest || undefined,
            pickup,
          });
          if (updatedEntry) entryByKey.set(key, updatedEntry);
        }
        updated += 1;
        rowResults.push({
          line,
          action: 'update',
          // 年の解釈（年なし日付の翌年判定など）を目視確認できるよう、確定した締切を年付きで表示する
          message: `更新: ${companyNameTrimmed} / ${parsed.title}（締切 ${formatDeadlineFull(deadlineAt)}）`,
        });
      } else {
        if (mode === 'commit') {
          const createdEntry = await store.createEntry({
            companyId: company.id,
            title: parsed.title,
            type: parsed.type,
            gradYear,
            deadlineAt,
            difficulty,
            applyUrl: parsed.applyUrl || undefined,
            description: parsed.description || undefined,
            sourceUrl: parsed.sourceUrl || undefined,
            selectionFlow: parsed.selectionFlow || undefined,
            webTest: parsed.webTest || undefined,
            status: defaultStatus,
            pickup,
            source: 'csv',
          });
          entryByKey.set(key, createdEntry);
        } else {
          // dryrun: 後続行が同じキーを update 扱いにできるよう仮エントリを登録
          entryByKey.set(key, {
            id: `dryrun_${key}`,
            companyId: company.id,
            title: parsed.title,
            type: parsed.type,
            gradYear,
            deadlineAt,
            difficulty,
            applyUrl: parsed.applyUrl || undefined,
            description: parsed.description || undefined,
            sourceUrl: parsed.sourceUrl || undefined,
            selectionFlow: parsed.selectionFlow || undefined,
            webTest: parsed.webTest || undefined,
            status: defaultStatus,
            pickup,
            source: 'csv',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }
        created += 1;
        rowResults.push({
          line,
          action: 'create',
          message: `新規: ${companyNameTrimmed} / ${parsed.title}（締切 ${formatDeadlineFull(deadlineAt)}）`,
        });
      }
    } catch (err) {
      errors += 1;
      rowResults.push({ line, action: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    ok: errors === 0,
    created,
    updated,
    errors,
    rows: rowResults,
  };
}
