import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { verifyCronAuth } from '@/lib/auth';
import { runSource } from '@/lib/sources';
import { sendSlack } from '@/lib/slack';
import { SyncResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/sync
 * 有効な全 Source を順に実行する（1つの失敗で他を止めない）。
 * 新規 draft が1件以上できたら社内 Slack へ承認待ち通知を送る。
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const store = getStore();
  const sources = await store.listSources();
  const enabledSources = sources.filter((s) => s.enabled);

  const results: SyncResult[] = [];
  let totalCreated = 0;

  for (const source of enabledSources) {
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

  let notified = false;
  if (totalCreated > 0) {
    const result = await sendSlack(
      `🤖 自動取込: 新規${totalCreated}件が承認待ちに入りました。管理画面で承認してください。`,
      'admin',
    );
    notified = result.sent;
  }

  return NextResponse.json({ results, notified });
}
