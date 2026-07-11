'use client';

export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: 'brand' | 'amber' | 'red' | 'slate';
}) {
  const accentClass =
    accent === 'brand'
      ? 'text-brand-700'
      : accent === 'amber'
        ? 'text-amber-600'
        : accent === 'red'
          ? 'text-red-600'
          : 'text-slate-900';
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accentClass}`}>{value}</div>
    </div>
  );
}
