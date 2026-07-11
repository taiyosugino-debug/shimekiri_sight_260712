'use client';

import { useState } from 'react';
import { Source, SourceType, SOURCE_TYPES, SyncResult } from '@/lib/types';
import { formatDeadlineFull } from '@/lib/date';
import { adminFetch, errorMessage } from './adminApi';
import { SOURCE_CONFIG_PLACEHOLDERS } from './sourceConfigPlaceholders';

interface Props {
  source: Source;
  onChanged: () => void;
}

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  rss: 'RSS',
  json: 'JSON',
  scrape: 'スクレイピング',
};

interface RunResponse {
  result: SyncResult;
}

/** 自動取込元の一覧行。今すぐ実行・有効/無効トグル・インライン編集・削除を提供する。 */
export default function SourceRow({ source, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(source.name);
  const [type, setType] = useState<SourceType>(source.type);
  const [url, setUrl] = useState(source.url);
  const [configJson, setConfigJson] = useState(source.configJson);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setError(null);
    setRunResult(null);
    setRunning(true);
    try {
      const res = await adminFetch<RunResponse>(`/api/admin/sources/${source.id}/run`, { method: 'POST' });
      setRunResult(res.result);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleToggleEnabled() {
    setError(null);
    setToggling(true);
    try {
      await adminFetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        body: { enabled: !source.enabled },
      });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`取込元「${source.name}」を削除しますか？`)) return;
    setDeleting(true);
    setError(null);
    try {
      await adminFetch(`/api/admin/sources/${source.id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  async function handleSave() {
    if (!name.trim() || !url.trim()) {
      setError('名前とURLは必須です。');
      return;
    }
    try {
      JSON.parse(configJson);
    } catch {
      setError('configJson の形式が正しくありません（JSONとして解釈できません）。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), type, url: url.trim(), configJson },
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4">
      {!editing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-slate-900">{source.name}</span>
              <span className="badge bg-slate-100 text-slate-600">{SOURCE_TYPE_LABELS[source.type]}</span>
              <span className={`badge ${source.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {source.enabled ? '有効' : '無効'}
              </span>
              {source.lastStatus && (
                <span className={`badge ${source.lastStatus === 'ok' ? 'bg-brand-100 text-brand-700' : 'bg-red-100 text-red-700'}`}>
                  最終結果: {source.lastStatus === 'ok' ? '成功' : 'エラー'}
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-slate-500">{source.url}</div>
            <div className="mt-1 text-xs text-slate-400">
              最終実行: {source.lastRunAt ? formatDeadlineFull(source.lastRunAt) : '未実行'}
              {source.lastMessage ? `｜${source.lastMessage}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" className="btn-primary text-xs" disabled={running} onClick={handleRun}>
              {running ? '実行中…' : '▶ 今すぐ実行'}
            </button>
            <button type="button" className="btn-ghost text-xs" disabled={toggling} onClick={handleToggleEnabled}>
              {source.enabled ? '無効にする' : '有効にする'}
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>
              編集
            </button>
            <button type="button" className="btn-danger text-xs" disabled={deleting} onClick={handleDelete}>
              {deleting ? '削除中…' : '削除'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">名前</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">種別</label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as SourceType)}>
                {SOURCE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {SOURCE_TYPE_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">URL</label>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="label">設定（configJson）</label>
            <textarea
              className="input h-32 font-mono text-xs"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder={SOURCE_CONFIG_PLACEHOLDERS[type]}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-xs" disabled={saving} onClick={handleSave}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                setName(source.name);
                setType(source.type);
                setUrl(source.url);
                setConfigJson(source.configJson);
                setEditing(false);
                setError(null);
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {runResult && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="font-medium">実行結果: {runResult.sourceName}</div>
          <div className="mt-1 flex flex-wrap gap-3">
            <span>取得 {runResult.fetched}件</span>
            <span>新規 {runResult.created}件</span>
            <span>更新 {runResult.updated}件</span>
            <span>スキップ {runResult.skipped}件</span>
          </div>
          {runResult.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-red-600">
              {runResult.errors.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
