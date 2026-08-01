import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { CRAWL_CURSOR_KEY, DEFAULT_BATCH_LIMIT, runCrawlBatch } from '@/lib/crawl';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/crawl — 管理画面から巡回を手動実行する。
 *
 * cron を待たずに動作確認したいとき用。middleware で管理者Cookie必須のため
 * CRON_SECRET は不要。cron と同じくカーソル方式なので、途中で終わっても
 * もう一度押せば続きから処理される。
 *
 * body: { restart?: boolean, limit?: number }
 *   restart=true で先頭から。省略時は保存済みカーソルの続きから。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { restart?: boolean; limit?: number };
  const limit =
    typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 200) : DEFAULT_BATCH_LIMIT;

  const store = getStore();
  const savedCursor = Number((await store.getMeta(CRAWL_CURSOR_KEY)) ?? '0') || 0;
  const restart = body.restart === true || savedCursor === 0;

  const result = await runCrawlBatch(store, { limit, restart, timeBudgetMs: 45_000 });

  return NextResponse.json({
    restart,
    processed: result.processed,
    done: result.done,
    nextCursor: result.nextCursor,
    created: result.results.reduce((n, r) => n + r.created, 0),
    updated: result.results.reduce((n, r) => n + r.updated, 0),
    failed: result.results.filter((r) => r.error).length,
    results: result.results,
  });
}
