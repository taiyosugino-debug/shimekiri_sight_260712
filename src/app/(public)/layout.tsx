// =============================================================
// 公開サイト共通レイアウト — ヘッダー/免責バー/デモバナー/フッター
// =============================================================

import { isDemo } from '@/lib/store';
import SiteHeader from '@/components/public/SiteHeader';
import SiteFooter from '@/components/public/SiteFooter';
import DisclaimerBar from '@/components/public/DisclaimerBar';
import DemoBanner from '@/components/public/DemoBanner';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemo();

  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerBar />
      <SiteHeader />
      {demo && <DemoBanner />}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
