import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { joinCompanies } from '@/lib/filters';

export const dynamic = 'force-dynamic';

/** GET /api/entries/[id] — published のエントリーのみ返す（それ以外は404） */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const entry = await store.getEntry(id);
  if (!entry || entry.status !== 'published') {
    return NextResponse.json({ error: '締切情報が見つかりません' }, { status: 404 });
  }
  const company = await store.getCompany(entry.companyId);
  if (!company) {
    return NextResponse.json({ error: '締切情報が見つかりません' }, { status: 404 });
  }
  const [withCompany] = joinCompanies([entry], [company]);
  return NextResponse.json({ entry: withCompany });
}
