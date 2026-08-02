import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { importCompanyCsv } from '@/lib/companyCsv';

export const dynamic = 'force-dynamic';
// 500社ぶんの upsert はシートへの書き込みが多く時間がかかる
export const maxDuration = 60;

/** POST /api/admin/companies/import — 企業マスターCSVを取り込む（dryrun / commit） */
export async function POST(request: Request) {
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

  if (typeof b.csv !== 'string' || b.csv.trim().length === 0) {
    return NextResponse.json({ error: 'CSVデータを入力してください' }, { status: 400 });
  }
  if (b.mode !== 'dryrun' && b.mode !== 'commit') {
    return NextResponse.json({ error: 'mode は dryrun または commit を指定してください' }, { status: 400 });
  }

  const store = getStore();
  const result = await importCompanyCsv(store, b.csv, b.mode);
  return NextResponse.json(result);
}
