// =============================================================
// 認証ミドルウェア
//  - 管理エリア（/admin, /api/admin）: 管理者Cookie（既存仕様）
//  - 公開エリア（上記以外のページ・API）: 公開サイト用サインインCookie
//    ※ カレンダー配信(/api/ical)と cron(/api/cron) は外部/機械アクセス用途のため認証不要
// Edge ランタイムで動作するため auth.ts 同様に Web Crypto のみを利用する。
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  PUBLIC_COOKIE_NAME,
  verifyAdminCookieValue,
  verifyPublicCookieValue,
} from '@/lib/auth';

export const config = {
  // _next 配下と favicon 以外の全ルートで実行する
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- 管理エリア（管理者認証・既存仕様）----
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (pathname === '/admin/login' || pathname === '/api/admin/login') {
      return NextResponse.next();
    }
    const ok = await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
    if (ok) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ---- 認証不要（公開ログイン導線・カレンダー配信・cron）----
  if (
    pathname === '/login' ||
    pathname === '/api/public/login' ||
    pathname.startsWith('/api/ical') ||
    pathname.startsWith('/api/cron')
  ) {
    return NextResponse.next();
  }

  // ---- 公開エリア（サインイン必須）----
  const publicOk = await verifyPublicCookieValue(request.cookies.get(PUBLIC_COOKIE_NAME)?.value);
  // 管理者としてログイン済みのスタッフは公開側も閲覧可（二重ログイン回避）
  const adminOk = publicOk
    ? true
    : await verifyAdminCookieValue(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  if (publicOk || adminOk) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'サインインが必要です' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}
