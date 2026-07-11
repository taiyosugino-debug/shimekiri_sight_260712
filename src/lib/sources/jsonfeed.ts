// =============================================================
// JSON フィード取込アダプタ（PROJECT_SPEC.md §8）
// { itemsPath, fields } 設定に従い、任意の JSON レスポンスを RawItem[] に正規化する。
// =============================================================

import { Source } from '../types';
import { fetchWithTimeout, RawItem, readTextWithLimit, SourceConfig } from './index';

interface JsonConfig extends SourceConfig {
  /** アイテム配列へのドットパス（例 'items' や 'data.jobs'） */
  itemsPath: string;
  /** RawItem のキー -> JSON 内のドットパス */
  fields: Partial<Record<keyof RawItem, string>>;
}

/** 'a.b.0.c' のようなドットパスで値を取得する（配列インデックスにも対応） */
function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const segments = path.split('.').filter((s) => s.length > 0);
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === undefined || cur === null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function toStringOrUndefined(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** JSON レスポンスを取得し configJson の itemsPath/fields に従って RawItem[] へ変換する */
export async function fetchJsonItems(source: Source): Promise<RawItem[]> {
  const config: JsonConfig = source.configJson
    ? JSON.parse(source.configJson)
    : { itemsPath: 'items', fields: {} };

  if (!config.itemsPath) {
    throw new Error('configJson.itemsPath が設定されていません');
  }

  const res = await fetchWithTimeout(source.url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`JSON取得に失敗しました (HTTP ${res.status})`);
  }
  const data: unknown = JSON.parse(await readTextWithLimit(res));

  const rawList = getByPath(data, config.itemsPath);
  const list: unknown[] = Array.isArray(rawList) ? rawList : [];

  const limit = config.limit ?? 50;
  const fields = config.fields ?? {};

  const items: RawItem[] = list.slice(0, limit).map((item) => {
    const companyName = fields.companyName ? toStringOrUndefined(getByPath(item, fields.companyName)) : undefined;
    const title = fields.title ? toStringOrUndefined(getByPath(item, fields.title)) : undefined;
    const deadline = fields.deadline ? toStringOrUndefined(getByPath(item, fields.deadline)) : undefined;
    const url = fields.url ? toStringOrUndefined(getByPath(item, fields.url)) : undefined;
    const type = fields.type ? toStringOrUndefined(getByPath(item, fields.type)) : undefined;
    const gradYear = fields.gradYear ? toNumberOrUndefined(getByPath(item, fields.gradYear)) : undefined;
    const difficulty = fields.difficulty ? toNumberOrUndefined(getByPath(item, fields.difficulty)) : undefined;

    return {
      companyName: companyName ?? config.defaults?.companyName,
      title,
      deadline,
      url,
      type: type ?? config.defaults?.type,
      gradYear: gradYear ?? config.defaults?.gradYear,
      difficulty: difficulty ?? config.defaults?.difficulty,
    };
  });

  return items;
}
