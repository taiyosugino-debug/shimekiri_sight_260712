// =============================================================
// 企業マスター巡回（週次クロール）ランナー
//
// 企業マスターの recruitUrl（無ければ hpUrl）を1社ずつ取得し、
// 締切らしき情報を抽出して review タブへ書き出す。
// entries には一切書き込まない。公開されるのは人が「承認」した分だけ。
//
// 実行時間の制約:
//   Vercel の関数には実行時間の上限があるため、500社を1回では回りきれない。
//   カーソル（次に処理する企業のインデックス）を meta タブに保存し、
//   時間予算いっぱいまで処理して中断 → 次回起動で続きから再開する。
// =============================================================

import * as cheerio from 'cheerio';
import { nowIso } from '../date';
import { fetchWithTimeout } from '../sources';
import { isAllowedByRobots } from '../sources/scrape';
import { Company, CrawlCompanyResult, CrawlRunResult, ReviewItem, ReviewItemInput, Store } from '../types';
import {
  buildTitle,
  contentHash,
  findDateCandidates,
  guessEntryType,
  judgeCandidates,
  normalizeWhitespace,
} from './extract';

/** meta タブに保存するキー */
export const CRAWL_CURSOR_KEY = 'crawl_cursor';
export const CRAWL_STARTED_AT_KEY = 'crawl_started_at';

/** 1回の起動で処理する最大社数（安全弁） */
export const DEFAULT_BATCH_LIMIT = 40;
/** 1回の起動で使う時間予算(ms)。これを超えたら中断してカーソルを保存する */
export const DEFAULT_TIME_BUDGET_MS = 40_000;
/** 相手サイトへの連続アクセスを避けるための待機(ms) */
export const POLITE_DELAY_MS = 400;
/** 本文として読み込む最大バイト数 */
const MAX_HTML_BYTES = 2 * 1024 * 1024;
/**
 * 1社あたりの処理時間の上限(ms)。
 * robots.txt 取得と本文取得はそれぞれ独立にタイムアウトを持つため、
 * これが無いと1社で最悪90秒近くかかり、関数が強制終了してカーソルが進まなくなる。
 */
export const PER_COMPANY_TIMEOUT_MS = 12_000;

/** 巡回してはいけないホスト（内部ネットワーク・クラウドのメタデータ等） */
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', 'metadata.google.internal']);

/**
 * ホスト名が内部ネットワーク宛かどうかを判定する。
 * 巡回先URLは管理者が登録するものだが、誤登録や悪意ある入力で
 * 内部サービスの内容を review タブへ持ち出せてしまうのを防ぐ。
 */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(h) || BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true;
  if (h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  // IPv4 のプライベート・リンクローカル・ループバック帯
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // クラウドのメタデータ 169.254.169.254 を含む
  }
  // IPv6 のループバック・ユニークローカル・リンクローカル
  if (h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

/** 与えた Promise に上限時間を掛ける */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}が${Math.round(ms / 1000)}秒以内に終わりませんでした`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * レスポンスを文字コードを見てデコードする。
 * 日本語の採用ページには Shift_JIS / EUC-JP が今も残っており、
 * UTF-8 固定でデコードすると「年」「月」「日」が壊れて日付を1件も拾えなくなる。
 */
export async function decodeHtml(res: Response, maxBytes: number): Promise<string> {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf);

  const fromHeader = charsetFromContentType(res.headers.get('content-type'));
  // charset 判定用に、まず ASCII 互換として先頭を読んで <meta charset> を探す
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096));
  const fromMeta =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)?.[1] ??
    charsetFromContentType(head.match(/<meta[^>]+content\s*=\s*["']([^"']*charset=[^"']*)["']/i)?.[1] ?? null);

  const charset = normalizeCharset(fromHeader ?? fromMeta ?? 'utf-8');
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

function charsetFromContentType(value: string | null): string | null {
  if (!value) return null;
  return value.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? null;
}

function normalizeCharset(cs: string): string {
  const c = cs.trim().toLowerCase();
  if (c === 'shift-jis' || c === 'x-sjis' || c === 'ms_kanji') return 'shift_jis';
  if (c === 'euc_jp') return 'euc-jp';
  return c;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 巡回対象URLを決める。採用ページURLを優先し、無ければ企業HPを使う */
export function resolveCrawlUrl(company: Company): string | undefined {
  const url = company.recruitUrl?.trim() || company.hpUrl?.trim();
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (isBlockedHost(u.hostname)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** HTML から本文テキストとページタイトルを取り出す */
export function htmlToText(html: string): { text: string; pageTitle: string } {
  const $ = cheerio.load(html);
  // 本文に関係しない要素は落とす（スクリプト内の日付を拾わないため）
  $('script, style, noscript, svg, iframe').remove();
  const pageTitle = normalizeWhitespace($('title').first().text() || '');
  const text = normalizeWhitespace($('body').text() || '');
  return { text, pageTitle };
}

/** review 行を一意に特定するキー（企業 × ページURL） */
export function reviewKey(companyId: string, pageUrl: string): string {
  return `${companyId} ${pageUrl}`;
}

export interface CrawlCompanyOptions {
  now?: Date;
  /** テスト用にHTML取得を差し替えるためのフック */
  fetchHtml?: (url: string) => Promise<string>;
  /** テスト用に robots 判定を差し替えるためのフック */
  checkRobots?: (url: string) => Promise<boolean>;
}

/**
 * 1社を巡回し、review タブを更新する。
 * 同じ企業・同じページの行はキーで特定して上書きし、行が増え続けないようにする。
 */
export async function crawlCompany(
  company: Company,
  store: Store,
  existingByKey: Map<string, ReviewItem>,
  opts: CrawlCompanyOptions = {},
): Promise<CrawlCompanyResult> {
  const now = opts.now ?? new Date();
  const pageUrl = resolveCrawlUrl(company);
  const base: CrawlCompanyResult = {
    companyId: company.id,
    companyName: company.name,
    pageUrl: pageUrl ?? '',
    found: 0,
    created: 0,
    updated: 0,
  };

  if (!pageUrl) {
    return { ...base, error: '採用ページURL・企業HPどちらも未登録のため巡回できません' };
  }

  // robots.txt の確認（禁止されていれば取得せず中止）
  const robotsCheck = opts.checkRobots ?? isAllowedByRobots;
  if (!(await robotsCheck(pageUrl))) {
    return { ...base, robotsBlocked: true, error: 'robots.txt によりクロールが許可されていないため中止しました' };
  }

  let html: string;
  try {
    if (opts.fetchHtml) {
      html = await opts.fetchHtml(pageUrl);
    } else {
      const res = await fetchWithTimeout(pageUrl);
      if (!res.ok) return { ...base, error: `ページを取得できませんでした (HTTP ${res.status})` };
      const lenHeader = res.headers.get('content-length');
      if (lenHeader && Number(lenHeader) > MAX_HTML_BYTES) {
        return { ...base, error: `ページが大きすぎます（${lenHeader} バイト）` };
      }
      html = await decodeHtml(res, MAX_HTML_BYTES);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, error: `取得エラー: ${message}` };
  }

  const { text, pageTitle } = htmlToText(html);
  const hash = contentHash(text);

  const existing = existingByKey.get(reviewKey(company.id, pageUrl));
  const candidates = findDateCandidates(text);
  const judgement = judgeCandidates({ candidates, previousDeadlineAt: existing?.deadlineAt, now });

  // 前回から本文がまったく変わっていないなら、その旨を理由に足す（人の確認負荷を下げる）
  const reasons = [...judgement.reasons];
  if (existing && existing.contentHash === hash) {
    reasons.push('前回の巡回からページの内容に変化はありません');
  }

  const guessedType = guessEntryType(`${pageTitle} ${text.slice(0, 2000)}`);

  // 機械が毎回上書きしてよい列だけをここに入れる。
  // decision（承認判断）と、人が手で直したかもしれない deadlineAt / type は下で個別に扱う。
  const input: Partial<ReviewItemInput> & { companyId: string } = {
    companyId: company.id,
    companyName: company.name,
    pageUrl,
    title: buildTitle(pageTitle, judgement.chosen, company.name),
    deadlineText: judgement.chosen ? judgement.chosen.context : '',
    confidence: judgement.confidence,
    reasons: reasons.join(' / '),
    contentHash: hash,
    lastSeenAt: nowIso(),
  };

  if (!existing) {
    await store.createReviewItem({
      ...input,
      companyName: company.name,
      pageUrl,
      title: input.title ?? company.name,
      deadlineText: input.deadlineText ?? '',
      confidence: judgement.confidence,
      reasons: input.reasons ?? '',
      contentHash: hash,
      deadlineAt: judgement.deadlineAt,
      type: guessedType,
      decision: '未確認',
      firstSeenAt: nowIso(),
    });
    return { ...base, found: candidates.length, created: 1 };
  }

  // --- 既存行の更新 ---
  // 人が review タブの deadline_at を手で埋めている場合がある（promote がそれを促している）。
  // 機械が解釈できなかったときに undefined で潰すと、その手入力が毎週消えてしまう。
  // そのため「機械が値を出せたときだけ」上書きする。
  if (judgement.deadlineAt) {
    input.previousDeadlineAt = existing.deadlineAt;
    input.deadlineAt = judgement.deadlineAt;
  }
  if (guessedType && !existing.type) {
    input.type = guessedType;
  }

  // 取込済の行で締切が変わったら、未確認に戻して人の目に触れるようにする。
  // そうしないと公開済み Entry の締切が古いまま誰にも気付かれない。
  if (
    existing.decision === '取込済' &&
    judgement.deadlineAt &&
    existing.deadlineAt &&
    judgement.deadlineAt !== existing.deadlineAt
  ) {
    input.decision = '未確認';
    input.reasons = `【取込済の締切が変わりました】${existing.deadlineAt.slice(0, 10)} → ${judgement.deadlineAt.slice(0, 10)}。公開中の情報が古い可能性があります / ${input.reasons ?? ''}`;
  }

  await store.updateReviewItem(existing.id, input);
  return { ...base, found: candidates.length, updated: 1 };
}

export interface RunCrawlOptions {
  /** 開始位置。省略時は meta の保存値から再開 */
  cursor?: number;
  limit?: number;
  timeBudgetMs?: number;
  now?: Date;
  /** true なら先頭から巡回し直す（週次の開始時） */
  restart?: boolean;
  politeDelayMs?: number;
  perCompanyTimeoutMs?: number;
  crawlOptions?: CrawlCompanyOptions;
}

/**
 * 企業マスターを cursor 位置から順に巡回する。
 * 時間予算または件数上限に達したら中断し、次回再開位置を返す。
 */
export async function runCrawlBatch(store: Store, opts: RunCrawlOptions = {}): Promise<CrawlRunResult> {
  const startedAt = nowIso();
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DEFAULT_BATCH_LIMIT;
  const timeBudgetMs = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const politeDelayMs = opts.politeDelayMs ?? POLITE_DELAY_MS;
  const perCompanyTimeoutMs = opts.perCompanyTimeoutMs ?? PER_COMPANY_TIMEOUT_MS;
  const deadline = Date.now() + timeBudgetMs;

  const companies = await store.listCompanies();

  let cursor: number;
  if (opts.restart) {
    cursor = 0;
  } else if (typeof opts.cursor === 'number') {
    cursor = opts.cursor;
  } else {
    const saved = await store.getMeta(CRAWL_CURSOR_KEY);
    cursor = saved ? Number(saved) || 0 : 0;
  }
  if (cursor < 0 || cursor >= companies.length) cursor = 0;

  // 既存 review 行を一度だけ読み、キーで引けるようにしておく（毎社読み直さない）
  const existingByKey = new Map<string, ReviewItem>();
  for (const item of await store.listReviewItems()) {
    existingByKey.set(reviewKey(item.companyId, item.pageUrl), item);
  }

  const results: CrawlCompanyResult[] = [];
  let i = cursor;
  while (i < companies.length && results.length < limit) {
    // 最低1社は処理してから時間切れ判定をする（毎回0件で終わるのを防ぐ）
    if (results.length > 0 && Date.now() >= deadline) break;
    const company = companies[i];
    try {
      // 1社あたりに上限時間を掛ける。遅いサイトが1社あるだけで関数全体が
      // 強制終了し、カーソルが永久に進まなくなるのを防ぐ。
      results.push(
        await withTimeout(
          crawlCompany(company, store, existingByKey, { now, ...opts.crawlOptions }),
          perCompanyTimeoutMs,
          `${company.name} の巡回`,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        companyId: company.id,
        companyName: company.name,
        pageUrl: resolveCrawlUrl(company) ?? '',
        found: 0,
        created: 0,
        updated: 0,
        error: `想定外のエラー: ${message}`,
      });
    }
    i += 1;
    // 1社終えるごとにカーソルを保存する。途中で関数が強制終了しても
    // 次回はここから再開でき、同じ数社を延々と再取得し続けることがない。
    try {
      await store.setMeta(CRAWL_CURSOR_KEY, String(i >= companies.length ? 0 : i));
    } catch {
      // カーソル保存の失敗で巡回自体を止めない
    }
    if (i < companies.length && politeDelayMs > 0 && Date.now() < deadline) {
      await sleep(politeDelayMs);
    }
  }

  const done = i >= companies.length;
  if (opts.restart) await store.setMeta(CRAWL_STARTED_AT_KEY, startedAt);

  return { startedAt, processed: results.length, nextCursor: done ? null : i, done, results };
}
