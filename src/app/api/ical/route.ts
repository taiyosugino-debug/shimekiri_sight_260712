import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { applyFilters, joinCompanies, parseFilterParams } from '@/lib/filters';
import { buildIcs } from '@/lib/ics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ical — フィルタ条件に合致する published かつ未経過のエントリーを ICS 形式で返す。
 * クエリパラメータ: type, gradYear, size, industry, daysWithin, difficultyMin, q
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = getStore();
  const [entries, companies] = await Promise.all([store.listEntries(), store.listCompanies()]);
  const published = entries.filter((e) => e.status === 'published');
  const withCompany = joinCompanies(published, companies);

  const filterParams = parseFilterParams(url.searchParams);
  // ICS は「未経過のみ」を必ず含める（includeExpired は無視）
  const filtered = applyFilters(withCompany, { ...filterParams, includeExpired: false });

  const ics = buildIcs(filtered);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="abuild-shimekiri-navi.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
