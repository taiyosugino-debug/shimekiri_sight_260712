// =============================================================
// ICS誘導バナー — カレンダー連携（/about）への案内
// =============================================================

'use client';

import Link from 'next/link';

export default function IcalPromoBanner() {
  return (
    <Link
      href="/about"
      className="card mb-4 flex items-center justify-between gap-2 p-3 text-sm transition-colors hover:bg-brand-50"
    >
      <span className="text-slate-700">
        <span aria-hidden="true">📅</span> 締切をGoogle/iPhoneカレンダーに自動反映
      </span>
      <span className="shrink-0 font-medium text-brand-600">使い方 →</span>
    </Link>
  );
}
