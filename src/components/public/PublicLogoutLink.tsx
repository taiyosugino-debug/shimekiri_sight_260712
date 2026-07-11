'use client';

import { useState } from 'react';

/** 公開サイトのサインアウト用リンク。/api/public/logout を叩いてログイン画面へ戻す。 */
export default function PublicLogoutLink() {
  const [busy, setBusy] = useState(false);
  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/public/logout', { method: 'POST' });
    } catch {
      // 失敗してもログイン画面へ誘導する
    }
    window.location.href = '/login';
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="text-slate-400 hover:text-slate-600 hover:underline disabled:opacity-50"
    >
      {busy ? 'サインアウト中…' : 'サインアウト'}
    </button>
  );
}
