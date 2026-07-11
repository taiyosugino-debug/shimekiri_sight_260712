// =============================================================
// 締切一覧ページ（server component）
// getStore() から published entries + companies を取得し、
// クライアント側の EntryExplorer に渡す
// =============================================================

import { getStore, isDemo } from '@/lib/store';
import { joinCompanies } from '@/lib/filters';
import EntryExplorer from '@/components/public/EntryExplorer';

export const dynamic = 'force-dynamic';

export default async function PublicEntriesPage() {
  const store = getStore();
  const [entries, companies] = await Promise.all([store.listEntries(), store.listCompanies()]);

  const publishedEntries = entries.filter((e) => e.status === 'published');
  const entriesWithCompany = joinCompanies(publishedEntries, companies);

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-900">締切一覧</h1>
      <EntryExplorer initialEntries={entriesWithCompany} demo={isDemo()} />
    </div>
  );
}
