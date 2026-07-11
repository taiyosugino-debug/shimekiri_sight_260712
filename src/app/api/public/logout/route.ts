import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PUBLIC_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/public/logout — 公開サイト用 Cookie を削除する */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(PUBLIC_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
