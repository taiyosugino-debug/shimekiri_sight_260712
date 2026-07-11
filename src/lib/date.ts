// =============================================================
// 日付ユーティリティ — タイムゾーンは常に JST (Asia/Tokyo) 基準
// サーバーが UTC で動いても正しく動作する（このファイルは変更しないこと）
// =============================================================

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export interface JstParts {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
  hh: number;
  mm: number;
  dow: number; // 0=日
}

/** 任意の時刻を JST の壁時計値に分解する */
export function jstParts(date: Date): JstParts {
  const t = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
    dow: t.getUTCDay(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** JST の年月日時分から ISO8601（+09:00 付き）文字列を作る */
export function toIsoJst(y: number, m: number, d: number, hh = 23, mm = 59): string {
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+09:00`;
}

/** 現在時刻の ISO8601 文字列（createdAt/updatedAt 用） */
export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/** '7/6(月) 23:59' 形式 */
export function formatDeadline(iso: string): string {
  const p = jstParts(new Date(iso));
  return `${p.m}/${p.d}(${DOW_JA[p.dow]}) ${p.hh}:${pad2(p.mm)}`;
}

/** '7/6(月)' 形式 */
export function formatDateShort(iso: string): string {
  const p = jstParts(new Date(iso));
  return `${p.m}/${p.d}(${DOW_JA[p.dow]})`;
}

/** '2026/7/6 23:59' 形式（年付き） */
export function formatDeadlineFull(iso: string): string {
  const p = jstParts(new Date(iso));
  return `${p.y}/${p.m}/${p.d}(${DOW_JA[p.dow]}) ${p.hh}:${pad2(p.mm)}`;
}

/** ICS / Google カレンダー用 'YYYYMMDD'（JST の日付） */
export function jstYmdCompact(iso: string, addDaysN = 0): string {
  const t = new Date(new Date(iso).getTime() + JST_OFFSET_MS + addDaysN * DAY_MS);
  return `${t.getUTCFullYear()}${pad2(t.getUTCMonth() + 1)}${pad2(t.getUTCDate())}`;
}

/** JST のカレンダー日ベースの残り日数（0=今日, 1=明日, 負=過ぎた日） */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const a = jstParts(new Date(iso));
  const b = jstParts(from);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / DAY_MS);
}

/** 締切時刻を厳密に過ぎているか */
export function isExpired(iso: string, at: Date = new Date()): boolean {
  return new Date(iso).getTime() < at.getTime();
}

/** '本日締切' / 'あと3日' / '締切済み' */
export function remainLabel(iso: string, from: Date = new Date()): string {
  if (isExpired(iso, from)) return '締切済み';
  const d = daysUntil(iso, from);
  if (d <= 0) return '本日締切';
  return `あと${d}日`;
}

// ---------------- 締切文字列パーサ（CSV・自動取込用） ----------------

/** 全角数字・記号を半角へ */
function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／]/g, '/')
    .replace(/[：]/g, ':')
    .replace(/[－ー―]/g, '-');
}

export interface ParseDeadlineOptions {
  defaultHour?: number;
  defaultMinute?: number;
  now?: Date;
}

/**
 * 自由書式の締切文字列を ISO8601(+09:00) に変換する。解釈不能なら null。
 * 対応例: '2026-07-06' '2026/7/6 12:00' '2026年7月6日' '7/6' '7月6日23:59' 'ES締切：7/10(金)'
 * 年が無い場合: 今年と解釈し、45日以上過去になる場合は翌年とみなす。
 */
export function parseDeadlineText(text: string, opts: ParseDeadlineOptions = {}): string | null {
  if (!text) return null;
  const now = opts.now ?? new Date();
  const defaultHour = opts.defaultHour ?? 23;
  const defaultMinute = opts.defaultMinute ?? 59;
  const s = toHalfWidth(String(text)).trim();

  // 時刻（あれば）
  let hh = defaultHour;
  let mm = defaultMinute;
  const timeMatch = s.match(/(\d{1,2}):(\d{2})/) ?? s.match(/(\d{1,2})時(?:(\d{1,2})分)?/);
  if (timeMatch) {
    const th = parseInt(timeMatch[1], 10);
    const tm = timeMatch[2] !== undefined ? parseInt(timeMatch[2], 10) : 0;
    if (th >= 0 && th <= 23 && tm >= 0 && tm <= 59) {
      hh = th;
      mm = tm;
    }
  }

  // 年あり: 2026-07-06 / 2026/7/6 / 2026年7月6日
  let m = s.match(/(20\d{2})[-/年]\s?(\d{1,2})[-/月]\s?(\d{1,2})日?/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (isValidYmd(y, mo, d)) return toIsoJst(y, mo, d, hh, mm);
    return null;
  }

  // 年なし: 7/6 / 7月6日
  m = s.match(/(\d{1,2})[/月]\s?(\d{1,2})日?/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const d = parseInt(m[2], 10);
    if (!isValidYmd(2000, mo, d)) return null;
    const nowP = jstParts(now);
    let y = nowP.y;
    // 今年と解釈して 45 日以上過去なら翌年
    const candidate = Date.UTC(y, mo - 1, d);
    const today = Date.UTC(nowP.y, nowP.m - 1, nowP.d);
    if (candidate < today - 45 * DAY_MS) y += 1;
    return toIsoJst(y, mo, d, hh, mm);
  }

  return null;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
