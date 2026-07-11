'use client';

import { useCallback, useEffect, useState } from 'react';
import { Source } from '@/lib/types';
import { adminFetch, errorMessage } from '@/components/admin/adminApi';
import SourceForm from '@/components/admin/SourceForm';
import SourceRow from '@/components/admin/SourceRow';
import { ErrorBanner, LoadingBlock, EmptyBlock } from '@/components/admin/Feedback';

interface SourcesResponse {
  sources: Source[];
}

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<SourcesResponse>('/api/admin/sources');
      setSources(res.sources);
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
        <h1 className="text-xl font-bold text-slate-900">自動取込</h1>
        <p className="mt-1 text-sm text-slate-500">RSS・JSON・スクレイピングによる自動取込元を管理します。</p>
      </div>

      <div className="card space-y-1 border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        <p>・取込データは承認待ち（下書き）として入ります。ダッシュボードで承認してください。</p>
        <p>・取得先の robots.txt・利用規約を必ず確認してください。</p>
      </div>

      <ErrorBanner message={error} />

      {loading && sources === null ? (
        <LoadingBlock />
      ) : sources && sources.length === 0 ? (
        <EmptyBlock label="登録されている取込元がありません。" />
      ) : (
        <div className="space-y-3">
          {(sources ?? []).map((s) => (
            <SourceRow key={s.id} source={s} onChanged={load} />
          ))}
        </div>
      )}

      <SourceForm onCreated={load} />
    </div>
  );
}
