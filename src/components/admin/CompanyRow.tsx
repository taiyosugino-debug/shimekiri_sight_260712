'use client';

import { useState } from 'react';
import { Company, CompanySize, COMPANY_SIZES, Industry, INDUSTRIES } from '@/lib/types';
import { adminFetch, errorMessage } from './adminApi';

interface Props {
  company: Company;
  onChanged: () => void;
}

/** 企業一覧の1行。クリックでインライン編集フォームへ展開する。 */
export default function CompanyRow({ company, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(company.name);
  const [industry, setIndustry] = useState<Industry>(company.industry);
  const [size, setSize] = useState<CompanySize>(company.size);
  const [hpUrl, setHpUrl] = useState(company.hpUrl ?? '');
  const [note, setNote] = useState(company.note ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName(company.name);
    setIndustry(company.industry);
    setSize(company.size);
    setHpUrl(company.hpUrl ?? '');
    setNote(company.note ?? '');
    setError(null);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('企業名を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/api/admin/companies/${company.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          industry,
          size,
          hpUrl: hpUrl.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`「${company.name}」を削除しますか？`)) return;
    setDeleting(true);
    setError(null);
    try {
      await adminFetch(`/api/admin/companies/${company.id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-slate-100 bg-slate-50">
        <td colSpan={5} className="px-3 py-3">
          <div className="space-y-3">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">企業名</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">業界</label>
                <select className="input" value={industry} onChange={(e) => setIndustry(e.target.value as Industry)}>
                  {INDUSTRIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">企業規模</label>
                <select className="input" value={size} onChange={(e) => setSize(e.target.value as CompanySize)}>
                  {COMPANY_SIZES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">HP URL</label>
                <input className="input" value={hpUrl} onChange={(e) => setHpUrl(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">メモ</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary text-xs" disabled={saving} onClick={handleSave}>
                {saving ? '保存中…' : '保存'}
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  resetForm();
                  setEditing(false);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-900">{company.name}</td>
      <td className="px-3 py-2 text-slate-700">{company.industry}</td>
      <td className="px-3 py-2 text-slate-700">{company.size}</td>
      <td className="px-3 py-2 text-slate-500">
        {company.hpUrl ? (
          <a href={company.hpUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
            サイト
          </a>
        ) : (
          '-'
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1.5">
          <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>
            編集
          </button>
          <button type="button" className="btn-danger text-xs" disabled={deleting} onClick={handleDelete}>
            {deleting ? '削除中…' : '削除'}
          </button>
        </div>
        {error && !editing && <div className="mt-1 text-right text-xs text-red-600">{error}</div>}
      </td>
    </tr>
  );
}
