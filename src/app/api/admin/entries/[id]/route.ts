import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { joinCompanies } from '@/lib/filters';
import { EntryInput, isEntryStatus, isEntryType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/admin/entries/[id] — 締切1件を企業情報付きで返す */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const entry = await store.getEntry(id);
  if (!entry) {
    return NextResponse.json({ error: '指定された締切が見つかりません' }, { status: 404 });
  }
  const company = await store.getCompany(entry.companyId);
  if (!company) {
    return NextResponse.json({ error: '指定された締切が見つかりません' }, { status: 404 });
  }
  const [withCompany] = joinCompanies([entry], [company]);
  return NextResponse.json({ entry: withCompany });
}

/** PATCH /api/admin/entries/[id] — 締切の部分更新（EntryInput の Partial） */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const existing = await store.getEntry(id);
  if (!existing) {
    return NextResponse.json({ error: '指定された締切が見つかりません' }, { status: 404 });
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

  const patch: Partial<EntryInput> = {};

  if ('companyId' in b) {
    const companyId = b.companyId;
    if (typeof companyId !== 'string' || companyId.length === 0) {
      return NextResponse.json({ error: '企業を選択してください' }, { status: 400 });
    }
    const company = await store.getCompany(companyId);
    if (!company) {
      return NextResponse.json({ error: '指定された企業が見つかりません' }, { status: 400 });
    }
    patch.companyId = companyId;
  }

  if ('title' in b) {
    const title = b.title;
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 });
    }
    patch.title = title.trim();
  }

  if ('type' in b) {
    const type = b.type;
    if (!isEntryType(type)) {
      return NextResponse.json({ error: '種別が不正です' }, { status: 400 });
    }
    patch.type = type;
  }

  if ('gradYear' in b) {
    const gradYear = b.gradYear;
    if (typeof gradYear !== 'number' || !Number.isInteger(gradYear)) {
      return NextResponse.json({ error: '卒業年度が不正です' }, { status: 400 });
    }
    patch.gradYear = gradYear;
  }

  if ('deadlineAt' in b) {
    const deadlineAt = b.deadlineAt;
    if (typeof deadlineAt !== 'string' || Number.isNaN(new Date(deadlineAt).getTime())) {
      return NextResponse.json({ error: '締切日時が不正です' }, { status: 400 });
    }
    patch.deadlineAt = deadlineAt;
  }

  if ('difficulty' in b) {
    const difficulty = b.difficulty;
    if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 5) {
      return NextResponse.json({ error: '難易度は1〜5で指定してください' }, { status: 400 });
    }
    patch.difficulty = difficulty;
  }

  if ('applyUrl' in b) {
    const applyUrl = b.applyUrl;
    if (applyUrl !== undefined && applyUrl !== null && typeof applyUrl !== 'string') {
      return NextResponse.json({ error: 'エントリーURLが不正です' }, { status: 400 });
    }
    patch.applyUrl = typeof applyUrl === 'string' && applyUrl.trim() ? applyUrl.trim() : undefined;
  }

  if ('description' in b) {
    const description = b.description;
    if (description !== undefined && description !== null && typeof description !== 'string') {
      return NextResponse.json({ error: '説明文が不正です' }, { status: 400 });
    }
    patch.description = typeof description === 'string' && description.trim() ? description.trim() : undefined;
  }

  if ('sourceUrl' in b) {
    const sourceUrl = b.sourceUrl;
    if (sourceUrl !== undefined && sourceUrl !== null && typeof sourceUrl !== 'string') {
      return NextResponse.json({ error: '情報源URLが不正です' }, { status: 400 });
    }
    patch.sourceUrl = typeof sourceUrl === 'string' && sourceUrl.trim() ? sourceUrl.trim() : undefined;
  }

  if ('selectionFlow' in b) {
    const selectionFlow = b.selectionFlow;
    if (selectionFlow !== undefined && selectionFlow !== null && typeof selectionFlow !== 'string') {
      return NextResponse.json({ error: '選考の流れが不正です' }, { status: 400 });
    }
    patch.selectionFlow = typeof selectionFlow === 'string' && selectionFlow.trim() ? selectionFlow.trim() : undefined;
  }

  if ('webTest' in b) {
    const webTest = b.webTest;
    if (webTest !== undefined && webTest !== null && typeof webTest !== 'string') {
      return NextResponse.json({ error: 'Webテストの種類が不正です' }, { status: 400 });
    }
    patch.webTest = typeof webTest === 'string' && webTest.trim() ? webTest.trim() : undefined;
  }

  if ('eventSchedule' in b) {
    const eventSchedule = b.eventSchedule;
    if (eventSchedule !== undefined && eventSchedule !== null && typeof eventSchedule !== 'string') {
      return NextResponse.json({ error: '開催日程が不正です' }, { status: 400 });
    }
    patch.eventSchedule = typeof eventSchedule === 'string' && eventSchedule.trim() ? eventSchedule.trim() : undefined;
  }

  if ('eventPeriod' in b) {
    const eventPeriod = b.eventPeriod;
    if (eventPeriod !== undefined && eventPeriod !== null && typeof eventPeriod !== 'string') {
      return NextResponse.json({ error: '開催期間が不正です' }, { status: 400 });
    }
    patch.eventPeriod = typeof eventPeriod === 'string' && eventPeriod.trim() ? eventPeriod.trim() : undefined;
  }

  if ('status' in b) {
    const status = b.status;
    if (!isEntryStatus(status)) {
      return NextResponse.json({ error: 'ステータスが不正です' }, { status: 400 });
    }
    patch.status = status;
  }

  if ('pickup' in b) {
    const pickup = b.pickup;
    if (typeof pickup !== 'boolean') {
      return NextResponse.json({ error: 'pickup は真偽値で指定してください' }, { status: 400 });
    }
    patch.pickup = pickup;
  }

  if ('source' in b) {
    const source = b.source;
    if (typeof source !== 'string' || source.length === 0) {
      return NextResponse.json({ error: 'source が不正です' }, { status: 400 });
    }
    patch.source = source;
  }

  const updated = await store.updateEntry(id, patch);
  if (!updated) {
    return NextResponse.json({ error: '指定された締切が見つかりません' }, { status: 404 });
  }
  const company = await store.getCompany(updated.companyId);
  if (!company) {
    return NextResponse.json({ entry: updated });
  }
  const [withCompany] = joinCompanies([updated], [company]);
  return NextResponse.json({ entry: withCompany });
}

/** DELETE /api/admin/entries/[id] — 締切を削除する */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const ok = await store.deleteEntry(id);
  if (!ok) {
    return NextResponse.json({ error: '指定された締切が見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
