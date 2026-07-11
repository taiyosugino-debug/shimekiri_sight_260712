import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { verifyCronAuth } from '@/lib/auth';
import { joinCompanies } from '@/lib/filters';
import { isExpired, daysUntil } from '@/lib/date';
import { buildDigestText, sendSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

const DIGEST_DAYS_WITHIN = 3;
const ARCHIVE_AFTER_DAYS = 30;

/**
 * GET /api/cron/digest
 * published エントリーの締切ダイジェスト（3日以内）を受講生 Slack へ送信する。
 * あわせて「締切から30日以上経過した published」を archived へ自動更新する。
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const store = getStore();
  const now = new Date();
  const [entries, companies] = await Promise.all([store.listEntries(), store.listCompanies()]);

  // ダイジェスト対象: published かつ未経過・残り3日以内
  const published = entries.filter(
    (e) =>
      e.status === 'published' &&
      !isExpired(e.deadlineAt, now) &&
      daysUntil(e.deadlineAt, now) <= DIGEST_DAYS_WITHIN,
  );
  const withCompany = joinCompanies(published, companies);
  const text = buildDigestText(withCompany, DIGEST_DAYS_WITHIN, now);
  const sendResult = await sendSlack(text, 'main');

  // 締切から30日以上経過した published を archived へ
  let archived = 0;
  for (const e of entries) {
    if (e.status !== 'published') continue;
    if (!isExpired(e.deadlineAt, now)) continue;
    const daysPast = -daysUntil(e.deadlineAt, now);
    if (daysPast >= ARCHIVE_AFTER_DAYS) {
      const updated = await store.updateEntry(e.id, { status: 'archived' });
      if (updated) archived += 1;
    }
  }

  return NextResponse.json({ ok: true, sent: sendResult.sent, text, archived });
}
