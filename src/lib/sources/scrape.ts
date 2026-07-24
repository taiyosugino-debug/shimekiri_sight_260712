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

// ---------------- robots.txt 遵守 ----------------
// 取得前に対象オリジンの robots.txt を確認し、当 UA でクロール禁止のパスなら中止する。
// robots.txt が無い/取得不可の場合は慣行に従い「許可」とみなす。

const ROBOTS_UA_TOKEN = 'abuildshimekirinavi';

interface RobotsRule { allow: boolean; path: string; }

export function parseRobots(text: string): RobotsRule[] {
  // 当 UA 指定グループがあればそれを、無ければ '*' グループの規則を採用する
  const lines = text.split(/\r?\n/);
  const starRules: RobotsRule[] = [];
  const uaRules: RobotsRule[] = [];
  let currentAgents: string[] = [];
  let sawDirectiveSinceAgent = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (sawDirectiveSinceAgent) { currentAgents = []; sawDirectiveSinceAgent = false; }
      currentAgents.push(value.toLowerCase());
      continue;
    }
    if (field === 'disallow' || field === 'allow') {
      sawDirectiveSinceAgent = true;
      const rule: RobotsRule = { allow: field === 'allow', path: value };
      for (const a of currentAgents) {
        if (a === '*') starRules.push(rule);
        else if (ROBOTS_UA_TOKEN.includes(a) || a.includes(ROBOTS_UA_TOKEN)) uaRules.push(rule);
      }
    }
  }
  return uaRules.length > 0 ? uaRules : starRules;
}

/** Google 準拠の最長一致（同長は allow 優先）で path が許可されるか判定する */
export function isPathAllowed(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (r.path === '') continue; // 空の Disallow は「全許可」を意味するため無視
    if (path.startsWith(r.path)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) {
        best = r;
      }
    }
  }
  return best ? best.allow : true;
}

/** 対象URLが robots.txt 上クロール許可されているか。取得不可時は許可扱い。 */
async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  let origin: string; let path: string;
  try { const u = new URL(targetUrl); origin = u.origin; path = u.pathname + (u.search || ''); }
  catch { return true; }
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`);
    if (!res.ok) return true; // 404 等は「robots 無し＝全許可」
    const body = await readTextWithLimit(res, 512 * 1024);
    const rules = parseRobots(body);
    return isPathAllowed(rules, path);
  } catch {
    return true; // 取得失敗時はブロックしない（慣行）
  }
}

export async function fetchScrapeItems(source: Source): Promise<RawItem[]> {
  const config: ScrapeConfig = source.configJson
    ? JSON.parse(source.configJson)
    : { itemSelector: '', fields: {} };

  if (!config.itemSelector) {
    throw new Error('configJson.itemSelector が設定されていません');
  }

  // robots.txt を尊重し、許可されていないパスの取得は行わない
  const allowed = await isAllowedByRobots(source.url);
  if (!allowed) {
    throw new Error(`robots.txt によりクロールが許可されていません（${source.url}）。取込元の対象URL・パスをご確認ください。`);
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
