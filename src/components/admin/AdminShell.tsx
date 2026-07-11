'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useDemoMeta } from './useDemoMeta';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'ダッシュボード', icon: '📊' },
  { href: '/admin/entries', label: '締切管理', icon: '🗂️' },
  { href: '/admin/companies', label: '企業', icon: '🏢' },
  { href: '/admin/import', label: 'CSVインポート', icon: '📥' },
  { href: '/admin/sources', label: '自動取込', icon: '🔁' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 管理画面の共通レイアウト: サイドナビ（モバイルは上部タブ）+ デモバナー + ログアウト */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const { meta } = useDemoMeta();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // ログアウトAPIが失敗しても画面遷移は行う
    } finally {
      window.location.href = '/admin/login';
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 上部バー */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">Abuild 締切ナビ</span>
            <span className="badge bg-slate-100 text-slate-600">管理画面</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/" target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs sm:text-sm">
              公開サイトを見る
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="btn-ghost text-xs sm:text-sm"
            >
              {loggingOut ? 'ログアウト中…' : 'ログアウト'}
            </button>
          </div>
        </div>
        {/* モバイル用上部タブナビ */}
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 py-1 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => router.refresh()}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${
                isActive(pathname, item.href)
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {meta?.demo && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 sm:text-sm">
          ⚠️ デモモード（メモリDB）: ここでの変更はサーバー再起動で消えます。本番では DATA_BACKEND=gsheets
          を設定してください
        </div>
      )}

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        {/* デスクトップ用サイドナビ */}
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="card sticky top-24 flex flex-col gap-1 p-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(pathname, item.href)
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
