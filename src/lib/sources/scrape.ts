// =============================================================
// スクレイピング取込アダプタ（PROJECT_SPEC.md §8）
//
// 【注意】本アダプタで対象サイトを取得する前に、必ず以下を確認・遵守すること。
//   - 対象サイトの robots.txt でクロール許可の範囲を確認する
//   - 対象サイトの利用規約（スクレイピング可否・再配布可否）を確認する
//   - アクセス頻度を必要最小限に抑える（本サービスは1日1回程度の cron 実行を想定）
//   - 取得データの利用は自己責任。法的リスクは運用者が判断すること
// これらの遵守はアプリ側では強制できないため、Source 登録者（社内運用者）の責任で行う。
// =============================================================

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { Source } from '../types';
import { fetchWithTimeout, RawItem, readTextWithLimit, SourceConfig } from './index';

interface ScrapeConfig extends SourceConfig {
  /** 1求人・1イベントを表す要素のセレクタ */
  itemSelector: string;
  /** RawItem のキー -> 'セレクタ' または 'セレクタ@属性名' */
  fields: Partial<Record<keyof RawItem, string>>;
}

/** 'セレクタ@属性' 記法をパースする。属性省略時はテキストを取得する。 */
function extractField(root: cheerio.Cheerio<AnyNode>, selectorExpr: string): string | undefined {
  const atIdx = selectorExpr.lastIndexOf('@');
  let selector = selectorExpr;
  let attr: string | undefined;
  if (atIdx > -1) {
    selector = selectorExpr.slice(0, atIdx);
    attr = selectorExpr.slice(atIdx + 1);
  }
  const target = selector.trim() === '' || selector.trim() === '&' ? root : root.find(selector);
  if (target.length === 0) return undefined;
  if (attr) {
    const v = target.attr(attr);
    return v !== undefined ? v.trim() : undefined;
  }
  const text = target.first().text();
  return text ? text.trim() : undefined;
}

/** 相対 URL を source.url 基準で絶対化する */
function resolveUrl(base: string, maybeRelative: string | undefined): string | undefined {
  if (!maybeRelative) return undefined;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

function toNumberOrUndefined(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** HTML を取得し cheerio で itemSelector/fields に従って RawItem[] へ変換する */
export async function fetchScrapeItems(source: Source): Promise<RawItem[]> {
  const config: ScrapeConfig = source.configJson
    ? JSON.parse(source.configJson)
    : { itemSelector: '', fields: {} };

  if (!config.itemSelector) {
    throw new Error('configJson.itemSelector が設定されていません');
  }

  const res = await fetchWithTimeout(source.url);
  if (!res.ok) {
    throw new Error(`ページ取得に失敗しました (HTTP ${res.status})`);
  }
  const html = await readTextWithLimit(res);
  const $ = cheerio.load(html);

  const limit = config.limit ?? 50;
  const fields = config.fields ?? {};

  const items: RawItem[] = [];
  $(config.itemSelector)
    .slice(0, limit)
    .each((_i, el) => {
      const root = $(el);
      const title = fields.title ? extractField(root, fields.title) : undefined;
      const deadline = fields.deadline ? extractField(root, fields.deadline) : undefined;
      const urlRaw = fields.url ? extractField(root, fields.url) : undefined;
      const companyName = fields.companyName ? extractField(root, fields.companyName) : undefined;
      const type = fields.type ? extractField(root, fields.type) : undefined;
      const gradYearRaw = fields.gradYear ? extractField(root, fields.gradYear) : undefined;
      const difficultyRaw = fields.difficulty ? extractField(root, fields.difficulty) : undefined;

      items.push({
        title,
        deadline,
        url: resolveUrl(source.url, urlRaw),
        companyName: companyName ?? config.defaults?.companyName,
        type: type ?? config.defaults?.type,
        gradYear: toNumberOrUndefined(gradYearRaw) ?? config.defaults?.gradYear,
        difficulty: toNumberOrUndefined(difficultyRaw) ?? config.defaults?.difficulty,
      });
    });

  return items;
}
