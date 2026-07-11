// =============================================================
// 注目のエントリー — pickup かつ未経過のエントリーを横スクロールカードで表示
// =============================================================

'use client';

import Link from 'next/link';
import { difficultyStars, EntryWithCompany } from '@/lib/types';
import { formatDeadline } from '@/lib/date';
import DaysBadge from './DaysBadge';

interface PickupSectionProps {
  entries: EntryWithCompany[];
  now?: Date;
}

export default function PickupSection({ entries, now }: PickupSectionProps) {
  if (entries.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-bold text-slate-900">
        <span aria-hidden="true">🌟</span> 注目のエントリー
      </h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href={`/entries/${entry.id}`}
            className="card flex w-64 shrink-0 flex-col gap-2 p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-xs font-medium text-slate-500">{entry.company.name}</p>
              <DaysBadge deadlineAt={entry.deadlineAt} now={now} className="shrink-0" />
            </div>
            <p className="line-clamp-2 text-sm font-semibold text-slate-900">{entry.title}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>{formatDeadline(entry.deadlineAt)}〆</span>
              <span aria-hidden="true">・</span>
              <span>{entry.gradYear}卒</span>
            </div>
            <span className="tracking-tight text-amber-500">{difficultyStars(entry.difficulty)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
