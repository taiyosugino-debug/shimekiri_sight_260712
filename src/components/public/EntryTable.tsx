// =============================================================
// エントリーテーブル — md以上の画面幅で表示するテーブルレイアウト
// 列: 締切 / 企業・タイトル / 種別 / 卒年 / 規模・業界 / 難易度
// =============================================================

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { difficultyStars, EntryWithCompany } from '@/lib/types';
import { formatDeadline } from '@/lib/date';
import DaysBadge from './DaysBadge';

interface EntryTableProps {
  entries: EntryWithCompany[];
  now?: Date;
}

export default function EntryTable({ entries, now }: EntryTableProps) {
  const router = useRouter();

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
          <th className="px-3 py-2 font-medium">締切</th>
          <th className="px-3 py-2 font-medium">企業・タイトル</th>
          <th className="px-3 py-2 font-medium">種別</th>
          <th className="px-3 py-2 font-medium">卒年</th>
          <th className="px-3 py-2 font-medium">規模・業界</th>
          <th className="px-3 py-2 font-medium">難易度</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.id}
            onClick={() => router.push(`/entries/${entry.id}`)}
            className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
          >
            <td className="whitespace-nowrap px-3 py-3 align-top">
              <div className="flex flex-col gap-1">
                <DaysBadge deadlineAt={entry.deadlineAt} now={now} />
                <span className="text-xs text-slate-500">{formatDeadline(entry.deadlineAt)}</span>
              </div>
            </td>
            <td className="px-3 py-3 align-top">
              <Link
                href={`/entries/${entry.id}`}
                onClick={(e) => e.stopPropagation()}
                className="block hover:underline"
              >
                <p className="text-xs font-medium text-slate-500">{entry.company.name}</p>
                <p className="font-semibold text-slate-900">{entry.title}</p>
              </Link>
            </td>
            <td className="whitespace-nowrap px-3 py-3 align-top text-slate-600">{entry.type}</td>
            <td className="whitespace-nowrap px-3 py-3 align-top text-slate-600">{entry.gradYear}卒</td>
            <td className="whitespace-nowrap px-3 py-3 align-top text-slate-600">
              <div className="flex flex-col">
                <span>{entry.company.size}</span>
                <span className="text-xs text-slate-400">{entry.company.industry}</span>
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-3 align-top tracking-tight text-amber-500">
              {difficultyStars(entry.difficulty)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
