import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { isCompanySize, isIndustry } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/admin/companies — 企業一覧を返す */
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const store = getStore();
  const companies = await store.listCompanies();
  return NextResponse.json({ companies });
}

/** POST /api/admin/companies — 企業を新規作成する */
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const name = b.name;
  const industry = b.industry;
  const size = b.size;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: '企業名を入力してください' }, { status: 400 });
  }
  if (!isIndustry(industry)) {
    return NextResponse.json({ error: '業界が不正です' }, { status: 400 });
  }
  if (!isCompanySize(size)) {
    return NextResponse.json({ error: '企業規模が不正です' }, { status: 400 });
  }

  const hpUrl = b.hpUrl;
  const note = b.note;
  if (hpUrl !== undefined && hpUrl !== null && typeof hpUrl !== 'string') {
    return NextResponse.json({ error: 'HP URL が不正です' }, { status: 400 });
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return NextResponse.json({ error: '備考が不正です' }, { status: 400 });
  }

  const store = getStore();
  const company = await store.createCompany({
    name: name.trim(),
    industry,
    size,
    hpUrl: typeof hpUrl === 'string' && hpUrl.trim() ? hpUrl.trim() : undefined,
    note: typeof note === 'string' && note.trim() ? note.trim() : undefined,
  });

  return NextResponse.json({ company });
}
