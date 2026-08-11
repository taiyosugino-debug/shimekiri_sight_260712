// =============================================================
// フィルタ・ソートロジック — 公開UI と ICS 配信で共用（変更しないこと）
// =============================================================

import {
  Company,
  compareTier,
  Entry,
  EntryType,
  EntryWithCompany,
  GRAD_YEARS,
  Industry,
  isEntryType,
  isIndustry,
  isTier,
  Tier,
} from './types';
import { industryGroupOf } from './industry';
import { daysUntil, isExpired } from './date';

export type SortKey = 'deadline_asc' | 'deadline_desc' | 'newest' | 'tier_desc';

export interface FilterParams {
  type?: EntryType;
  gradYear?: number;
  /** 業界。生値（例: 外資IT）でも集約グループ名（例: IT・通信）でも指定できる */
  industry?: Industry;
  /** 採用難易度Tier（完全一致） */
  tier?: Tier;
  /** 採用難易度Tier がこれ以上に難関のものだけ（例: 'A' なら SS+〜A） */
  tierAtLeast?: Tier;
  /** 残り日数 N 日以内（期限切れは含まない） */
  daysWithin?: number;
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
  const industry = sp.get('industry');
  if (isIndustry(industry)) p.industry = industry;
  const tier = sp.get('tier');
  if (isTier(tier)) p.tier = tier;
  const tierAtLeast = sp.get('tierAtLeast');
  if (isTier(tierAtLeast)) p.tierAtLeast = tierAtLeast;
  const dw = Number(sp.get('daysWithin'));
  if (Number.isInteger(dw) && dw > 0 && dw <= 365) p.daysWithin = dw;
  const q = sp.get('q');
  if (q && q.trim()) p.q = q.trim();
  if (sp.get('includeExpired') === '1' || sp.get('includeExpired') === 'true') p.includeExpired = true;
  const sort = sp.get('sort');
  if (sort === 'deadline_asc' || sort === 'deadline_desc' || sort === 'newest' || sort === 'tier_desc') {
    p.sort = sort;
  }
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
    if (p.industry) {
      // 生値の完全一致か、集約グループ名の一致のどちらかで通す
      const raw = e.company.industry;
      if (raw !== p.industry && industryGroupOf(raw) !== p.industry) return false;
    }
    if (p.tier && e.company.tier !== p.tier) return false;
    if (p.tierAtLeast && compareTier(e.company.tier, p.tierAtLeast) > 0) return false;
    if (p.daysWithin !== undefined) {
      if (expired) return false;
      if (daysUntil(e.deadlineAt, now) > p.daysWithin) return false;
    }
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
  } else if (sort === 'tier_desc') {
    // 難関順（SS+ が先頭）。同Tier内は締切が近い順
    list = [...list].sort(
      (a, b) => compareTier(a.company.tier, b.company.tier) || byDeadlineAsc(a, b),
    );
  } else {
    list = [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return list;
}
