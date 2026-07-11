// =============================================================
// 残り日数バッジ — 締切までの日数に応じて色分け表示する
// 締切済み=slate / 本日・あと1日=red / 2-3日=orange / 4-7日=amber / 8日以上=控えめblue
// =============================================================

import { daysUntil, isExpired, remainLabel } from '@/lib/date';

interface DaysBadgeProps {
  deadlineAt: string;
  now?: Date;
  className?: string;
}

/** 残り日数に応じたTailwindクラスを決定する */
function badgeColorClass(deadlineAt: string, now: Date): string {
  if (isExpired(deadlineAt, now)) {
    return 'bg-slate-100 text-slate-500';
  }
  const d = daysUntil(deadlineAt, now);
  if (d <= 1) return 'bg-red-100 text-red-700';
  if (d <= 3) return 'bg-orange-100 text-orange-700';
  if (d <= 7) return 'bg-amber-100 text-amber-700';
  return 'bg-blue-50 text-slate-600';
}

export default function DaysBadge({ deadlineAt, now, className }: DaysBadgeProps) {
  const at = now ?? new Date();
  const label = remainLabel(deadlineAt, at);
  const colorClass = badgeColorClass(deadlineAt, at);
  return (
    <span className={`badge ${colorClass} ${className ?? ''}`}>
      {label}
    </span>
  );
}
