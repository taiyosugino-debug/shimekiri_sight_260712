import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { joinCompanies } from '@/lib/filters';
import { isExpired, daysUntil } from '@/lib/date';
import { buildDigestText, sendSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/slack
 * body { action:'test' } — テストメッセージ送信
 * body { action:'digest', daysWithin: 1|3|7 } — 締切ダイジェストを受講生 Slack へ送信
 */
export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const action = b.action;

  if (action === 'test') {
    const text = '🔔 Abuild 締切ナビ｜テスト送信\nこのメッセージが届いていれば Slack 連携は正常です。';
    const result = await sendSlack(text, 'main');
    return NextResponse.json({ ok: true, sent: result.sent, text });
  }

  if (action === 'digest') {
    const daysWithin = b.daysWithin;
    if (daysWithin !== 1 && daysWithin !== 3 && daysWithin !== 7) {
      return NextResponse.json({ error: 'daysWithin は 1, 3, 7 のいずれかを指定してください' }, { status: 400 });
    }

    const store = getStore();
    const [entries, companies] = await Promise.all([store.listEntries(), store.listCompanies()]);
    const now = new Date();
    const published = entries.filter(
      (e) => e.status === 'published' && !isExpired(e.deadlineAt, now) && daysUntil(e.deadlineAt, now) <= daysWithin,
    );
    const withCompany = joinCompanies(published, companies);

    const text = buildDigestText(withCompany, daysWithin, now);
    const result = await sendSlack(text, 'main');
    return NextResponse.json({ ok: true, sent: result.sent, text });
  }

  return NextResponse.json({ error: 'action は test または digest を指定してください' }, { status: 400 });
}
