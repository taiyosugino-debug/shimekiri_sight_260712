import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { parseReviewDecision, REVIEW_DECISIONS } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/review/[id] — 管理画面から承認状態や締切を直す */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'リクエストが不正です' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ('decision' in b) {
    const decision = parseReviewDecision(b.decision);
    if (!REVIEW_DECISIONS.includes(decision)) {
      return NextResponse.json({ error: '承認状態が不正です' }, { status: 400 });
    }
    patch.decision = decision;
  }
  if ('deadlineAt' in b) {
    const v = b.deadlineAt;
    if (v !== undefined && v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: '締切が不正です' }, { status: 400 });
    }
    patch.deadlineAt = typeof v === 'string' && v.trim() ? v.trim() : undefined;
  }

  const store = getStore();
  const updated = await store.updateReviewItem(id, patch);
  if (!updated) return NextResponse.json({ error: '見つかりませんでした' }, { status: 404 });
  return NextResponse.json({ item: updated });
}

/** DELETE /api/admin/review/[id] */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const ok = await store.deleteReviewItem(id);
  if (!ok) return NextResponse.json({ error: '見つかりませんでした' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
