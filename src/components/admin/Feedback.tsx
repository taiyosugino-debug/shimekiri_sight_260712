'use client';

/** 画面共通の状態表示（読込中・エラー・空状態）を統一するための小さな部品群 */

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {message}
    </div>
  );
}

export function LoadingBlock({ label = '読み込み中…' }: { label?: string }) {
  return <div className="card px-4 py-8 text-center text-sm text-slate-500">{label}</div>;
}

export function EmptyBlock({ label }: { label: string }) {
  return <div className="card px-4 py-8 text-center text-sm text-slate-500">{label}</div>;
}
