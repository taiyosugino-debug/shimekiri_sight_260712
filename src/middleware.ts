// =============================================================
// 管理画面・管理APIの認証ミドルウェア（PROJECT_SPEC.md §6）
// Edge ランタイムで動作するため auth.ts 同様に Web Crypto のみを利用する。
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from '@/lib/auth';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ログインページ・ログイン API は認証不要
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const authorized = await verifyAdminCookieValue(cookieValue);

  if (authorized) {
    return NextResponse.next();
  }

  // API は 401 JSON、ページはログインへリダイレクト
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}
