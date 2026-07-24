// =============================================================
// 自動取込 共通ロジック（PROJECT_SPEC.md §8）
// type 別アダプタ（rss/jsonfeed/scrape）が返す RawItem[] を正規化し、
// Store への upsert（新規は draft、既存は差分更新）を行う。
// =============================================================

import { parseDeadlineText } from '../date';
import {
  Entry,
  EntryType,
  isEntryType,
  Source,
  Store,
  SyncResult,
} from '../types';
import { sendSlack } from '../slack';

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'AbuildShimekiriNavi/1.0';

/** 取込元アダプタが返す正規化前アイテム */
export interface RawItem {
  companyName?: string;
  title?: string;
  /** 未パースの締切文字列 */
  deadline?: string;
  url?: string;
  type?: string;
  gradYear?: number;
  difficulty?: number;
}

/** configJson 共通スキーマ（PROJECT_SPEC.md §8） */
export interface SourceConfig {
  defaults?: {
    companyName?: string;
    type?: string;
    gradYear?: number;
    difficulty?: number;
  };
  limit?: number;
}

/** タイムアウト付き fetch（AbortController、既定15秒、UA 付与） */
export async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT);
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 取込レスポンス本文の最大サイズ（誤設定・悪意ある巨大レスポンスからの保護） */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * レスポンス本文をサイズ上限付きで読み取る。
 * fetchWithTimeout のタイマーはヘッダー受信までしかカバーしないため、
 * 本文読み取りにもチャンク到着ごとの全体デッドライン（30秒）を設ける。
 */
export async function readTextWithLimit(res: Response, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  const lenHeader = res.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > maxBytes) {
    throw new Error(`レスポンスが大きすぎます（${lenHeader} バイト > 上限 ${maxBytes} バイト）`);
  }
  const body = res.body;
  if (!body) return '';
  const reader = body.getReader();
  const deadline = Date.now() + 30_000;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`レスポンスが大きすぎます（上限 ${maxBytes} バイト超過）`);
    }
    if (Date.now() > deadline) {
      await reader.cancel().catch(() => {});
      throw new Error('レスポンス本文の読み取りがタイムアウトしました');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

// ---------------- FNV-1a ハッシュ（重複キー生成用） ----------------

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function buildSourceKey(sourceId: string, companyName: string, title: string, gradYear: number): string {
  const hash = fnv1a(`${companyName}|${title}|${gradYear}`);
  return `auto:${sourceId}:${hash}`;
}

// ---------------- 正規化・upsert ----------------

async function resolveCompanyId(store: Store, companyName: string): Promise<string> {
  const companies = await store.listCompanies();
  const trimmed = companyName.trim();
  const existing = companies.find((c) => c.name.trim() === trimmed);
  if (existing) return existing.id;
  const created = await store.createCompany({
    name: trimmed,
    industry: 'その他',
    size: '中堅・中小',
  });
  return created.id;
}

function resolveEntryType(raw: string | undefined): EntryType {
  if (isEntryType(raw)) return raw;
  return 'インターン';
}

/**
 * 1件の Source を実行し、RawItem[] を取得・正規化して Store へ反映する。
 * 1 source の失敗が他の source を止めないよう、例外はここで吸収し SyncResult.errors に積む。
 */
export async function runSource(source: Source, store: Store): Promise<SyncResult> {
  const result: SyncResult = {
    sourceId: source.id,
    sourceName: source.name,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  let rawItems: RawItem[] = [];
  try {
    rawItems = await fetchSourceItems(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`取得エラー: ${message}`);
    await store.updateSource(source.id, {
      lastRunAt: new Date().toISOString(),
      lastStatus: 'error',
      lastMessage: message,
    });
    return result;
  }

  result.fetched = rawItems.length;
  const existingEntries = await store.listEntries();
  const existingBySourceKey = new Map<string, Entry>();
  for (const e of existingEntries) {
    if (e.source.startsWith('auto:')) existingBySourceKey.set(e.source, e);
  }

  const now = new Date();
  const config: { defaults?: { companyName?: string; type?: string; gradYear?: number; difficulty?: number } } =
    source.configJson ? JSON.parse(source.configJson) : {};
  const defaults = config.defaults ?? {};

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const lineLabel = `#${i + 1}`;
    try {
      const title = (item.title ?? '').trim();
      if (!title) {
        result.skipped += 1;
        result.errors.push(`${lineLabel}: title が空のためスキップしました`);
        continue;
      }

      const deadlineAt = parseDeadlineText(item.deadline ?? '', { now });
      if (!deadlineAt) {
        result.skipped += 1;
        result.errors.push(`${lineLabel}: 締切「${item.deadline ?? ''}」を解釈できずスキップしました（${title}）`);
        continue;
      }

      const companyName = (item.companyName ?? defaults.companyName ?? '').trim();
      if (!companyName) {
        result.skipped += 1;
        result.errors.push(`${lineLabel}: 企業名が特定できずスキップしました（${title}）`);
        continue;
      }

      const type = resolveEntryType(item.type ?? defaults.type);
      const gradYear = item.gradYear ?? defaults.gradYear ?? new Date().getFullYear() + 2;
      const difficulty = Math.min(5, Math.max(1, Math.round(item.difficulty ?? defaults.difficulty ?? 3)));

      const sourceKey = buildSourceKey(source.id, companyName, title, gradYear);
      const existing = existingBySourceKey.get(sourceKey);

      if (existing) {
        if (existing.deadlineAt !== deadlineAt) {
          const wasPublished = existing.status === 'published';
          await store.updateEntry(existing.id, {
            deadlineAt,
            applyUrl: item.url ?? existing.applyUrl,
            sourceUrl: source.url,
          });
          result.updated += 1;
          if (wasPublished) {
            await sendSlack(
              `⚠️ 締切変更検知\n・${companyName}｜${gradYear}卒 ${title}\n旧: ${existing.deadlineAt}\n新: ${deadlineAt}`,
              'admin',
            );
          }
        } else {
          result.skipped += 1;
        }
        continue;
      }

      const companyId = await resolveCompanyId(store, companyName);
      await store.createEntry({
        companyId,
        title,
        type,
        gradYear,
        deadlineAt,
        difficulty,
        applyUrl: item.url,
        // 情報源URLとして取込元（フィード/ページ）のURLを記録する
        sourceUrl: source.url,
        // autoPublish が有効な取込元は即公開、それ以外は従来どおり承認待ち(draft)
        status: source.autoPublish ? 'published' : 'draft',
        pickup: false,
        source: sourceKey,
      });
      result.created += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.skipped += 1;
      result.errors.push(`${lineLabel}: 処理中にエラーが発生しました（${message}）`);
    }
  }

  // フェッチ自体は成功しているため 'ok' 扱い（行単位のスキップは errors に記録済み）
  const lastMessage = `取得${result.fetched}件 / 新規${result.created}件 / 更新${result.updated}件 / スキップ${result.skipped}件`;
  await store.updateSource(source.id, {
    lastRunAt: new Date().toISOString(),
    lastStatus: 'ok',
    lastMessage,
  });

  return result;
}

/** type 別アダプタへ委譲して RawItem[] を取得する */
export async function fetchSourceItems(source: Source): Promise<RawItem[]> {
  if (source.type === 'rss') {
    const { fetchRssItems } = await import('./rss');
    return fetchRssItems(source);
  }
  if (source.type === 'json') {
    const { fetchJsonItems } = await import('./jsonfeed');
    return fetchJsonItems(source);
  }
  if (source.type === 'scrape') {
    const { fetchScrapeItems } = await import('./scrape');
    return fetchScrapeItems(source);
  }
  throw new Error(`未対応の source.type です: ${source.type}`);
}
