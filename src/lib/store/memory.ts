// =============================================================
// インメモリ Store 実装（デモ・開発用。DATA_BACKEND=memory）
// モジュールスコープ変数に seed.ts の初期データを保持する。
// サーバー再起動・再デプロイでリセットされる点に注意。
// =============================================================

import { buildSeedData } from '../seed';
import { nowIso } from '../date';
import {
  Company,
  CompanyInput,
  Entry,
  EntryInput,
  Source,
  SourceInput,
  SourceRuntimePatch,
  Store,
} from '../types';

function genId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${prefix}_${rand}`;
}

// モジュールスコープ（プロセス生存中は保持される）
const seed = buildSeedData(new Date());
let companies: Company[] = [...seed.companies];
let entries: Entry[] = [...seed.entries];
let sources: Source[] = [...seed.sources];

export class MemoryStore implements Store {
  backendName: 'memory' = 'memory';

  // ---------------- companies ----------------

  async listCompanies(): Promise<Company[]> {
    return [...companies];
  }

  async getCompany(id: string): Promise<Company | null> {
    return companies.find((c) => c.id === id) ?? null;
  }

  async createCompany(input: CompanyInput & { id?: string }): Promise<Company> {
    const now = nowIso();
    const company: Company = {
      id: input.id || genId('co'),
      name: input.name,
      industry: input.industry,
      size: input.size,
      hpUrl: input.hpUrl,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    companies.push(company);
    return company;
  }

  async updateCompany(id: string, patch: Partial<CompanyInput>): Promise<Company | null> {
    const idx = companies.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated: Company = {
      ...companies[idx],
      ...patch,
      updatedAt: nowIso(),
    };
    companies[idx] = updated;
    return updated;
  }

  async deleteCompany(id: string): Promise<boolean> {
    const before = companies.length;
    companies = companies.filter((c) => c.id !== id);
    return companies.length < before;
  }

  // ---------------- entries ----------------

  async listEntries(): Promise<Entry[]> {
    return [...entries];
  }

  async getEntry(id: string): Promise<Entry | null> {
    return entries.find((e) => e.id === id) ?? null;
  }

  async createEntry(input: EntryInput & { id?: string }): Promise<Entry> {
    const now = nowIso();
    const entry: Entry = {
      id: input.id || genId('en'),
      companyId: input.companyId,
      title: input.title,
      type: input.type,
      gradYear: input.gradYear,
      deadlineAt: input.deadlineAt,
      difficulty: input.difficulty,
      applyUrl: input.applyUrl,
      description: input.description,
      sourceUrl: input.sourceUrl,
      selectionFlow: input.selectionFlow,
      webTest: input.webTest,
      status: input.status ?? 'draft',
      pickup: input.pickup ?? false,
      source: input.source ?? 'manual',
      createdAt: now,
      updatedAt: now,
    };
    entries.push(entry);
    return entry;
  }

  async updateEntry(id: string, patch: Partial<EntryInput>): Promise<Entry | null> {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const updated: Entry = {
      ...entries[idx],
      ...patch,
      updatedAt: nowIso(),
    };
    entries[idx] = updated;
    return updated;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const before = entries.length;
    entries = entries.filter((e) => e.id !== id);
    return entries.length < before;
  }

  // ---------------- sources ----------------

  async listSources(): Promise<Source[]> {
    return [...sources];
  }

  async getSource(id: string): Promise<Source | null> {
    return sources.find((s) => s.id === id) ?? null;
  }

  async createSource(input: SourceInput & { id?: string }): Promise<Source> {
    const now = nowIso();
    const source: Source = {
      id: input.id || genId('src'),
      name: input.name,
      type: input.type,
      url: input.url,
      configJson: input.configJson,
      enabled: input.enabled,
      lastRunAt: undefined,
      lastStatus: undefined,
      lastMessage: undefined,
      createdAt: now,
      updatedAt: now,
    };
    sources.push(source);
    return source;
  }

  async updateSource(
    id: string,
    patch: Partial<SourceInput> & SourceRuntimePatch,
  ): Promise<Source | null> {
    const idx = sources.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const updated: Source = {
      ...sources[idx],
      ...patch,
      updatedAt: nowIso(),
    };
    sources[idx] = updated;
    return updated;
  }

  async deleteSource(id: string): Promise<boolean> {
    const before = sources.length;
    sources = sources.filter((s) => s.id !== id);
    return sources.length < before;
  }
}
