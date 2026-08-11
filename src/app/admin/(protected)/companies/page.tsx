'use client';

import Link from 'next/link';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Company, compareTier, Industry, Tier, TIERS } from '@/lib/types';
import { availableIndustryGroups, industryGroupOf } from '@/lib/industry';
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
  const [industry, setIndustry] = useState<Industry>('');
  const [tier, setTier] = useState<Tier | ''>('');
  const [hpUrl, setHpUrl] = useState('');
  const [recruitUrl, setRecruitUrl] = useState('');
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

  // 616社を一覧するため、絞り込みと並び替えを用意する
  const [q, setQ] = useState('');
  const [filterTier, setFilterTier] = useState<string>('');
  const [filterIndustry, setFilterIndustry] = useState<string>('');
  const [sortKey, setSortKey] = useState<'name' | 'tier'>('tier');

  const industryOptions = useMemo(
    () => availableIndustryGroups((companies ?? []).map((c) => c.industry)),
    [companies],
  );

  const sorted = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = (companies ?? []).filter((c) => {
      if (filterTier && c.tier !== filterTier) return false;
      if (filterIndustry && industryGroupOf(c.industry) !== filterIndustry) return false;
      if (kw && !`${c.name} ${c.industry}`.toLowerCase().includes(kw)) return false;
      return true;
    });
    return list.sort((a, b) =>
      sortKey === 'tier'
        ? compareTier(a.tier, b.tier) || a.name.localeCompare(b.name, 'ja')
        : a.name.localeCompare(b.name, 'ja'),
    );
  }, [companies, q, filterTier, filterIndustry, sortKey]);

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
        body: {
          name: name.trim(),
          industry,
          ...(tier ? { tier } : {}),
          hpUrl: hpUrl.trim() || undefined,
          recruitUrl: recruitUrl.trim() || undefined,
        },
      });
      setName('');
      setHpUrl('');
      setRecruitUrl('');
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
            <input
              id="newIndustry"
              className="input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry)}
              placeholder="616社シートの業界（例: 外資コンサル）"
            />
          </div>
          <div>
            <label htmlFor="newTier" className="label">
              採用難易度Tier
            </label>
            <select id="newTier" className="input" value={tier} onChange={(e) => setTier(e.target.value as Tier | '')}>
              <option value="">未設定</option>
              {TIERS.map((v) => (
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
          <div>
            <label htmlFor="newRecruitUrl" className="label">
              採用ページURL（任意・週次巡回の対象）
            </label>
            <input
              id="newRecruitUrl"
              className="input"
              value={recruitUrl}
              onChange={(e) => setRecruitUrl(e.target.value)}
              placeholder="https://example.co.jp/recruit/"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? '追加中…' : '＋ 企業を追加'}
          </button>
          <Link href="/admin/companies/import" className="text-sm text-brand-600 hover:underline">
            CSVでまとめて登録・更新する ↗
          </Link>
        </div>
      </form>

      <ErrorBanner message={error} />

      {/* 616社を扱うための絞り込み */}
      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="companyQ">企業名・業界で検索</label>
          <input id="companyQ" className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-40">
          <label className="label" htmlFor="companyTier">Tier</label>
          <select id="companyTier" className="input" value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
            <option value="">すべて</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="w-56">
          <label className="label" htmlFor="companyIndustry">業界</label>
          <select id="companyIndustry" className="input" value={filterIndustry} onChange={(e) => setFilterIndustry(e.target.value)}>
            <option value="">すべて</option>
            {industryOptions.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="label" htmlFor="companySort">並び替え</label>
          <select id="companySort" className="input" value={sortKey} onChange={(e) => setSortKey(e.target.value as 'name' | 'tier')}>
            <option value="tier">難関順</option>
            <option value="name">企業名順</option>
          </select>
        </div>
        <p className="ml-auto text-sm text-slate-500">
          {sorted.length}社 / 全{(companies ?? []).length}社
        </p>
      </div>

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
                <th className="px-3 py-2 text-left font-medium">採用難易度</th>
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
