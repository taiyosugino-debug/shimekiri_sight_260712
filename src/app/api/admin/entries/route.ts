import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { joinCompanies } from '@/lib/filters';
import { isEntryStatus, isEntryType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/admin/entries?status=&q= — 全 status を deadline 昇順で返す */
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q')?.trim().toLowerCase();

  const store = getStore();
  const [entries, companies] = await Promise.all([store.listEntries(), store.listCompanies()]);
  let withCompany = joinCompanies(entries, companies);

  if (status && isEntryStatus(status)) {
    withCompany = withCompany.filter((e) => e.status === status);
  }
  if (q) {
    withCompany = withCompany.filter((e) => `${e.company.name} ${e.title}`.toLowerCase().includes(q));
  }

  withCompany.sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());

  return NextResponse.json({ entries: withCompany });
}

/** POST /api/admin/entries — 新規締切を作成する */
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

  const companyId = b.companyId;
  const title = b.title;
  const type = b.type;
  const gradYear = b.gradYear;
  const deadlineAt = b.deadlineAt;
  const difficulty = b.difficulty;

  if (typeof companyId !== 'string' || companyId.length === 0) {
    return NextResponse.json({ error: '企業を選択してください' }, { status: 400 });
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 });
  }
  if (!isEntryType(type)) {
    return NextResponse.json({ error: '種別が不正です' }, { status: 400 });
  }
  if (typeof gradYear !== 'number' || !Number.isInteger(gradYear)) {
    return NextResponse.json({ error: '卒業年度が不正です' }, { status: 400 });
  }
  if (typeof deadlineAt !== 'string' || Number.isNaN(new Date(deadlineAt).getTime())) {
    return NextResponse.json({ error: '締切日時が不正です' }, { status: 400 });
  }
  if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 5) {
    return NextResponse.json({ error: '難易度は1〜5で指定してください' }, { status: 400 });
  }

  const store = getStore();
  const company = await store.getCompany(companyId);
  if (!company) {
    return NextResponse.json({ error: '指定された企業が見つかりません' }, { status: 400 });
  }

  const status = b.status;
  if (status !== undefined && !isEntryStatus(status)) {
    return NextResponse.json({ error: 'ステータスが不正です' }, { status: 400 });
  }

  const entry = await store.createEntry({
    companyId,
    title: title.trim(),
    type,
    gradYear,
    deadlineAt,
    difficulty,
    applyUrl: typeof b.applyUrl === 'string' && b.applyUrl.trim() ? b.applyUrl.trim() : undefined,
    description: typeof b.description === 'string' && b.description.trim() ? b.description.trim() : undefined,
    sourceUrl: typeof b.sourceUrl === 'string' && b.sourceUrl.trim() ? b.sourceUrl.trim() : undefined,
    selectionFlow: typeof b.selectionFlow === 'string' && b.selectionFlow.trim() ? b.selectionFlow.trim() : undefined,
    webTest: typeof b.webTest === 'string' && b.webTest.trim() ? b.webTest.trim() : undefined,
    eventSchedule: typeof b.eventSchedule === 'string' && b.eventSchedule.trim() ? b.eventSchedule.trim() : undefined,
    eventPeriod: typeof b.eventPeriod === 'string' && b.eventPeriod.trim() ? b.eventPeriod.trim() : undefined,
    status: status ?? 'draft',
    pickup: typeof b.pickup === 'boolean' ? b.pickup : false,
    source: 'manual',
  });

  return NextResponse.json({ entry });
}
