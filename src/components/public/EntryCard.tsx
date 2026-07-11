// =============================================================
// エントリーカード — モバイル表示用（一覧のカードレイアウト）
// =============================================================

'use client';

import Link from 'next/link';
import { difficultyStars, EntryWithCompany } from '@/lib/types';
import { formatDeadline } from '@/lib/date';
import DaysBadge from './DaysBadge';

interface EntryCardProps {
  entry: EntryWithCompany;
  now?: Date;
}

export default function EntryCard({ entry, now }: EntryCardProps) {
  return (
    <Link
      href={`/entries/${entry.id}`}
      className="card flex flex-col gap-2 p-4 transition-shadow hover:shadow-md active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{entry.company.name}</p>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-900">{entry.title}</p>
        </div>
        <DaysBadge deadlineAt={entry.deadlineAt} now={now} className="shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>締切 {formatDeadline(entry.deadlineAt)}</span>
        <span aria-hidden="true">・</span>
        <span>{entry.type}</span>
        <span aria-hidden="true">・</span>
        <span>{entry.gradYear}卒</span>
      </div>

      {entry.type === 'インターン' && (entry.eventSchedule || entry.eventPeriod) && (
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-brand-700">
          <span aria-hidden="true">🗓</span>
          <span>
            開催 {entry.eventSchedule}
            {entry.eventPeriod ? `（${entry.eventPeriod}）` : ''}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{entry.company.size}</span>
        <span aria-hidden="true">・</span>
        <span>{entry.company.industry}</span>
        <span aria-hidden="true">・</span>
        <span className="tracking-tight text-amber-500">{difficultyStars(entry.difficulty)}</span>
      </div>
    </Link>
  );
}
