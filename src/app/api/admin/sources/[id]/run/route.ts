import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { runSource } from '@/lib/sources';

export const dynamic = 'force-dynamic';

/** POST /api/admin/sources/[id]/run — 指定した取込元を今すぐ実行する */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const source = await store.getSource(id);
  if (!source) {
    return NextResponse.json({ error: '指定された取込元が見つかりません' }, { status: 404 });
  }

  const result = await runSource(source, store);
  return NextResponse.json({ result });
}
