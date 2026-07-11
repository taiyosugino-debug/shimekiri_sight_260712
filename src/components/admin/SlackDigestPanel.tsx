'use client';

import { useState } from 'react';
import { adminFetch, errorMessage } from './adminApi';

type DaysWithin = 1 | 3 | 7;

interface SlackResponse {
  ok: boolean;
  sent: boolean;
  text: string;
}

/** ダッシュボードの Slack（LINE転用も可）配信パネル。営業・マーケ向け。 */
export default function SlackDigestPanel() {
  const [daysWithin, setDaysWithin] = useState<DaysWithin>(3);
  const [text, setText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [copyLabel, setCopyLabel] = useState('テキストをコピー');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<boolean | null>(null);

  async function handlePreview() {
    setError(null);
    setNotice(null);
    setLastSent(null);
    setPreviewLoading(true);
    try {
      const res = await adminFetch<SlackResponse>('/api/admin/slack', {
        method: 'POST',
        body: { action: 'digest', daysWithin },
      });
      setText(res.text);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSend() {
    setError(null);
    setNotice(null);
    setSendLoading(true);
    try {
      const res = await adminFetch<SlackResponse>('/api/admin/slack', {
        method: 'POST',
        body: { action: 'digest', daysWithin },
      });
      setText(res.text);
      setLastSent(res.sent);
      if (res.sent) {
        setNotice('Slackへ配信しました。');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSendLoading(false);
    }
  }

  async function handleTest() {
    setError(null);
    setNotice(null);
    setLastSent(null);
    setTestLoading(true);
    try {
      const res = await adminFetch<SlackResponse>('/api/admin/slack', {
        method: 'POST',
        body: { action: 'test' },
      });
      setLastSent(res.sent);
      setNotice(res.sent ? 'テスト送信しました。Slackを確認してください。' : null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTestLoading(false);
    }
  }

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel('コピーしました');
      setTimeout(() => setCopyLabel('テキストをコピー'), 2000);
    } catch {
      setError('クリップボードへのコピーに失敗しました。テキストを手動で選択してください。');
    }
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-bold text-slate-900">📣 Slack配信パネル</h2>
      <p className="mt-1 text-xs text-slate-500">
        締切ダイジェストをSlackへ配信、またはテキストをコピーしてLINE配信等に転用できます。
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="daysWithin" className="label">
            対象期間
          </label>
          <select
            id="daysWithin"
            className="input"
            value={daysWithin}
            onChange={(e) => setDaysWithin(Number(e.target.value) as DaysWithin)}
          >
            <option value={1}>本日のみ</option>
            <option value={3}>3日以内</option>
            <option value={7}>7日以内</option>
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={handlePreview} disabled={previewLoading}>
          {previewLoading ? '生成中…' : 'プレビュー生成'}
        </button>
        <button type="button" className="btn-ghost" onClick={handleTest} disabled={testLoading}>
          {testLoading ? '送信中…' : 'テスト送信'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {text && (
        <div className="mt-4 space-y-2">
          <textarea className="input h-40 font-mono text-xs" value={text} readOnly />
          {lastSent === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Webhook未設定のため送信されていません（テキストコピーは可能です）
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={handleSend} disabled={sendLoading}>
              {sendLoading ? '配信中…' : 'Slackへ配信'}
            </button>
            <button type="button" className="btn-ghost" onClick={handleCopy}>
              {copyLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
