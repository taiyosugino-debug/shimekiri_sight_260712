import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Abuild 締切ナビ｜インターン・本選考エントリー締切一覧',
  description:
    'インターンシップ・本選考のエントリー締切を一覧で確認できる就活生向け締切ナビゲーションサイトです。企業別・卒業年度別に締切日を検索できます。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
