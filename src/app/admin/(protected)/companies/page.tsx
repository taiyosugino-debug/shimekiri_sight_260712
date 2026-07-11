'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Company, CompanySize, COMPANY_SIZES, Industry, INDUSTRIES } from '@/lib/types';
import { adminFetch, errorMessage } from '@/components/admin/adminApi';
import CompanyRow from '@/components/admin/CompanyRow';
import { ErrorBanner, LoadingBlock, EmptyBlock } from '@/components/admin/Feedback';

interface CompaniesResponse {
  companies: Company[];
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<Industry>(INDUSTRIES[0]);
  const [size, setSize] = useState<CompanySize>(COMPANY_SIZES[0]);
  const [hpUrl, setHpUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<CompaniesResponse>('/api/admin/companies');
      setCompanies(res.companies);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...(companies ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [companies],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError('企業名を入力してください。');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await adminFetch('/api/admin/companies', {
        method: 'POST',
        body: { name: name.trim(), industry, size, hpUrl: hpUrl.trim() || undefined },
      });
      setName('');
      setHpUrl('');
      await load();
    } catch (e) {
      setCreateError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">企業管理</h1>
        <p className="mt-1 text-sm text-slate-500">締切データに紐づく企業マスタを管理します。</p>
      </div>

      <form onSubmit={handleCreate} className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-slate-900">新規企業を追加</h2>
        <ErrorBanner message={createError} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="newName" className="label">
              企業名
            </label>
            <input id="newName" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="newIndustry" className="label">
              業界
            </label>
            <select
              id="newIndustry"
              className="input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry)}
            >
              {INDUSTRIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="newSize" className="label">
              企業規模
            </label>
            <select id="newSize" className="input" value={size} onChange={(e) => setSize(e.target.value as CompanySize)}>
              {COMPANY_SIZES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="newHpUrl" className="label">
              HP URL（任意）
            </label>
            <input id="newHpUrl" className="input" value={hpUrl} onChange={(e) => setHpUrl(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={creating}>
          {creating ? '追加中…' : '＋ 企業を追加'}
        </button>
      </form>

      <ErrorBanner message={error} />

      {loading && companies === null ? (
        <LoadingBlock />
      ) : sorted.length === 0 ? (
        <EmptyBlock label="登録されている企業がありません。" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">企業名</th>
                <th className="px-3 py-2 text-left font-medium">業界</th>
                <th className="px-3 py-2 text-left font-medium">規模</th>
                <th className="px-3 py-2 text-left font-medium">HP</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <CompanyRow key={c.id} company={c} onChanged={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
