// =============================================================
// フィルタバー — 種別/卒年/企業規模/業界/残り日数/難易度をselectで、
// フリーワード検索・ソート・締切済み表示・条件クリアを提供する
// =============================================================

'use client';

import { COMPANY_SIZES, ENTRY_TYPES, GRAD_YEARS, INDUSTRIES } from '@/lib/types';
import { SortKey } from '@/lib/filters';

export interface FilterState {
  type: string;
  gradYear: string;
  size: string;
  industry: string;
  daysWithin: string;
  difficultyMin: string;
  q: string;
  includeExpired: boolean;
  sort: SortKey;
}

export const INITIAL_FILTER_STATE: FilterState = {
  type: '',
  gradYear: '',
  size: '',
  industry: '',
  daysWithin: '',
  difficultyMin: '',
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
const DIFFICULTY_OPTIONS = [2, 3, 4, 5];

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

        <div className="w-36 shrink-0">
          <label className="label" htmlFor="filter-size">
            企業規模
          </label>
          <select
            id="filter-size"
            className="input"
            value={value.size}
            onChange={(e) => set('size', e.target.value)}
          >
            <option value="">すべて</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32 shrink-0">
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
            {INDUSTRIES.map((i) => (
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

        <div className="w-32 shrink-0">
          <label className="label" htmlFor="filter-difficultyMin">
            難易度
          </label>
          <select
            id="filter-difficultyMin"
            className="input"
            value={value.difficultyMin}
            onChange={(e) => set('difficultyMin', e.target.value)}
          >
            <option value="">指定なし</option>
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                ★{d}以上
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
