// =============================================================
// フィルタ・ソートロジック — 公開UI と ICS 配信で共用（変更しないこと）
// =============================================================

import {
  Company,
  CompanySize,
  Entry,
  EntryType,
  EntryWithCompany,
  GRAD_YEARS,
  Industry,
  isCompanySize,
  isEntryType,
  isIndustry,
} from './types';
import { daysUntil, isExpired } from './date';

export type SortKey = 'deadline_asc' | 'deadline_desc' | 'newest';

export interface FilterParams {
  type?: EntryType;
  gradYear?: number;
  size?: CompanySize;
  industry?: Industry;
  /** 残り日数 N 日以内（期限切れは含まない） */
  daysWithin?: number;
  /** 難易度 N 以上 */
  difficultyMin?: number;
  /** 企業名・タイトルのフリーワード */
  q?: string;
  includeExpired?: boolean;
  sort?: SortKey;
}

/** Entry[] と Company[] を突き合わせて EntryWithCompany[] を作る（企業が見つからない entry は除外） */
export function joinCompanies(entries: Entry[], companies: Company[]): EntryWithCompany[] {
  const map = new Map(companies.map((c) => [c.id, c]));
  const out: EntryWithCompany[] = [];
  for (const e of entries) {
    const company = map.get(e.companyId);
    if (company) out.push({ ...e, company });
  }
  return out;
}

/** URLSearchParams からフィルタ条件を安全にパースする（不正値は無視） */
export function parseFilterParams(sp: URLSearchParams): FilterParams {
  const p: FilterParams = {};
  const type = sp.get('type');
  if (isEntryType(type)) p.type = type;
  const gy = Number(sp.get('gradYear'));
  if ((GRAD_YEARS as readonly number[]).includes(gy)) p.gradYear = gy;
  const size = sp.get('size');
  if (isCompanySize(size)) p.size = size;
  const industry = sp.get('industry');
  if (isIndustry(industry)) p.industry = industry;
  const dw = Number(sp.get('daysWithin'));
  if (Number.isInteger(dw) && dw > 0 && dw <= 365) p.daysWithin = dw;
  const dm = Number(sp.get('difficultyMin'));
  if (Number.isInteger(dm) && dm >= 1 && dm <= 5) p.difficultyMin = dm;
  const q = sp.get('q');
  if (q && q.trim()) p.q = q.trim();
  if (sp.get('includeExpired') === '1' || sp.get('includeExpired') === 'true') p.includeExpired = true;
  const sort = sp.get('sort');
  if (sort === 'deadline_asc' || sort === 'deadline_desc' || sort === 'newest') p.sort = sort;
  return p;
}

/**
 * フィルタ＋ソートを適用する。
 * 入力は published 済みの EntryWithCompany[] を想定。
 */
export function applyFilters(
  entries: EntryWithCompany[],
  p: FilterParams,
  now: Date = new Date(),
): EntryWithCompany[] {
  let list = entries.filter((e) => {
    const expired = isExpired(e.deadlineAt, now);
    if (!p.includeExpired && expired) return false;
    if (p.type && e.type !== p.type) return false;
    if (p.gradYear && e.gradYear !== p.gradYear) return false;
    if (p.size && e.company.size !== p.size) return false;
    if (p.industry && e.company.industry !== p.industry) return false;
    if (p.daysWithin !== undefined) {
      if (expired) return false;
      if (daysUntil(e.deadlineAt, now) > p.daysWithin) return false;
    }
    if (p.difficultyMin !== undefined && e.difficulty < p.difficultyMin) return false;
    if (p.q) {
      const q = p.q.toLowerCase();
      const hay = `${e.company.name} ${e.title}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sort: SortKey = p.sort ?? 'deadline_asc';
  const byDeadlineAsc = (a: EntryWithCompany, b: EntryWithCompany) =>
    new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime();

  if (sort === 'deadline_asc') {
    // 未経過を昇順で先に、期限切れは後ろへ
    const active = list.filter((e) => !isExpired(e.deadlineAt, now)).sort(byDeadlineAsc);
    const expired = list.filter((e) => isExpired(e.deadlineAt, now)).sort(byDeadlineAsc).reverse();
    list = [...active, ...expired];
  } else if (sort === 'deadline_desc') {
    list = [...list].sort((a, b) => byDeadlineAsc(b, a));
  } else {
    list = [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return list;
}
