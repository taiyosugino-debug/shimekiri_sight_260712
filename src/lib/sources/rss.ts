// =============================================================
// RSS/Atom フィード取込アダプタ（PROJECT_SPEC.md §8）
// fast-xml-parser で RSS2.0 / Atom を解析し RawItem[] に正規化する。
// =============================================================

import { XMLParser } from 'fast-xml-parser';
import { Source } from '../types';
import { fetchWithTimeout, RawItem, readTextWithLimit, SourceConfig } from './index';

interface RssConfig extends SourceConfig {
  /** 締切文字列をどのフィールドから読み取るか（既定: title → description の順） */
  deadlineFrom?: 'title' | 'description' | 'pubDate';
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && v !== null && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

/** RSS2.0 / Atom の XML を取得し RawItem[] へ変換する */
export async function fetchRssItems(source: Source): Promise<RawItem[]> {
  const config: RssConfig = source.configJson ? JSON.parse(source.configJson) : {};
  const res = await fetchWithTimeout(source.url);
  if (!res.ok) {
    throw new Error(`フィード取得に失敗しました (HTTP ${res.status})`);
  }
  const xml = await readTextWithLimit(res);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
  const doc = parser.parse(xml);

  const rawItems: Record<string, unknown>[] = [];

  // RSS2.0: rss.channel.item
  const rssItems = toArray(doc?.rss?.channel?.item);
  if (rssItems.length > 0) {
    rawItems.push(...(rssItems as Record<string, unknown>[]));
  }

  // Atom: feed.entry
  const atomEntries = toArray(doc?.feed?.entry);
  if (atomEntries.length > 0) {
    rawItems.push(...(atomEntries as Record<string, unknown>[]));
  }

  const limit = config.limit ?? 50;
  const deadlineFrom = config.deadlineFrom ?? 'title';

  const items: RawItem[] = rawItems.slice(0, limit).map((item) => {
    const title = textOf(item.title);
    const description = textOf(item.description ?? item.summary ?? item.content);
    const pubDate = textOf(item.pubDate ?? item.published ?? item.updated);

    // link: RSS2.0 は文字列、Atom は <link href="..."/> のことが多い
    let url: string | undefined;
    if (typeof item.link === 'string') {
      url = item.link;
    } else if (Array.isArray(item.link)) {
      const first = item.link[0] as Record<string, unknown> | string;
      url = typeof first === 'string' ? first : textOf((first as Record<string, unknown>)?.['@_href']);
    } else if (item.link && typeof item.link === 'object') {
      const href = (item.link as Record<string, unknown>)['@_href'];
      url = href !== undefined ? String(href) : undefined;
    }

    let deadlineText: string | undefined;
    if (deadlineFrom === 'pubDate') {
      deadlineText = pubDate || undefined;
    } else if (deadlineFrom === 'description') {
      deadlineText = description || title || undefined;
    } else {
      deadlineText = title || description || undefined;
    }

    return {
      title: title || undefined,
      url,
      deadline: deadlineText,
      companyName: config.defaults?.companyName,
      type: config.defaults?.type,
      gradYear: config.defaults?.gradYear,
      difficulty: config.defaults?.difficulty,
    };
  });

  return items;
}
