import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { isSourceType, SourceInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/sources/[id] — 取込元の部分更新 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const existing = await store.getSource(id);
  if (!existing) {
    return NextResponse.json({ error: '指定された取込元が見つかりません' }, { status: 404 });
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

  const patch: Partial<SourceInput> = {};

  if ('name' in b) {
    const name = b.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '名前を入力してください' }, { status: 400 });
    }
    patch.name = name.trim();
  }

  if ('type' in b) {
    const type = b.type;
    if (!isSourceType(type)) {
      return NextResponse.json({ error: '種別が不正です' }, { status: 400 });
    }
    patch.type = type;
  }

  if ('url' in b) {
    const url = b.url;
    if (typeof url !== 'string' || url.trim().length === 0) {
      return NextResponse.json({ error: 'URLを入力してください' }, { status: 400 });
    }
    patch.url = url.trim();
  }

  if ('configJson' in b) {
    const configJson = b.configJson;
    if (typeof configJson !== 'string' || configJson.trim().length === 0) {
      return NextResponse.json({ error: '設定(configJson)を入力してください' }, { status: 400 });
    }
    try {
      JSON.parse(configJson);
    } catch {
      return NextResponse.json({ error: '設定(configJson)がJSONとして不正です' }, { status: 400 });
    }
    patch.configJson = configJson;
  }

  if ('enabled' in b) {
    const enabled = b.enabled;
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled は真偽値で指定してください' }, { status: 400 });
    }
    patch.enabled = enabled;
  }

  const updated = await store.updateSource(id, patch);
  if (!updated) {
    return NextResponse.json({ error: '指定された取込元が見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ source: updated });
}

/** DELETE /api/admin/sources/[id] — 取込元を削除する */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { id } = await params;
  const store = getStore();
  const ok = await store.deleteSource(id);
  if (!ok) {
    return NextResponse.json({ error: '指定された取込元が見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
