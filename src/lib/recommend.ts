// =============================================================
// おすすめ企業ロジック — 企業個別（締切詳細）ページ用
// 「業界 ＋ 企業規模」の一致度でスコアリングし、別企業を最大 limit 件返す。
//   - 同業界: +2 / 同規模: +1（両方一致が最優先）
//   - 表示中の企業自身・非公開・締切済みは除外
//   - 1 企業につき最も締切が近い published 1 件に集約（企業単位のおすすめ）
// =============================================================

import { Company, Entry, EntryWithCompany } from './types';
import { isExpired } from './date';

interface Scored {
  entry: EntryWithCompany;
  score: number;
}

export function recommendEntries(
  current: EntryWithCompany,
  entries: Entry[],
  companies: Company[],
  now: Date = new Date(),
  limit = 3,
): EntryWithCompany[] {
  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const bestPerCompany = new Map<string, Scored>();

  for (const e of entries) {
    if (e.status !== 'published') continue;
    if (e.companyId === current.companyId) continue;
    if (isExpired(e.deadlineAt, now)) continue;

    const company = companyMap.get(e.companyId);
    if (!company) continue;

    const sameIndustry = company.industry === current.company.industry;
    const sameSize = company.size === current.company.size;
    const score = (sameIndustry ? 2 : 0) + (sameSize ? 1 : 0);
    if (score === 0) continue; // 業界も規模も一致しないものは出さない

    const candidate: Scored = { entry: { ...e, company }, score };
    const prev = bestPerCompany.get(e.companyId);
    if (
      !prev ||
      score > prev.score ||
      (score === prev.score &&
        new Date(e.deadlineAt).getTime() < new Date(prev.entry.deadlineAt).getTime())
    ) {
      bestPerCompany.set(e.companyId, candidate);
    }
  }

  return [...bestPerCompany.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.entry.deadlineAt).getTime() - new Date(b.entry.deadlineAt).getTime(),
    )
    .slice(0, limit)
    .map((s) => s.entry);
}
