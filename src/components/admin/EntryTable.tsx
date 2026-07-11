'use client';

import Link from 'next/link';
import { useState } from 'react';
import { difficultyStars, EntryWithCompany } from '@/lib/types';
import { formatDeadline, isExpired } from '@/lib/date';
import { adminFetch, errorMessage } from './adminApi';
import { StatusBadge } from './StatusBadge';
import { EmptyBlock } from './Feedback';

interface Props {
  entries: EntryWithCompany[];
  onChanged: () => void;
}

/** 締切管理ページのテーブル（モバイルはカード表示）。行アクション: 公開⇄下書き、注目、編集、削除。 */
export default function EntryTable({ entries, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTogglePublish(entry: EntryWithCompany) {
    setError(null);
    setBusyId(entry.id);
    try {
      const nextStatus = entry.status === 'published' ? 'draft' : 'published';
      await adminFetch(`/api/admin/entries/${entry.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleTogglePickup(entry: EntryWithCompany) {
    setError(null);
    setBusyId(entry.id);
    try {
      await adminFetch(`/api/admin/entries/${entry.id}`, {
        method: 'PATCH',
        body: { pickup: !entry.pickup },
      });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(entry: EntryWithCompany) {
    if (!window.confirm(`「${entry.company.name}｜${entry.title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    setError(null);
    setBusyId(entry.id);
    try {
      await adminFetch(`/api/admin/entries/${entry.id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (entries.length === 0) {
    return <EmptyBlock label="条件に一致する締切データがありません。" />;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* モバイル: カード表示 */}
      <div className="space-y-2 md:hidden">
        {entries.map((entry) => {
          const expired = isExpired(entry.deadlineAt);
          return (
            <div key={entry.id} className={`card p-3 ${expired ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {entry.company.name}｜{entry.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {entry.type}・{entry.gradYear}卒・{formatDeadline(entry.deadlineAt)}
                  </div>
                  <div className="mt-1 text-xs text-amber-500">{difficultyStars(entry.difficulty)}</div>
                </div>
                <StatusBadge status={entry.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busyId === entry.id}
                  onClick={() => handleTogglePublish(entry)}
                >
                  {entry.status === 'published' ? '下書きに戻す' : '公開する'}
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busyId === entry.id}
                  onClick={() => handleTogglePickup(entry)}
                >
                  {entry.pickup ? '⭐ 注目' : '☆ 注目'}
                </button>
                <Link href={`/admin/entries/${entry.id}`} className="btn-ghost text-xs">
                  編集
                </Link>
                <button
                  type="button"
                  className="btn-danger text-xs"
                  disabled={busyId === entry.id}
                  onClick={() => handleDelete(entry)}
                >
                  削除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* デスクトップ: テーブル表示 */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">締切</th>
              <th className="px-3 py-2 text-left font-medium">企業・タイトル</th>
              <th className="px-3 py-2 text-left font-medium">種別</th>
              <th className="px-3 py-2 text-left font-medium">卒年</th>
              <th className="px-3 py-2 text-left font-medium">難易度</th>
              <th className="px-3 py-2 text-left font-medium">ステータス</th>
              <th className="px-3 py-2 text-left font-medium">注目</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const expired = isExpired(entry.deadlineAt);
              return (
                <tr key={entry.id} className={expired ? 'opacity-60' : ''}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {formatDeadline(entry.deadlineAt)}
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    <div className="truncate font-medium text-slate-900">{entry.company.name}</div>
                    <div className="truncate text-xs text-slate-500">{entry.title}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{entry.type}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{entry.gradYear}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-amber-500">
                    {difficultyStars(entry.difficulty)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => handleTogglePickup(entry)}
                      title="注目切り替え"
                      className="text-lg leading-none disabled:opacity-50"
                    >
                      {entry.pickup ? '⭐' : '☆'}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={busyId === entry.id}
                        onClick={() => handleTogglePublish(entry)}
                      >
                        {entry.status === 'published' ? '下書きに戻す' : '公開する'}
                      </button>
                      <Link href={`/admin/entries/${entry.id}`} className="btn-ghost text-xs">
                        編集
                      </Link>
                      <button
                        type="button"
                        className="btn-danger text-xs"
                        disabled={busyId === entry.id}
                        onClick={() => handleDelete(entry)}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
