import { NextResponse } from 'next/server';
import { getStore, isDemo } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** GET /api/meta — 現在のデータバックエンド種別とデモモード判定を返す */
export async function GET() {
  const store = getStore();
  return NextResponse.json({ backend: store.backendName, demo: isDemo() });
}
