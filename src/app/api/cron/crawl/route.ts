import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { verifyCronAuth } from '@/lib/auth';
import { jstParts } from '@/lib/date';
import { CRAWL_CURSOR_KEY, DEFAULT_BATCH_LIMIT, runCrawlBatch } from '@/lib/crawl';
import { promoteApprovedReviewItems } from '@/lib/crawl/promote';
import { sendSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';
// Vercel の関数実行上限。カーソル方式で分割するため、1回はこの範囲に収める。
export const maxDuration = 60;

/**
 * GET /api/cron/crawl
 *
 * 企業マスターの採用ページを巡回し、締切候補を review タブへ書き出す。
 * cron は日次で起動してよく、本ルートが次のように振る舞う。
 *
 *   - 毎回: review タブで「承認」された行を entries へ取り込む（承認の反映を1日以内にする）
 *   - 火曜(JST): 新しい巡回を先頭から開始する
 *   - 火曜以外: 前回の巡回が途中なら続きを処理する。終わっていれば何もしない
 *
 * 500社を1回で回りきれないため、時間予算いっぱいまで処理してカーソルを保存し、
 * 翌日以降の起動で続きから再開する設計。相手サイトへの負荷も分散される。
 *
 * クエリ:
 *   ?force=1  曜日に関係なく巡回を実行する（手動確認用）
 *   ?limit=N  1回で処理する社数の上限
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : DEFAULT_BATCH_LIMIT;

  const store = getStore();

  // ---- 1. 承認済みの反映（曜日に関係なく毎回行う） ----
  const promoted = await promoteApprovedReviewItems(store);

  // ---- 2. 巡回するかどうかの判定 ----
  const jstDow = jstParts(new Date()).dow; // 0=日, 2=火
  const savedCursor = Number((await store.getMeta(CRAWL_CURSOR_KEY)) ?? '0') || 0;
  const inProgress = savedCursor > 0;
  const isTuesday = jstDow === 2;

  if (!force && !isTuesday && !inProgress) {
    return NextResponse.json({
      promoted,
      crawl: {
        skipped: true,
        reason: '週次実行（毎週火曜・JST）のため、火曜以外で未実行の場合はスキップしました',
        weekdayJst: jstDow,
      },
    });
  }

  // 火曜かつ途中でない場合のみ先頭から開始。途中なら続きから。
  const restart = (isTuesday || force) && !inProgress;
  const crawl = await runCrawlBatch(store, { limit, restart });

  // ---- 3. 要確認（確信度「低」）が出たら社内へ通知 ----
  let notified = false;
  const newlyFound = crawl.results.reduce((sum, r) => sum + r.created + r.updated, 0);
  if (crawl.done && newlyFound > 0) {
    const errors = crawl.results.filter((r) => r.error).length;
    const message =
      `🔎 巡回が完了しました。review タブに ${newlyFound} 件を書き出しました` +
      (errors > 0 ? `（うち ${errors} 社は取得できず）` : '') +
      '。「承認」列に OK を入れると次回の実行で承認待ちに取り込まれます。';
    const slack = await sendSlack(message, 'admin');
    notified = slack.sent;
  }

  return NextResponse.json({
    promoted,
    crawl: {
      skipped: false,
      restart,
      processed: crawl.processed,
      nextCursor: crawl.nextCursor,
      done: crawl.done,
      results: crawl.results,
    },
    notified,
  });
}
