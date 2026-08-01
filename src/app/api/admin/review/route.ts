import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { promoteApprovedReviewItems } from '@/lib/crawl/promote';

export const dynamic = 'force-dynamic';

/** GET /api/admin/review — 要確認リストを返す（確信度が低い順・企業名順） */
export async function GET() {
  const store = getStore();
  const items = await store.listReviewItems();
  const order: Record<string, number> = { 低: 0, 中: 1, 高: 2 };
  items.sort((a, b) => {
    const d = (order[a.confidence] ?? 9) - (order[b.confidence] ?? 9);
    if (d !== 0) return d;
    return a.companyName.localeCompare(b.companyName, 'ja');
  });
  return NextResponse.json({ items });
}

/**
 * POST /api/admin/review — 「承認」が付いた行を entries へ取り込む。
 * スプレッドシートで承認した内容を、次の cron を待たずに反映したいとき用。
 */
export async function POST() {
  const store = getStore();
  const result = await promoteApprovedReviewItems(store);
  return NextResponse.json({ result });
}
