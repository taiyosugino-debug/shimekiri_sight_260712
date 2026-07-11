// =============================================================
// 締切詳細ページ（server component）
// published 以外は notFound()
// =============================================================

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStore } from '@/lib/store';
import { difficultyStars, EntryWithCompany } from '@/lib/types';
import { formatDeadlineFull, jstYmdCompact, remainLabel } from '@/lib/date';
import DaysBadge from '@/components/public/DaysBadge';

export const dynamic = 'force-dynamic';

interface EntryDetailPageProps {
  params: Promise<{ id: string }>;
}

/** Googleカレンダーの「予定を追加」URLを組み立てる */
function buildGoogleCalendarUrl(companyName: string, title: string, deadlineAt: string): string {
  const text = encodeURIComponent(`【締切】${companyName} ${title}`);
  const start = jstYmdCompact(deadlineAt);
  const end = jstYmdCompact(deadlineAt, 1);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}`;
}

export default async function EntryDetailPage({ params }: EntryDetailPageProps) {
  const { id } = await params;

  const store = getStore();
  const entry = await store.getEntry(id);

  if (!entry || entry.status !== 'published') {
    notFound();
  }

  const company = await store.getCompany(entry.companyId);
  if (!company) {
    notFound();
  }

  const entryWithCompany: EntryWithCompany = { ...entry, company };

  const googleCalendarUrl = buildGoogleCalendarUrl(
    entryWithCompany.company.name,
    entryWithCompany.title,
    entryWithCompany.deadlineAt,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        ← 一覧へ戻る
      </Link>

      <div className="card p-5 sm:p-6">
        <p className="text-sm font-medium text-slate-500">{entryWithCompany.company.name}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{entryWithCompany.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DaysBadge deadlineAt={entryWithCompany.deadlineAt} />
          <span className="badge bg-slate-100 text-slate-600">{entryWithCompany.type}</span>
          <span className="badge bg-slate-100 text-slate-600">{entryWithCompany.gradYear}卒</span>
          <span className="badge bg-slate-100 text-slate-600">{entryWithCompany.company.size}</span>
          <span className="badge bg-slate-100 text-slate-600">{entryWithCompany.company.industry}</span>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">締切</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {formatDeadlineFull(entryWithCompany.deadlineAt)}
          </p>
          <p className="mt-1 text-sm font-semibold text-brand-700">
            {remainLabel(entryWithCompany.deadlineAt)}
          </p>
        </div>

        <div className="mt-4">
          <p className="label">難易度</p>
          <p className="text-lg tracking-tight text-amber-500">
            {difficultyStars(entryWithCompany.difficulty)}
          </p>
        </div>

        {(entryWithCompany.selectionFlow || entryWithCompany.webTest) && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {entryWithCompany.selectionFlow && (
              <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                <p className="label">選考の流れ</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {entryWithCompany.selectionFlow}
                </p>
              </div>
            )}
            {entryWithCompany.webTest && (
              <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                <p className="label">使うWebテストの種類</p>
                <p className="text-sm font-medium text-slate-700">{entryWithCompany.webTest}</p>
              </div>
            )}
          </div>
        )}

        {entryWithCompany.description && (
          <div className="mt-4">
            <p className="label">説明</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {entryWithCompany.description}
            </p>
          </div>
        )}

        {(entryWithCompany.applyUrl || entryWithCompany.sourceUrl) && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {entryWithCompany.applyUrl && (
              <div>
                <p className="label">応募URL</p>
                <a
                  href={entryWithCompany.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  {entryWithCompany.applyUrl}
                </a>
              </div>
            )}
            {entryWithCompany.sourceUrl && (
              <div>
                <p className="label">情報源URL</p>
                <a
                  href={entryWithCompany.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  {entryWithCompany.sourceUrl}
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {entryWithCompany.applyUrl && (
            <a
              href={entryWithCompany.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex-1"
            >
              エントリーページへ
            </a>
          )}
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost flex-1"
          >
            <span aria-hidden="true">📅</span> Googleカレンダーに追加
          </a>
        </div>

        <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-400">
          掲載している締切情報は自動取込・手動登録により随時更新していますが、内容の正確性を保証するものではありません。
          エントリーの際は必ず公式サイトで最新の締切をご確認ください。
        </p>
      </div>

      <div className="mt-4">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← 一覧へ戻る
        </Link>
      </div>
    </div>
  );
}
