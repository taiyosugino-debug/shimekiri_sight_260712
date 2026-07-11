'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Company,
  CompanySize,
  COMPANY_SIZES,
  Entry,
  EntryStatus,
  ENTRY_STATUSES,
  ENTRY_STATUS_LABELS,
  EntryType,
  ENTRY_TYPES,
  GRAD_YEARS,
  Industry,
  INDUSTRIES,
} from '@/lib/types';
import { jstParts, toIsoJst } from '@/lib/date';
import { adminFetch, errorMessage } from './adminApi';
import { ErrorBanner } from './Feedback';

const NEW_COMPANY_VALUE = '__new__';
const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5];

interface CompaniesResponse {
  companies: Company[];
}
interface EntryResponse {
  entry: Entry;
}

interface Props {
  /** 指定時は編集モード。未指定なら新規作成モード。 */
  entryId?: string;
}

interface FormState {
  companyId: string;
  title: string;
  type: EntryType;
  gradYear: number;
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:mm'
  difficulty: number;
  applyUrl: string;
  sourceUrl: string;
  selectionFlow: string;
  webTest: string;
  description: string;
  status: EntryStatus;
  pickup: boolean;
}

function todayYmd(): string {
  const p = jstParts(new Date());
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function initialFormState(): FormState {
  return {
    companyId: '',
    title: '',
    type: ENTRY_TYPES[0],
    gradYear: GRAD_YEARS[GRAD_YEARS.length > 1 ? 1 : 0],
    date: todayYmd(),
    time: '23:59',
    difficulty: 3,
    applyUrl: '',
    sourceUrl: '',
    selectionFlow: '',
    webTest: '',
    description: '',
    status: 'draft',
    pickup: false,
  };
}

/** deadlineAt(ISO) を JST の date/time 入力値へ逆変換する */
function isoToDateTimeInputs(iso: string): { date: string; time: string } {
  const p = jstParts(new Date(iso));
  const date = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  const time = `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
  return { date, time };
}

export default function EntryForm({ entryId }: Props) {
  const router = useRouter();
  const isEdit = Boolean(entryId);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新規企業インライン追加用
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyIndustry, setNewCompanyIndustry] = useState<Industry>(INDUSTRIES[0]);
  const [newCompanySize, setNewCompanySize] = useState<CompanySize>(COMPANY_SIZES[0]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const companiesPromise = adminFetch<CompaniesResponse>('/api/admin/companies');
        const entryPromise = entryId
          ? adminFetch<EntryResponse>(`/api/admin/entries/${entryId}`)
          : Promise.resolve(null);
        const [companiesRes, entryRes] = await Promise.all([companiesPromise, entryPromise]);
        if (cancelled) return;
        setCompanies(companiesRes.companies);
        if (entryRes) {
          const e = entryRes.entry;
          const { date, time } = isoToDateTimeInputs(e.deadlineAt);
          setForm({
            companyId: e.companyId,
            title: e.title,
            type: e.type,
            gradYear: e.gradYear,
            date,
            time,
            difficulty: e.difficulty,
            applyUrl: e.applyUrl ?? '',
            sourceUrl: e.sourceUrl ?? '',
            selectionFlow: e.selectionFlow ?? '',
            webTest: e.webTest ?? '',
            description: e.description ?? '',
            status: e.status,
            pickup: e.pickup,
          });
        } else if (companiesRes.companies.length > 0) {
          setForm((f) => ({ ...f, companyId: companiesRes.companies[0].id }));
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const isCreatingNewCompany = form.companyId === NEW_COMPANY_VALUE;

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [companies],
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isCreatingNewCompany && !newCompanyName.trim()) {
      setError('新しい企業名を入力してください。');
      return;
    }
    if (!isCreatingNewCompany && !form.companyId) {
      setError('企業を選択してください。');
      return;
    }
    if (!form.title.trim()) {
      setError('タイトルを入力してください。');
      return;
    }
    if (!form.date) {
      setError('締切日を入力してください。');
      return;
    }

    setSaving(true);
    try {
      let companyId = form.companyId;
      if (isCreatingNewCompany) {
        const created = await adminFetch<{ company: Company }>('/api/admin/companies', {
          method: 'POST',
          body: {
            name: newCompanyName.trim(),
            industry: newCompanyIndustry,
            size: newCompanySize,
          },
        });
        companyId = created.company.id;
      }

      const [y, m, d] = form.date.split('-').map((v) => Number(v));
      const [hh, mm] = form.time ? form.time.split(':').map((v) => Number(v)) : [23, 59];
      const deadlineAt = toIsoJst(y, m, d, hh, mm);

      const body = {
        companyId,
        title: form.title.trim(),
        type: form.type,
        gradYear: form.gradYear,
        deadlineAt,
        difficulty: form.difficulty,
        applyUrl: form.applyUrl.trim() || undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
        selectionFlow: form.selectionFlow.trim() || undefined,
        webTest: form.webTest.trim() || undefined,
        description: form.description.trim() || undefined,
        status: form.status,
        pickup: form.pickup,
      };

      if (isEdit && entryId) {
        await adminFetch(`/api/admin/entries/${entryId}`, { method: 'PATCH', body });
      } else {
        await adminFetch('/api/admin/entries', { method: 'POST', body });
      }
      router.push('/admin/entries');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card px-4 py-8 text-center text-sm text-slate-500">読み込み中…</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5 p-5">
      <ErrorBanner message={error} />

      <div>
        <label htmlFor="companyId" className="label">
          企業
        </label>
        <select
          id="companyId"
          className="input"
          value={form.companyId}
          onChange={(e) => updateField('companyId', e.target.value)}
        >
          <option value="" disabled>
            選択してください
          </option>
          <option value={NEW_COMPANY_VALUE}>＋ 新しい企業を追加</option>
          {sortedCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isCreatingNewCompany && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label htmlFor="newCompanyName" className="label">
              新しい企業名
            </label>
            <input
              id="newCompanyName"
              type="text"
              className="input"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="例：株式会社サンプル"
            />
          </div>
          <div>
            <label htmlFor="newCompanyIndustry" className="label">
              業界
            </label>
            <select
              id="newCompanyIndustry"
              className="input"
              value={newCompanyIndustry}
              onChange={(e) => setNewCompanyIndustry(e.target.value as Industry)}
            >
              {INDUSTRIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="newCompanySize" className="label">
              企業規模
            </label>
            <select
              id="newCompanySize"
              className="input"
              value={newCompanySize}
              onChange={(e) => setNewCompanySize(e.target.value as CompanySize)}
            >
              {COMPANY_SIZES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="title" className="label">
          タイトル
        </label>
        <input
          id="title"
          type="text"
          className="input"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="例：2028卒 サマーインターン（3days）"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="label">
            種別
          </label>
          <select
            id="type"
            className="input"
            value={form.type}
            onChange={(e) => updateField('type', e.target.value as EntryType)}
          >
            {ENTRY_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gradYear" className="label">
            卒業年度
          </label>
          <select
            id="gradYear"
            className="input"
            value={form.gradYear}
            onChange={(e) => updateField('gradYear', Number(e.target.value))}
          >
            {GRAD_YEARS.map((v) => (
              <option key={v} value={v}>
                {v}卒
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="deadlineDate" className="label">
            締切日
          </label>
          <input
            id="deadlineDate"
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => updateField('date', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="deadlineTime" className="label">
            締切時刻
          </label>
          <input
            id="deadlineTime"
            type="time"
            className="input"
            value={form.time}
            onChange={(e) => updateField('time', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="difficulty" className="label">
            難易度
          </label>
          <select
            id="difficulty"
            className="input"
            value={form.difficulty}
            onChange={(e) => updateField('difficulty', Number(e.target.value))}
          >
            {DIFFICULTY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {'★'.repeat(v) + '☆'.repeat(5 - v)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="label">
            ステータス
          </label>
          <select
            id="status"
            className="input"
            value={form.status}
            onChange={(e) => updateField('status', e.target.value as EntryStatus)}
          >
            {ENTRY_STATUSES.map((v) => (
              <option key={v} value={v}>
                {ENTRY_STATUS_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="applyUrl" className="label">
          エントリーURL
        </label>
        <input
          id="applyUrl"
          type="url"
          className="input"
          value={form.applyUrl}
          onChange={(e) => updateField('applyUrl', e.target.value)}
          placeholder="https://example.com/recruit/"
        />
      </div>

      <div>
        <label htmlFor="sourceUrl" className="label">
          情報源URL（この締切情報の出どころ）
        </label>
        <input
          id="sourceUrl"
          type="url"
          className="input"
          value={form.sourceUrl}
          onChange={(e) => updateField('sourceUrl', e.target.value)}
          placeholder="https://example.com/recruit/news/123（公式採用ページ・就活サイト等）"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="selectionFlow" className="label">
            選考の流れ
          </label>
          <input
            id="selectionFlow"
            type="text"
            className="input"
            value={form.selectionFlow}
            onChange={(e) => updateField('selectionFlow', e.target.value)}
            placeholder="例：ES提出 → Webテスト → GD → 面接（2回）"
          />
        </div>
        <div>
          <label htmlFor="webTest" className="label">
            使うWebテストの種類
          </label>
          <input
            id="webTest"
            type="text"
            className="input"
            value={form.webTest}
            onChange={(e) => updateField('webTest', e.target.value)}
            placeholder="例：SPI / 玉手箱 / TG-WEB / GAB / 独自"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="label">
          説明
        </label>
        <textarea
          id="description"
          className="input h-24"
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="選考内容や補足情報など"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="pickup"
          type="checkbox"
          checked={form.pickup}
          onChange={(e) => updateField('pickup', e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        />
        <label htmlFor="pickup" className="text-sm text-slate-700">
          注目（ピックアップ）に設定する
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? '保存中…' : isEdit ? '更新する' : '登録する'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push('/admin/entries')}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
