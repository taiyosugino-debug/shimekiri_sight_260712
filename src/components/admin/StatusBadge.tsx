'use client';

import { EntryStatus, ENTRY_STATUS_LABELS } from '@/lib/types';

/** ステータスをバッジ表示（公開中=緑, 承認待ち=amber, アーカイブ=slate） */
export function StatusBadge({ status }: { status: EntryStatus }) {
  const cls =
    status === 'published'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'draft'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-500';
  return <span className={`badge ${cls}`}>{ENTRY_STATUS_LABELS[status]}</span>;
}
