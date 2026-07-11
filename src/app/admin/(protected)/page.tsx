'use client';

import { useCallback, useEffect, useState } from 'react';
import { EntryWithCompany, Stats } from '@/lib/types';
import { adminFetch, errorMessage } from '@/components/admin/adminApi';
import { StatCard } from '@/components/admin/StatCard';
import PendingApprovalList from '@/components/admin/PendingApprovalList';
import SlackDigestPanel from '@/components/admin/SlackDigestPanel';
import { ErrorBanner, LoadingBlock } from '@/components/admin/Feedback';

interface StatsResponse {
  stats: Stats;
}
interface EntriesResponse {
  entries: EntryWithCompany[];
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<EntryWithCompany[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, entriesRes] = await Promise.all([
        adminFetch<StatsResponse>('/api/admin/stats'),
        adminFetch<EntriesResponse>('/api/admin/entries?status=draft'),
      ]);
      setStats(statsRes.stats);
      setPending(entriesRes.entries);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">全体の状況を確認し、承認待ちの締切を公開できます。</p>
      </div>

      <ErrorBanner message={error} />

      {loading && !stats ? (
        <LoadingBlock />
      ) : (
        stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="公開中" value={stats.published} accent="brand" />
            <StatCard label="承認待ち" value={stats.draft} accent="amber" />
            <StatCard label="7日以内締切" value={stats.expiring7} accent="red" />
            <StatCard label="注目" value={stats.pickup} />
            <StatCard label="企業数" value={stats.companies} />
          </div>
        )
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-900">承認待ちリスト</h2>
        {loading && pending === null ? (
          <LoadingBlock />
        ) : (
          <PendingApprovalList entries={pending ?? []} onChanged={load} />
        )}
      </section>

      <section>
        <SlackDigestPanel />
      </section>
    </div>
  );
}
