// =============================================================
// 管理画面認証ユーティリティ（PROJECT_SPEC.md §6）
// Edge Middleware でも動くよう Web Crypto（crypto.subtle）のみを使用する。
// node:crypto は import しないこと。
// =============================================================

export const ADMIN_COOKIE_NAME = 'shimekiri_admin';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** 管理画面パスワード（未設定時はデモ用の既定値） */
export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'abuild-admin';
}

/** Cookie 署名鍵（未設定時は ADMIN_PASSWORD を流用） */
function getAuthSecret(): string {
  return process.env.AUTH_SECRET || getAdminPassword();
}

function textToBytes(s: string): Uint8Array<ArrayBuffer> {
  // TS の BufferSource 互換のため ArrayBuffer 基盤であることを明示
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** タイミング攻撃を避けるための定数時間比較（パスワード照合にも使用） */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, textToBytes(message));
  return bytesToHex(sig);
}

/** 管理画面用 Cookie の値を発行する（`${expMs}.${hex(HMAC)}`） */
export async function createAdminCookieValue(expiresAt: number = Date.now() + SEVEN_DAYS_MS): Promise<string> {
  const expMs = String(expiresAt);
  const sig = await hmacSha256Hex(getAuthSecret(), expMs);
  return `${expMs}.${sig}`;
}

/** Cookie の値が有効な署名かつ未失効かを検証する */
export async function verifyAdminCookieValue(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const [expMsStr, sig] = parts;
  const expMs = Number(expMsStr);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  const expected = await hmacSha256Hex(getAuthSecret(), expMsStr);
  return timingSafeEqual(expected, sig);
}

/** Cookie 発行時に使う共通オプション */
export function adminCookieOptions(maxAgeSec = SEVEN_DAYS_MS / 1000) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * API Route 内で管理者かどうかを検証するヘルパ。
 * middleware が主たる防御線だが、多層防御として各 admin route からも呼ぶ。
 */
export async function requireAdmin(request: Request): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE_NAME}=`));
  if (!match) return false;
  const value = decodeURIComponent(match.slice(ADMIN_COOKIE_NAME.length + 1));
  return verifyAdminCookieValue(value);
}

/**
 * cron エンドポイント用の認証チェック。
 * `Authorization: Bearer <CRON_SECRET>` または `?key=<CRON_SECRET>` を許可する。
 * CRON_SECRET が未設定の場合はデモ用途としてスキップ（true を返す）。
 */
export function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader === `Bearer ${secret}`) return true;
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (key === secret) return true;
  } catch {
    // URL パース失敗は無視して未認証扱い
  }
  return false;
}
