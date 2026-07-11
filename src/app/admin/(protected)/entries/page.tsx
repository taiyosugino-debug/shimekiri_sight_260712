'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EntryStatus, EntryWithCompany } from '@/lib/types';
import { adminFetch, errorMessage } from '@/components/admin/adminApi';
import EntryTable from '@/components/admin/EntryTable';
import { ErrorBanner, LoadingBlock } from '@/components/admin/Feedback';

type TabKey = 'all' | EntryStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'published', label: '公開中' },
  { key: 'draft', label: '承認待ち' },
  { key: 'archived', label: 'アーカイブ' },
];

interface EntriesResponse {
  entries: EntryWithCompany[];
}

export default function AdminEntriesPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<EntryWithCompany[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (statusTab: TabKey, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusTab !== 'all') params.set('status', statusTab);
      if (q.trim()) params.set('q', q.trim());
      const qs = params.toString();
      const res = await adminFetch<EntriesResponse>(`/api/admin/entries${qs ? `?${qs}` : ''}`);
      setEntries(res.entries);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // 検索は入力のたびに軽くデバウンスして再取得
  useEffect(() => {
    const timer = setTimeout(() => {
      load(tab, query);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const reload = useCallback(() => load(tab, query), [load, tab, query]);

  const countLabel = useMemo(() => {
    if (entries === null) return '';
    return `${entries.length}件`;
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">締切管理</h1>
          <p className="mt-1 text-sm text-slate-500">登録済みの締切データを確認・編集します。</p>
        </div>
        <Link href="/admin/entries/new" className="btn-primary">
          ＋ 新規追加
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="input max-w-xs"
          placeholder="企業名・タイトルで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {entries !== null && <span className="text-xs text-slate-400">{countLabel}</span>}
      </div>

      <ErrorBanner message={error} />

      {loading && entries === null ? (
        <LoadingBlock />
      ) : (
        <EntryTable entries={entries ?? []} onChanged={reload} />
      )}
    </div>
  );
}
