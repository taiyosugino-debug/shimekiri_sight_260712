import { Tier } from '@/lib/types';

/**
 * 採用難易度Tierのバッジ。ユーザーに見せる唯一の難易度指標。
 * 入社難易度の数値（difficultyScore）は内部ソート用なので画面には出さない。
 */
const TIER_CLASS: Record<Tier, string> = {
  'SS+': 'bg-rose-100 text-rose-800 ring-rose-300',
  SS: 'bg-rose-50 text-rose-700 ring-rose-200',
  'S+': 'bg-amber-100 text-amber-800 ring-amber-300',
  S: 'bg-amber-50 text-amber-700 ring-amber-200',
  'S-': 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  'A+': 'bg-sky-100 text-sky-800 ring-sky-300',
  A: 'bg-sky-50 text-sky-700 ring-sky-200',
  'A-': 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  'B+': 'bg-slate-100 text-slate-700 ring-slate-300',
  B: 'bg-slate-50 text-slate-600 ring-slate-200',
};

export function TierBadge({ tier, className = '' }: { tier?: Tier; className?: string }) {
  if (!tier) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TIER_CLASS[tier]} ${className}`}
      title={`採用難易度 ${tier}`}
    >
      {tier}
    </span>
  );
}
