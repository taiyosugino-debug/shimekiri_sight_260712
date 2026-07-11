'use client';

import { ImportResult } from '@/lib/types';

const ACTION_LABELS: Record<'create' | 'update' | 'error', string> = {
  create: '新規作成',
  update: '更新',
  error: 'エラー',
};

/** CSVインポートのドライラン/実行結果を行単位で表示するテーブル */
export default function ImportResultTable({ result }: { result: ImportResult }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="badge bg-emerald-100 text-emerald-700">新規 {result.created}件</span>
        <span className="badge bg-brand-100 text-brand-700">更新 {result.updated}件</span>
        <span className={`badge ${result.errors > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
          エラー {result.errors}件
        </span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">行</th>
              <th className="px-3 py-2 text-left font-medium">アクション</th>
              <th className="px-3 py-2 text-left font-medium">メッセージ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.rows.map((row, idx) => (
              <tr key={`${row.line}-${idx}`} className={row.action === 'error' ? 'bg-red-50' : ''}>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.line}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{ACTION_LABELS[row.action]}</td>
                <td className={`px-3 py-2 ${row.action === 'error' ? 'text-red-700' : 'text-slate-700'}`}>
                  {row.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
