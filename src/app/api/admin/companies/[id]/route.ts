import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { CompanyInput, isCompanySize, isIndustry } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/companies/[id] — 企業情報の部分更新 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const existing = await store.getCompany(id);
  if (!existing) {
    return NextResponse.json({ error: '指定された企業が見つかりません' }, { status: 404 });
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

  const patch: Partial<CompanyInput> = {};

  if ('name' in b) {
    const name = b.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '企業名を入力してください' }, { status: 400 });
    }
    patch.name = name.trim();
  }

  if ('industry' in b) {
    const industry = b.industry;
    if (!isIndustry(industry)) {
      return NextResponse.json({ error: '業界が不正です' }, { status: 400 });
    }
    patch.industry = industry;
  }

  if ('size' in b) {
    const size = b.size;
    if (!isCompanySize(size)) {
      return NextResponse.json({ error: '企業規模が不正です' }, { status: 400 });
    }
    patch.size = size;
  }

  if ('hpUrl' in b) {
    const hpUrl = b.hpUrl;
    if (hpUrl !== undefined && hpUrl !== null && typeof hpUrl !== 'string') {
      return NextResponse.json({ error: 'HP URL が不正です' }, { status: 400 });
    }
    patch.hpUrl = typeof hpUrl === 'string' && hpUrl.trim() ? hpUrl.trim() : undefined;
  }

  if ('note' in b) {
    const note = b.note;
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return NextResponse.json({ error: '備考が不正です' }, { status: 400 });
    }
    patch.note = typeof note === 'string' && note.trim() ? note.trim() : undefined;
  }

  const updated = await store.updateCompany(id, patch);
  if (!updated) {
    return NextResponse.json({ error: '指定された企業が見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ company: updated });
}

/** DELETE /api/admin/companies/[id] — 参照 entry が残っている場合は削除不可 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const existing = await store.getCompany(id);
  if (!existing) {
    return NextResponse.json({ error: '指定された企業が見つかりません' }, { status: 404 });
  }

  const entries = await store.listEntries();
  const hasEntries = entries.some((e) => e.companyId === id);
  if (hasEntries) {
    return NextResponse.json({ error: 'この企業の締切データが残っています' }, { status: 400 });
  }

  const ok = await store.deleteCompany(id);
  if (!ok) {
    return NextResponse.json({ error: '指定された企業が見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
