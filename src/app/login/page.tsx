'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SITE_NAME } from '@/lib/types';

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        let message = 'パスワードが正しくありません。';
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // JSON でなければ既定メッセージ
        }
        setError(message);
        setSubmitting(false);
        return;
      }
      const next = searchParams.get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch {
      setError('サーバーに接続できませんでした。ネットワーク状況をご確認ください。');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">{SITE_NAME}</h1>
          <p className="mt-2 text-sm text-slate-500">
            このサイトの閲覧にはサインインが必要です。パスワードを入力してください。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="label">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={submitting || !password}>
            {submitting ? 'サインイン中…' : 'サインイン'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PublicLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
          読み込み中…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
