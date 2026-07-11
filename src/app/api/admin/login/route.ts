import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminCookieValue,
  getAdminPassword,
  timingSafeEqual,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/admin/login — body { password } を検証し、成功時に管理用 Cookie を発行する */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }

  const password = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).password : undefined;
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'パスワードを入力してください' }, { status: 400 });
  }

  if (!timingSafeEqual(password, getAdminPassword())) {
    return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 });
  }

  const value = await createAdminCookieValue();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, value, adminCookieOptions());

  return NextResponse.json({ ok: true });
}
