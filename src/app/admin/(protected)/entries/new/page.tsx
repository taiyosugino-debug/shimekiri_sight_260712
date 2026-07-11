'use client';

import EntryForm from '@/components/admin/EntryForm';

export default function AdminNewEntryPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">締切の新規追加</h1>
        <p className="mt-1 text-sm text-slate-500">新しい締切データを登録します。</p>
      </div>
      <EntryForm />
    </div>
  );
}
