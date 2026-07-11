import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { daysUntil, isExpired } from '@/lib/date';
import { ENTRY_TYPES, EntryType, Stats } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/admin/stats — ダッシュボード用の集計値 */
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const store = getStore();
  const [entries, companies] = await Promise.all([store.listEntries(), store.listCompanies()]);

  const byType = ENTRY_TYPES.reduce((acc, t) => {
    acc[t] = 0;
    return acc;
  }, {} as Record<EntryType, number>);

  let published = 0;
  let draft = 0;
  let archived = 0;
  let expiring7 = 0;
  let pickup = 0;

  const now = new Date();
  for (const e of entries) {
    if (e.status === 'published') {
      published += 1;
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      if (!isExpired(e.deadlineAt, now)) {
        const d = daysUntil(e.deadlineAt, now);
        if (d >= 0 && d <= 7) expiring7 += 1;
      }
      // 注目件数は「公開中」のみ数える（ダッシュボードの意図に合わせる）
      if (e.pickup) pickup += 1;
    } else if (e.status === 'draft') {
      draft += 1;
    } else if (e.status === 'archived') {
      archived += 1;
    }
  }

  const stats: Stats = {
    total: entries.length,
    published,
    draft,
    archived,
    expiring7,
    pickup,
    companies: companies.length,
    byType,
  };

  return NextResponse.json({ stats });
}
