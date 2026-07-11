import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { requireAdmin } from '@/lib/auth';
import { isSourceType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/admin/sources — 取込元一覧を返す */
export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const store = getStore();
  const sources = await store.listSources();
  return NextResponse.json({ sources });
}

/** POST /api/admin/sources — 取込元を新規作成する */
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

  const name = b.name;
  const type = b.type;
  const url = b.url;
  const configJson = b.configJson;
  const enabled = b.enabled;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: '名前を入力してください' }, { status: 400 });
  }
  if (!isSourceType(type)) {
    return NextResponse.json({ error: '種別が不正です' }, { status: 400 });
  }
  if (typeof url !== 'string' || url.trim().length === 0) {
    return NextResponse.json({ error: 'URLを入力してください' }, { status: 400 });
  }
  if (typeof configJson !== 'string' || configJson.trim().length === 0) {
    return NextResponse.json({ error: '設定(configJson)を入力してください' }, { status: 400 });
  }
  try {
    JSON.parse(configJson);
  } catch {
    return NextResponse.json({ error: '設定(configJson)がJSONとして不正です' }, { status: 400 });
  }
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled は真偽値で指定してください' }, { status: 400 });
  }

  const store = getStore();
  const source = await store.createSource({
    name: name.trim(),
    type,
    url: url.trim(),
    configJson,
    enabled,
  });

  return NextResponse.json({ source });
}
