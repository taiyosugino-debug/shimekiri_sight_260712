import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { joinCompanies } from '@/lib/filters';

export const dynamic = 'force-dynamic';

/** GET /api/entries — published のみ全件（期限切れ含む）。deadline 昇順。 */
export async function GET() {
  const store = getStore();
  const [entries, companies] = await Promise.all([store.listEntries(), store.listCompanies()]);
  const published = entries.filter((e) => e.status === 'published');
  const withCompany = joinCompanies(published, companies).sort(
    (a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime(),
  );
  return NextResponse.json({ entries: withCompany });
}
