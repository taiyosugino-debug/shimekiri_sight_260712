import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { verifyCronAuth } from '@/lib/auth';
import { jstParts } from '@/lib/date';
import { runSource } from '@/lib/sources';
import { CRAWL_CURSOR_KEY, DEFAULT_BATCH_LIMIT, runCrawlBatch } from '@/lib/crawl';
import { promoteApprovedReviewItems } from '@/lib/crawl/promote';
import { sendSlack } from '@/lib/slack';
import { Store, SyncResult } from '@/lib/types';

export const dynamic = 'force-dynamic';
// 巡回を含むため実行時間を確保する。カーソル方式でこの範囲に収める。
export const maxDuration = 60;
/** maxDuration に対して余裕を残した全体の時間予算 */
const TOTAL_BUDGET_MS = 50_000;

/**
 * GET /api/cron/sync — 日次で起動される単一の入口。
 *
 * Vercel Hobby プランは cron を2本までしか登録できず、既に sync と digest で
 * 使い切っている。そのため巡回専用の cron を増やさず、本ルートに集約している。
 * （/api/cron/crawl も残してあるが、そちらは手動実行用）
 *
 * 毎回行うこと:
 *   1. review タブで「承認」された行を entries へ取り込む
 *      → スプレッドシート上での承認が1日以内に反映される
 *   2. 前回の巡回が途中なら続きを処理する
 *      → 500社を1回で回りきれないため、数日かけて完了させる
 *
 * 火曜(JST)のみ行うこと:
 *   3. 企業マスターの巡回を先頭から開始する
 *   4. 登録済み取込元（rss/json/scrape）の同期
 *
 * クエリ:
 *   ?force=1  曜日に関係なくすべて実行する（手動確認用）
 *   ?limit=N  巡回で1回に処理する社数の上限
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const limitParam = Number(url.searchParams.get('limit'));
  // limit に上限を設けないと、1リクエストで全社への外向きアクセスを起こせてしまう
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : DEFAULT_BATCH_LIMIT;

  const startedMs = Date.now();
  const store = getStore();
  const jstDow = jstParts(new Date()).dow; // 0=日, 2=火
  const isTuesday = jstDow === 2;

  // ---- 1. 承認済みの反映（毎日） ----
  const promoted = await promoteApprovedReviewItems(store);

  // ---- 2. 取込元の同期（火曜のみ）----
  // 巡回より先に実行する。巡回は時間予算いっぱいまで使ってよい設計なので、
  // 後ろに置くと火曜の同期が毎回時間切れで実行されなくなる。
  const sync = isTuesday || force ? await runSources(store) : null;

  // ---- 3. 企業マスターの巡回（残り時間で処理できるぶんだけ）----
  const elapsed = Date.now() - startedMs;
  const crawlBudgetMs = Math.max(5_000, TOTAL_BUDGET_MS - elapsed);
  const crawl = await runCrawlStep(store, { isTuesday, force, limit, timeBudgetMs: crawlBudgetMs });

  const notified = await notifyIfNeeded(crawl, sync);

  return NextResponse.json({
    weekdayJst: jstDow,
    promoted,
    crawl,
    sync:
      sync ??
      {
        skipped: true,
        reason: '週次実行（毎週火曜・JST）のため、火曜以外はスキップしました',
      },
    notified,
  });
}

type CrawlStep =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      restart: boolean;
      processed: number;
      nextCursor: number | null;
      done: boolean;
      created: number;
      updated: number;
      failed: number;
    };

async function runCrawlStep(
  store: Store,
  o: { isTuesday: boolean; force: boolean; limit: number; timeBudgetMs: number },
): Promise<CrawlStep> {
  const savedCursor = Number((await store.getMeta(CRAWL_CURSOR_KEY)) ?? '0') || 0;
  const inProgress = savedCursor > 0;

  if (!o.force && !o.isTuesday && !inProgress) {
    return {
      skipped: true,
      reason: '巡回は毎週火曜(JST)開始です。前回分も完了しているため何もしませんでした',
    };
  }

  // 火曜かつ途中でない場合のみ先頭から。途中なら続きから。
  const restart = (o.isTuesday || o.force) && !inProgress;
  const result = await runCrawlBatch(store, { limit: o.limit, restart, timeBudgetMs: o.timeBudgetMs });

  return {
    skipped: false,
    restart,
    processed: result.processed,
    nextCursor: result.nextCursor,
    done: result.done,
    created: result.results.reduce((n, r) => n + r.created, 0),
    updated: result.results.reduce((n, r) => n + r.updated, 0),
    failed: result.results.filter((r) => r.error).length,
  };
}

async function runSources(store: Store): Promise<{ skipped: false; results: SyncResult[]; totalCreated: number }> {
  const sources = (await store.listSources()).filter((s) => s.enabled);
  const results: SyncResult[] = [];
  let totalCreated = 0;

  for (const source of sources) {
    try {
      const result = await runSource(source, store);
      results.push(result);
      totalCreated += result.created;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        fetched: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [`実行エラー: ${message}`],
      });
    }
  }
  return { skipped: false, results, totalCreated };
}

/** 人の確認が必要な件数が出たときだけ社内 Slack に通知する */
async function notifyIfNeeded(
  crawl: CrawlStep,
  sync: { totalCreated: number } | null,
): Promise<boolean> {
  const lines: string[] = [];

  if (!crawl.skipped && crawl.done) {
    const found = crawl.created + crawl.updated;
    if (found > 0) {
      lines.push(
        `🔎 巡回が完了しました。要確認リストに ${found} 件（新規 ${crawl.created} / 更新 ${crawl.updated}）` +
          (crawl.failed > 0 ? `、取得できなかった企業 ${crawl.failed} 社` : '') +
          '。スプレッドシートの review タブか管理画面の「要確認」から確認してください。',
      );
    }
  }
  if (sync && sync.totalCreated > 0) {
    lines.push(`🤖 自動取込: 新規${sync.totalCreated}件が承認待ちに入りました。`);
  }
  if (lines.length === 0) return false;

  const result = await sendSlack(lines.join('\n'), 'admin');
  return result.sent;
}
