'use client';

// =============================================================
// 企業マスターの CSV 一括登録・更新
//
// 500社ぶんの採用ページURLを用意し、あとから差し替えられるようにするための画面。
// 企業名で照合して upsert する。必ず「確認（dryrun）」を先に通す導線にしている。
// =============================================================

import { useState } from 'react';
import Link from 'next/link';
import { adminFetch, errorMessage } from '@/components/admin/adminApi';
import { ErrorBanner } from '@/components/admin/Feedback';
import { ImportRowResult, COMPANY_SIZES, INDUSTRIES } from '@/lib/types';

interface Result {
  ok: boolean;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  rows: ImportRowResult[];
}

const SAMPLE = `company_name,industry,size,hp_url,recruit_url,note
マツダ,メーカー,大手,https://www.mazda.com/ja/,https://www.mazda.com/ja/careers/newgraduate-1/,
サイバーエージェント,IT,メガベンチャー,https://www.cyberagent.co.jp/,https://www.cyberagent.co.jp/careers/,`;

export default function CompanyImportPage() {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [mode, setMode] = useState<'dryrun' | 'commit' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(m: 'dryrun' | 'commit') {
    setBusy(true);
    setError(null);
    try {
      const data = await adminFetch<Result>('/api/admin/companies/import', {
        method: 'POST',
        body: { csv, mode: m },
      });
      setResult(data);
      setMode(m);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const errorRows = result?.rows.filter((r) => r.action === 'error') ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">企業マスターの一括登録・更新</h1>
        <p className="mt-1 text-sm text-slate-500">
          CSVを貼り付けて、企業と採用ページURLをまとめて登録・更新します。
          <Link href="/admin/companies" className="ml-1 text-brand-600 hover:underline">
            企業一覧に戻る
          </Link>
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-800">書き方</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            1行目は見出し行：<code className="rounded bg-slate-100 px-1">company_name,industry,size,hp_url,recruit_url,note</code>
          </li>
          <li>
            <strong>company_name だけが必須</strong>です。既に登録済みの企業名と一致すれば更新、無ければ新規登録します
          </li>
          <li>
            <strong>空欄の列は変更しません。</strong>採用ページURLだけを直したいときは、その列だけ埋めれば大丈夫です
          </li>
          <li>
            値を消したいときは <code className="rounded bg-slate-100 px-1">-</code>（ハイフン1文字）を入れてください
          </li>
          <li>新規登録する企業は industry と size が必要です</li>
          <li>industry: {INDUSTRIES.join(' / ')}</li>
          <li>size: {COMPANY_SIZES.join(' / ')}</li>
        </ul>
        <details className="pt-1">
          <summary className="cursor-pointer text-brand-600">記入例を見る</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-[11px] leading-relaxed">{SAMPLE}</pre>
        </details>
      </div>

      <ErrorBanner message={error} />

      <div>
        <label htmlFor="csv" className="label">
          CSV
        </label>
        <textarea
          id="csv"
          className="input h-64 font-mono text-xs"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setResult(null);
          }}
          placeholder={SAMPLE}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost text-sm" disabled={busy || !csv.trim()} onClick={() => run('dryrun')}>
          {busy && mode === 'dryrun' ? '確認中…' : 'まず確認する（書き込まない）'}
        </button>
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={busy || !csv.trim() || !result || mode !== 'dryrun' || result.errors > 0}
          onClick={() => run('commit')}
          title={
            !result || mode !== 'dryrun'
              ? '先に「まず確認する」を実行してください'
              : result.errors > 0
                ? 'エラーがある行を直してから取り込んでください'
                : undefined
          }
        >
          {busy && mode === 'commit' ? '取り込み中…' : '取り込む'}
        </button>
      </div>

      {result && (
        <div className="space-y-3">
          <div
            className={`rounded-lg border p-3 text-sm ${
              result.errors > 0
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {mode === 'dryrun' ? '確認結果（まだ書き込んでいません）' : '取り込みました'}：新規 {result.created} 件 /
            更新 {result.updated} 件 / 変更なし {result.unchanged} 件 / エラー {result.errors} 件
            {mode === 'dryrun' && result.errors === 0 && result.created + result.updated > 0 && (
              <span className="ml-1 font-medium">問題なければ「取り込む」を押してください。</span>
            )}
          </div>

          {errorRows.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-white">
              <p className="border-b border-rose-100 px-3 py-2 text-xs font-medium text-rose-700">
                直す必要がある行（{errorRows.length}件）
              </p>
              <ul className="divide-y divide-slate-100 text-xs">
                {errorRows.slice(0, 50).map((r, i) => (
                  <li key={i} className="px-3 py-2">
                    <span className="mr-2 font-mono text-slate-400">{r.line}行目</span>
                    {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer px-3 py-2 text-xs text-slate-600">
              すべての行を見る（{result.rows.length}件）
            </summary>
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-xs">
              {result.rows.map((r, i) => (
                <li key={i} className="px-3 py-2">
                  <span className="mr-2 font-mono text-slate-400">{r.line}行目</span>
                  <span
                    className={
                      r.action === 'error'
                        ? 'text-rose-700'
                        : r.action === 'create'
                          ? 'text-emerald-700'
                          : 'text-slate-600'
                    }
                  >
                    {r.message}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
