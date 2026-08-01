'use client';

// =============================================================
// 要確認リスト（週次巡回の結果）
//
// 巡回で見つけた締切候補を確信度の低い順に並べて表示する。
// 承認作業はスプレッドシートの「承認」列でも行えるが、この画面からも行える。
// どちらで承認しても、取り込まれる Entry は必ず draft（承認待ち）になる。
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, errorMessage } from '@/components/admin/adminApi';
import { ErrorBanner } from '@/components/admin/Feedback';
import { Confidence, ReviewItem } from '@/lib/types';
import { formatDeadlineFull } from '@/lib/date';

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  低: 'bg-rose-100 text-rose-700 border-rose-200',
  中: 'bg-amber-100 text-amber-700 border-amber-200',
  高: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const DECISION_STYLE: Record<string, string> = {
  未確認: 'bg-slate-100 text-slate-600',
  承認: 'bg-emerald-100 text-emerald-700',
  却下: 'bg-slate-200 text-slate-500',
  取込済: 'bg-brand-100 text-brand-700',
};

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [onlyPending, setOnlyPending] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ items: ReviewItem[] }>('/api/admin/review');
      setItems(data.items);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setDecision(id: string, decision: '承認' | '却下' | '未確認') {
    setBusyId(id);
    try {
      await adminFetch(`/api/admin/review/${id}`, { method: 'PATCH', body: { decision } });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function importApproved() {
    setImporting(true);
    setNotice(null);
    try {
      const data = await adminFetch<{
        result: { imported: number; approved: number; skipped: { companyName: string; reason: string }[] };
      }>('/api/admin/review', { method: 'POST' });
      const r = data.result;
      const skipped = r.skipped.length > 0 ? `／取り込めなかったもの ${r.skipped.length} 件` : '';
      setNotice(`承認済み ${r.approved} 件のうち ${r.imported} 件を承認待ちに取り込みました${skipped}`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setImporting(false);
    }
  }

  const visible = (items ?? []).filter((i) => (onlyPending ? i.decision === '未確認' : true));
  const lowCount = (items ?? []).filter((i) => i.confidence === '低' && i.decision === '未確認').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">要確認リスト</h1>
          <p className="mt-1 text-sm text-slate-500">
            週次巡回（毎週火曜）で見つけた締切候補です。確信度が低いものから並んでいます。
            {lowCount > 0 && <span className="ml-1 font-medium text-rose-600">未確認の「低」が {lowCount} 件</span>}
          </p>
        </div>
        <button type="button" className="btn-primary text-sm" disabled={importing} onClick={importApproved}>
          {importing ? '取り込み中…' : '承認済みを取り込む'}
        </button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        印が付いていない行が「正しい」とは限りません。締切が画像・PDF・ログイン後にあるページは
        そもそも何も取れず、確信度「低」として上がってきます。<strong>全件に目を通してください。</strong>
      </div>

      <ErrorBanner message={error} />
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
        未確認のみ表示
      </label>

      {loading && items === null ? (
        <p className="text-sm text-slate-500">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          表示する項目はありません。巡回がまだ実行されていない可能性があります。
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-2 py-0.5 text-xs font-bold ${CONFIDENCE_STYLE[item.confidence]}`}>
                  確信度 {item.confidence}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${DECISION_STYLE[item.decision] ?? ''}`}>
                  {item.decision}
                </span>
                <span className="font-medium text-slate-900">{item.companyName}</span>
                {item.type && <span className="text-xs text-slate-500">{item.type}</span>}
              </div>

              <p className="mt-2 text-sm text-slate-700">{item.title}</p>

              <dl className="mt-2 space-y-1 text-xs text-slate-600">
                <div>
                  <dt className="inline font-medium">締切: </dt>
                  <dd className="inline">
                    {item.deadlineAt ? formatDeadlineFull(item.deadlineAt) : '解釈できませんでした'}
                  </dd>
                </div>
                {item.deadlineText && (
                  <div>
                    <dt className="inline font-medium">見つけた箇所: </dt>
                    <dd className="inline text-slate-500">…{item.deadlineText}…</dd>
                  </div>
                )}
                {item.reasons && (
                  <div>
                    <dt className="inline font-medium text-rose-700">要確認の理由: </dt>
                    <dd className="inline text-rose-700">{item.reasons}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={item.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline"
                >
                  ページを開いて確認 ↗
                </a>
                <span className="grow" />
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={busyId === item.id || item.decision === '取込済'}
                  onClick={() => setDecision(item.id, '承認')}
                >
                  承認
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busyId === item.id || item.decision === '取込済'}
                  onClick={() => setDecision(item.id, '却下')}
                >
                  却下
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
