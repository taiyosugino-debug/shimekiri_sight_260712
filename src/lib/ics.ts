// =============================================================
// ICS (iCalendar) 生成（PROJECT_SPEC.md §9）
// 締切日を終日イベントとして出力する。CRLF 改行・エスケープ必須。
// =============================================================

import { EntryWithCompany } from './types';
import { jstYmdCompact } from './date';

const CRLF = '\r\n';

/** ICS のテキストフィールド用エスケープ（カンマ・セミコロン・改行・バックスラッシュ） */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/** 1行が長すぎる場合に折り返す（RFC5545 推奨: 75octet程度で継続行へ） */
function foldLine(line: string): string {
  const maxLen = 74;
  if (line.length <= maxLen) return line;
  let result = '';
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const chunkLen = first ? maxLen : maxLen - 1;
    const chunk = rest.slice(0, chunkLen);
    rest = rest.slice(chunkLen);
    result += first ? chunk : CRLF + ' ' + chunk;
    first = false;
  }
  return result;
}

function icsTimestampUtc(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${day}T${hh}${mm}${ss}Z`;
}

function buildEventDescription(e: EntryWithCompany): string {
  const parts: string[] = [
    `種別: ${e.type}`,
    `卒年: ${e.gradYear}卒`,
    `難易度: ${e.difficulty}`,
  ];
  if (e.applyUrl) parts.push(`URL: ${e.applyUrl}`);
  if (e.description) parts.push(e.description);
  return parts.join('\n');
}

/** EntryWithCompany[] から VCALENDAR 文字列（CRLF 改行）を組み立てる */
export function buildIcs(entries: EntryWithCompany[], now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Abuild Shimekiri Navi//JA');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push('X-WR-CALNAME:Abuild 締切ナビ');
  lines.push('X-WR-TIMEZONE:Asia/Tokyo');

  const dtstamp = icsTimestampUtc(now.toISOString());

  for (const e of entries) {
    const dateStart = jstYmdCompact(e.deadlineAt, 0);
    const dateEnd = jstYmdCompact(e.deadlineAt, 1); // 終日イベントの DTEND は翌日（排他的）
    const summary = `【締切】${e.company.name} ${e.title}`;
    const description = buildEventDescription(e);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@abuild-shimekiri-navi`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
    lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(description)}`));
    if (e.applyUrl) {
      lines.push(foldLine(`URL:${escapeIcsText(e.applyUrl)}`));
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join(CRLF) + CRLF;
}
