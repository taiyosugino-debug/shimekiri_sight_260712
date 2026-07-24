'use client';

import { useState } from 'react';
import { SourceType, SOURCE_TYPES } from '@/lib/types';
import { adminFetch, errorMessage } from './adminApi';
import { ErrorBanner } from './Feedback';
import { SOURCE_CONFIG_PLACEHOLDERS } from './sourceConfigPlaceholders';

interface Props {
  onCreated: () => void;
}

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  rss: 'RSS',
  json: 'JSON',
  scrape: 'スクレイピング',
};

/** 自動取込元の新規登録フォーム。type選択でconfigJsonのプレースホルダが切り替わる。 */
export default function SourceForm({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<SourceType>('rss');
  const [url, setUrl] = useState('');
  const [configJson, setConfigJson] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [autoPublish, setAutoPublish] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('名前を入力してください。');
      return;
    }
    if (!url.trim()) {
      setError('URLを入力してください。');
      return;
    }
    const configToUse = configJson.trim() || SOURCE_CONFIG_PLACEHOLDERS[type];
    try {
      JSON.parse(configToUse);
    } catch {
      setError('configJson の形式が正しくありません（JSONとして解釈できません）。');
      return;
    }

    setSaving(true);
    try {
      await adminFetch('/api/admin/sources', {
        method: 'POST',
        body: { name: name.trim(), type, url: url.trim(), configJson: configToUse, enabled, autoPublish },
      });
      setName('');
      setUrl('');
      setConfigJson('');
      setEnabled(false);
      setAutoPublish(true);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-4">
      <h2 className="text-sm font-bold text-slate-900">新規取込元を追加</h2>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sourceName" className="label">
            名前
          </label>
          <input
            id="sourceName"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：〇〇就活メディア RSS"
          />
        </div>
        <div>
          <label htmlFor="sourceType" className="label">
            種別
          </label>
          <select
            id="sourceType"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as SourceType)}
          >
            {SOURCE_TYPES.map((v) => (
              <option key={v} value={v}>
                {SOURCE_TYPE_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="sourceUrl" className="label">
          URL
        </label>
        <input
          id="sourceUrl"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed"
        />
      </div>

      <div>
        <label htmlFor="sourceConfig" className="label">
          設定（configJson）
        </label>
        <textarea
          id="sourceConfig"
          className="input h-32 font-mono text-xs"
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          placeholder={SOURCE_CONFIG_PLACEHOLDERS[type]}
        />
        <p className="mt-1 text-xs text-slate-400">空欄の場合は上記プレースホルダの内容がそのまま使用されます。</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="sourceEnabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        />
        <label htmlFor="sourceEnabled" className="text-sm text-slate-700">
          有効にする
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="sourceAutoPublish"
          type="checkbox"
          checked={autoPublish}
          onChange={(e) => setAutoPublish(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        />
        <label htmlFor="sourceAutoPublish" className="text-sm text-slate-700">
          取込項目を自動公開する（オフ＝承認待ちに入れる）
        </label>
      </div>

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? '追加中…' : '＋ 取込元を追加'}
      </button>
    </form>
  );
}
