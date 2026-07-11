// =============================================================
// 公開サイト共通フッター — 免責 + コピーライト + 社内管理リンク
// =============================================================

import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-500">
        <p className="mb-3 leading-relaxed">
          掲載している締切情報は自動取込・手動登録により随時更新していますが、内容の正確性を保証するものではありません。
          エントリーの際は必ず各企業の公式サイト・採用ページで最新の締切をご確認ください。
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>© Abuild</p>
          <Link href="/admin" className="text-slate-400 hover:text-slate-600 hover:underline">
            社内管理
          </Link>
        </div>
      </div>
    </footer>
  );
}
