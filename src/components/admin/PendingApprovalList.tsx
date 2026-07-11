'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EntryWithCompany } from '@/lib/types';
import { formatDeadline } from '@/lib/date';
import { adminFetch, errorMessage } from './adminApi';
import { EmptyBlock } from './Feedback';

interface Props {
  entries: EntryWithCompany[];
  onChanged: () => void;
}

/** ダッシュボードの「承認待ち」リスト。承認・編集・削除を行う。 */
export default function PendingApprovalList({ entries, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await adminFetch(`/api/admin/entries/${id}`, {
        method: 'PATCH',
        body: { status: 'published' },
      });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('この締切データを削除しますか？この操作は取り消せません。')) return;
    setError(null);
    setBusyId(id);
    try {
      await adminFetch(`/api/admin/entries/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (entries.length === 0) {
    return <EmptyBlock label="承認待ちの締切データはありません。" />;
  }

  return (
    <div className="card divide-y divide-slate-100">
      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50">{error}</div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-900">
              {entry.company.name}｜{entry.title}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {entry.type}・{entry.gradYear}卒・締切 {formatDeadline(entry.deadlineAt)}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={busyId === entry.id}
              onClick={() => handleApprove(entry.id)}
            >
              ✅ 承認して公開
            </button>
            <Link href={`/admin/entries/${entry.id}`} className="btn-ghost text-xs">
              編集
            </Link>
            <button
              type="button"
              className="btn-danger text-xs"
              disabled={busyId === entry.id}
              onClick={() => handleDelete(entry.id)}
            >
              削除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
