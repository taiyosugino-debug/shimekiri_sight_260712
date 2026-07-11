// =============================================================
// 公開サイト共通ヘッダー — sticky、ロゴ + サブコピー + ナビ
// =============================================================

import Link from 'next/link';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/types';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
        <Link href="/" className="min-w-0 shrink">
          <p className="truncate text-sm font-bold text-slate-900 sm:text-base">{SITE_NAME}</p>
          <p className="truncate text-[10px] text-slate-500 sm:text-xs">{SITE_TAGLINE}</p>
        </Link>
        <nav className="flex shrink-0 items-center gap-0.5 text-xs sm:gap-1 sm:text-sm">
          <Link
            href="/"
            className="whitespace-nowrap rounded-lg px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-100 sm:px-2.5"
          >
            締切一覧
          </Link>
          <Link
            href="/about"
            className="whitespace-nowrap rounded-lg px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-100 sm:px-2.5"
          >
            使い方
          </Link>
        </nav>
      </div>
    </header>
  );
}
