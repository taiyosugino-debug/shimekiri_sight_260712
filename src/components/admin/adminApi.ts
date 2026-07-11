// =============================================================
// 管理画面共通 fetch ヘルパー
// - すべて Cookie 認証（middleware 側で担保）。credentials は同一オリジンなので既定で送られる。
// - 失敗時は日本語メッセージを持つ Error を throw する（呼び出し側で catch して表示）。
// =============================================================

/** サーバーからの {error} 形式を取り出しつつ、日本語の汎用メッセージにフォールバックする */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error) return data.error;
  } catch {
    // JSON でない場合は無視して下のフォールバックへ
  }
  if (res.status === 401) return 'ログインが必要です。再度ログインしてください。';
  if (res.status === 404) return 'データが見つかりませんでした。';
  if (res.status >= 500) return 'サーバーエラーが発生しました。時間をおいて再度お試しください。';
  return `通信エラーが発生しました（status ${res.status}）。`;
}

/**
 * 管理API向け fetch ラッパー。
 * - JSON body を自動で stringify
 * - 非 2xx は Error を throw（message は日本語）
 * - ネットワーク自体の失敗（オフライン等）も日本語メッセージに変換
 */
export async function adminFetch<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error('サーバーに接続できませんでした。ネットワーク状況をご確認ください。');
  }

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res));
  }

  try {
    return (await res.json()) as T;
  } catch {
    // 204 等 body なしのケース
    return undefined as T;
  }
}

export function isErrorWithMessage(e: unknown): e is Error {
  return e instanceof Error;
}

export function errorMessage(e: unknown): string {
  if (isErrorWithMessage(e)) return e.message;
  return '不明なエラーが発生しました。';
}
