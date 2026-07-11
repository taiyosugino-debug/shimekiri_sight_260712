import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { importCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/** POST /api/admin/import — CSV を取り込む（dryrun / commit） */
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

  const csv = b.csv;
  const mode = b.mode;
  const defaultStatus = b.defaultStatus;

  if (typeof csv !== 'string' || csv.trim().length === 0) {
    return NextResponse.json({ error: 'CSVデータを入力してください' }, { status: 400 });
  }
  if (mode !== 'dryrun' && mode !== 'commit') {
    return NextResponse.json({ error: 'mode は dryrun または commit を指定してください' }, { status: 400 });
  }
  if (defaultStatus !== 'draft' && defaultStatus !== 'published') {
    return NextResponse.json({ error: 'defaultStatus は draft または published を指定してください' }, { status: 400 });
  }

  const store = getStore();
  const result = await importCsv(store, csv, mode, defaultStatus);

  return NextResponse.json(result);
}
