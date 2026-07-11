'use client';

import { useParams } from 'next/navigation';
import EntryForm from '@/components/admin/EntryForm';

export default function AdminEditEntryPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">締切の編集</h1>
        <p className="mt-1 text-sm text-slate-500">登録済みの締切データを編集します。</p>
      </div>
      <EntryForm entryId={id} />
    </div>
  );
}
