// =============================================================
// フィルタバー — 種別/卒年/業界/採用難易度Tier/残り日数をselectで、
// フリーワード検索・ソート・締切済み表示・条件クリアを提供する
// =============================================================

'use client';

import { ENTRY_TYPES, GRAD_YEARS, TIERS } from '@/lib/types';
import { INDUSTRY_GROUPS } from '@/lib/industry';
import { SortKey } from '@/lib/filters';

export interface FilterState {
  type: string;
  gradYear: string;
  industry: string;
  tierAtLeast: string;
  daysWithin: string;
  q: string;
  includeExpired: boolean;
  sort: SortKey;
}

export const INITIAL_FILTER_STATE: FilterState = {
  type: '',
  gradYear: '',
  industry: '',
  tierAtLeast: '',
  daysWithin: '',
  q: '',
  includeExpired: false,
  sort: 'deadline_asc',
};

interface FilterBarProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClear: () => void;
}

const DAYS_WITHIN_OPTIONS = [3, 7, 14, 30];


export default function FilterBar({ value, onChange, onClear }: FilterBarProps) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className="card mb-4 p-3">
      {/* フリーワード検索 */}
      <div className="mb-3">
        <label className="label" htmlFor="entry-search-q">
          フリーワード検索
        </label>
        <input
          id="entry-search-q"
          type="search"
          className="input"
          placeholder="企業名・タイトルで検索"
          value={value.q}
          onChange={(e) => set('q', e.target.value)}
        />
      </div>

      {/* select群（モバイルは横スクロール） */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
        <div className="w-32 shrink-0">
          <label className="label" htmlFor="filter-type">
            種別
          </label>
          <select
            id="filter-type"
            className="input"
            value={value.type}
            onChange={(e) => set('type', e.target.value)}
          >
            <option value="">すべて</option>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="w-28 shrink-0">
          <label className="label" htmlFor="filter-gradYear">
            卒年
          </label>
          <select
            id="filter-gradYear"
            className="input"
            value={value.gradYear}
            onChange={(e) => set('gradYear', e.target.value)}
          >
            <option value="">すべて</option>
            {GRAD_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}卒
              </option>
            ))}
          </select>
        </div>

        <div className="w-52 shrink-0">
          <label className="label" htmlFor="filter-industry">
            業界
          </label>
          <select
            id="filter-industry"
            className="input"
            value={value.industry}
            onChange={(e) => set('industry', e.target.value)}
          >
            <option value="">すべて</option>
            {INDUSTRY_GROUPS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36 shrink-0">
          <label className="label" htmlFor="filter-daysWithin">
            残り日数
          </label>
          <select
            id="filter-daysWithin"
            className="input"
            value={value.daysWithin}
            onChange={(e) => set('daysWithin', e.target.value)}
          >
            <option value="">指定なし</option>
            {DAYS_WITHIN_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}日以内
              </option>
            ))}
          </select>
        </div>

        <div className="w-40 shrink-0">
          <label className="label" htmlFor="filter-tierAtLeast">
            採用難易度
          </label>
          <select
            id="filter-tierAtLeast"
            className="input"
            value={value.tierAtLeast}
            onChange={(e) => set('tierAtLeast', e.target.value)}
          >
            <option value="">指定なし</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}以上
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ソート・締切済み表示・クリア */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="w-40">
          <label className="label" htmlFor="filter-sort">
            並び替え
          </label>
          <select
            id="filter-sort"
            className="input"
            value={value.sort}
            onChange={(e) => set('sort', e.target.value as SortKey)}
          >
            <option value="deadline_asc">締切が近い順</option>
            <option value="deadline_desc">締切が遠い順</option>
            <option value="newest">新着順</option>
            <option value="tier_desc">難関順（SS+から）</option>
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            checked={value.includeExpired}
            onChange={(e) => set('includeExpired', e.target.checked)}
          />
          締切済みも表示
        </label>

        <button type="button" className="btn-ghost" onClick={onClear}>
          条件クリア
        </button>
      </div>
    </div>
  );
}
