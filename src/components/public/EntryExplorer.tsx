// =============================================================
// EntryExplorer — 公開一覧のメインUI（フィルタ・ソート・件数・カード/テーブル切替）
// 絞り込みロジックは必ず lib/filters.ts の applyFilters を使用する
// =============================================================

'use client';

import { useMemo, useState } from 'react';
import { applyFilters, FilterParams } from '@/lib/filters';
import { EntryWithCompany, isCompanySize, isEntryType, isIndustry } from '@/lib/types';
import { isExpired } from '@/lib/date';
import FilterBar, { FilterState, INITIAL_FILTER_STATE } from './FilterBar';
import EntryCard from './EntryCard';
import EntryTable from './EntryTable';
import PickupSection from './PickupSection';
import IcalPromoBanner from './IcalPromoBanner';

interface EntryExplorerProps {
  initialEntries: EntryWithCompany[];
  /**
   * デモモードかどうか。
   * デモバナー自体は (public)/layout.tsx が isDemo() を見て表示するため、
   * ここでは現状未使用（将来、一覧内に追加のデモ用UIを出す場合に備えて受け取る）。
   */
  demo?: boolean;
}

/** FilterState（すべて文字列のUI状態）を lib/filters.ts の FilterParams に変換する */
function toFilterParams(state: FilterState): FilterParams {
  const params: FilterParams = {};
  if (isEntryType(state.type)) params.type = state.type;
  if (state.gradYear) {
    const gy = Number(state.gradYear);
    if (Number.isInteger(gy)) params.gradYear = gy;
  }
  if (isCompanySize(state.size)) params.size = state.size;
  if (isIndustry(state.industry)) params.industry = state.industry;
  if (state.daysWithin) {
    const dw = Number(state.daysWithin);
    if (Number.isInteger(dw) && dw > 0) params.daysWithin = dw;
  }
  if (state.difficultyMin) {
    const dm = Number(state.difficultyMin);
    if (Number.isInteger(dm) && dm >= 1 && dm <= 5) params.difficultyMin = dm;
  }
  if (state.q.trim()) params.q = state.q.trim();
  if (state.includeExpired) params.includeExpired = true;
  params.sort = state.sort;
  return params;
}

export default function EntryExplorer({ initialEntries, demo: _demo = false }: EntryExplorerProps) {
  const [filterState, setFilterState] = useState<FilterState>(INITIAL_FILTER_STATE);
  // 一覧中で共有する「現在時刻」。再レンダー間で一貫させるため一度だけ生成する。
  const [now] = useState(() => new Date());

  const pickupEntries = useMemo(
    () => initialEntries.filter((e) => e.pickup && !isExpired(e.deadlineAt, now)),
    [initialEntries, now],
  );

  const filteredEntries = useMemo(() => {
    const params = toFilterParams(filterState);
    return applyFilters(initialEntries, params, now);
  }, [initialEntries, filterState, now]);

  return (
    <div>
      <PickupSection entries={pickupEntries} now={now} />

      <IcalPromoBanner />

      <FilterBar
        value={filterState}
        onChange={setFilterState}
        onClear={() => setFilterState(INITIAL_FILTER_STATE)}
      />

      <p className="mb-3 text-sm font-medium text-slate-600">{filteredEntries.length}件の締切</p>

      {filteredEntries.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          条件に一致する締切が見つかりませんでした。フィルタ条件を変更してみてください。
        </div>
      ) : (
        <>
          {/* モバイル: カード一覧 */}
          <div className="flex flex-col gap-3 md:hidden">
            {filteredEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} now={now} />
            ))}
          </div>

          {/* md以上: テーブル */}
          <div className="card hidden overflow-x-auto md:block">
            <EntryTable entries={filteredEntries} now={now} />
          </div>
        </>
      )}
    </div>
  );
}
