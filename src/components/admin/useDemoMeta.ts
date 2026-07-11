'use client';

import { useEffect, useState } from 'react';

interface Meta {
  backend: 'memory' | 'gsheets';
  demo: boolean;
}

/** /api/meta を取得してデモ判定を返す共通フック（デモバナー表示用） */
export function useDemoMeta(): { meta: Meta | null } {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/meta', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Meta | null) => {
        if (!cancelled && data) setMeta(data);
      })
      .catch(() => {
        // メタ取得失敗は致命的ではないので無視（バナーを出さないだけ）
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { meta };
}
