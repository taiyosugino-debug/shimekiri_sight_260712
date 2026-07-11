'use client';

import { useRef, useState } from 'react';
import { EntryStatus, ImportResult } from '@/lib/types';
import { adminFetch, errorMessage } from '@/components/admin/adminApi';
import ImportResultTable from '@/components/admin/ImportResultTable';
import { ErrorBanner } from '@/components/admin/Feedback';

const CSV_HEADER =
  'company_name,industry,size,title,type,grad_year,deadline,difficulty,apply_url,description,pickup,source_url,selection_flow,web_test';

const SAMPLE_CSV = `${CSV_HEADER}
株式会社サンプル商事,総合商社,大手,2028卒 サマーインターン(3days),インターン,2028,2026-08-15,3,https://example.com/recruit/,商社業界の仕事を体験できる3日間のプログラムです。,TRUE,https://example.com/news/123,ES提出 → Webテスト → GD → 面接（2回）,玉手箱
サンプルコンサルティング,コンサル,メガベンチャー,本選考エントリー,本選考,2027,2026/9/1 18:00,4,https://example.com/careers/,戦略コンサルタント職の本選考エントリーです。,FALSE,https://example.com/careers/,ES提出 → Webテスト → ケース面接,TG-WEB
サンプルテック株式会社,IT,スタートアップ,エンジニア職 会社説明会,説明会・イベント,2029,2026-07-20,1,https://example.com/events/,オンラインで開催する会社説明会です。,FALSE,,,
サンプル銀行,金融,大手,2028卒 冬季インターン,インターン,2028,2026-12-10,2,https://example.com/intern/,金融業界の基礎を学べる1dayインターンです。,FALSE,https://example.com/intern/,ES提出 → Webテスト → 面接,SPI
サンプルメーカー株式会社,メーカー,中堅・中小,本選考一次エントリー,本選考,2027,2026-10-05 23:59,3,https://example.com/entry/,ものづくりに興味のある学生向けの本選考です。,FALSE,,,
`;

export default function AdminImportPage() {
  const [csvText, setCsvText] = useState('');
  const [defaultStatus, setDefaultStatus] = useState<EntryStatus>('draft');
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState('サンプルをコピー');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleTextChange(value: string) {
    setCsvText(value);
    // CSV を書き換えたらドライラン結果は無効化
    setDryRunResult(null);
    setCommitted(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleTextChange(reader.result);
      }
    };
    reader.onerror = () => {
      setError('ファイルの読み込みに失敗しました。');
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleDryRun() {
    if (!csvText.trim()) {
      setError('CSVデータを入力してください。');
      return;
    }
    setError(null);
    setDryRunning(true);
    setCommitted(false);
    try {
      const res = await adminFetch<ImportResult>('/api/admin/import', {
        method: 'POST',
        body: { csv: csvText, mode: 'dryrun', defaultStatus },
      });
      setDryRunResult(res);
    } catch (e) {
      setError(errorMessage(e));
      setDryRunResult(null);
    } finally {
      setDryRunning(false);
    }
  }

  async function handleCommit() {
    if (!csvText.trim()) return;
    setError(null);
    setCommitting(true);
    try {
      const res = await adminFetch<ImportResult>('/api/admin/import', {
        method: 'POST',
        body: { csv: csvText, mode: 'commit', defaultStatus },
      });
      setDryRunResult(res);
      setCommitted(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCommitting(false);
    }
  }

  async function handleCopySample() {
    try {
      await navigator.clipboard.writeText(SAMPLE_CSV.trim());
      setCopyLabel('コピーしました');
      setTimeout(() => setCopyLabel('サンプルをコピー'), 2000);
    } catch {
      setError('クリップボードへのコピーに失敗しました。');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">CSVインポート</h1>
        <p className="mt-1 text-sm text-slate-500">
          CSVデータから締切データを一括登録・更新します。まずドライランで内容を確認してください。
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-slate-900">フォーマット説明</h2>
        <p className="text-xs text-slate-500">
          1行目はヘッダー行が必須です。deadline は <code>YYYY-MM-DD</code> / <code>YYYY/M/D</code> /{' '}
          <code>YYYY-MM-DD HH:mm</code> 形式に対応（時刻省略時は23:59 JST）。同一の企業名・タイトル・卒年の組み合わせが既にある場合は更新、無ければ新規作成されます。
          末尾3列（source_url=情報源URL / selection_flow=選考の流れ / web_test=Webテストの種類）は任意列で、無くても取り込めます。
        </p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <code className="block whitespace-pre-wrap break-all text-xs text-slate-700">{CSV_HEADER}</code>
        </div>
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none font-medium text-slate-700">
            サンプルCSV（5行）を表示
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
{SAMPLE_CSV.trim()}
          </pre>
          <button type="button" className="btn-ghost mt-2 text-xs" onClick={handleCopySample}>
            {copyLabel}
          </button>
        </details>
      </div>

      <div className="card space-y-4 p-4">
        <div>
          <label htmlFor="csvFile" className="label">
            CSVファイルを選択（任意）
          </label>
          <input
            id="csvFile"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        <div>
          <label htmlFor="csvText" className="label">
            CSVデータ
          </label>
          <textarea
            id="csvText"
            className="input h-56 font-mono text-xs"
            value={csvText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={CSV_HEADER}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="defaultStatus" className="label">
              新規作成時のステータス
            </label>
            <select
              id="defaultStatus"
              className="input"
              value={defaultStatus}
              onChange={(e) => setDefaultStatus(e.target.value as EntryStatus)}
            >
              <option value="draft">承認待ち（推奨）</option>
              <option value="published">公開中</option>
            </select>
          </div>
          <button type="button" className="btn-ghost" onClick={handleDryRun} disabled={dryRunning}>
            {dryRunning ? '確認中…' : 'ドライラン（内容確認）'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCommit}
            disabled={!dryRunResult || committing || committed}
            title={!dryRunResult ? '先にドライランを実行してください' : undefined}
          >
            {committing ? '取込中…' : committed ? '取込済み' : '取込実行'}
          </button>
        </div>

        <ErrorBanner message={error} />
      </div>

      {dryRunResult && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">
            {committed ? '取込結果' : 'ドライラン結果（まだ保存されていません）'}
          </h2>
          <ImportResultTable result={dryRunResult} />
        </div>
      )}
    </div>
  );
}
