// =============================================================
// Slack 通知（PROJECT_SPEC.md §9）
// Incoming Webhook への簡易 POST。未設定の場合はエラーにせず sent:false を返す。
// =============================================================

import { EntryWithCompany } from './types';
import { daysUntil, isExpired, jstParts } from './date';

export interface SendSlackResult {
  sent: boolean;
  error?: string;
}

/** 送信先チャンネル種別に応じた Webhook URL を取得する */
function resolveWebhookUrl(channel: 'main' | 'admin'): string | undefined {
  if (channel === 'admin') {
    return process.env.SLACK_ADMIN_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  }
  return process.env.SLACK_WEBHOOK_URL;
}

/** Slack Incoming Webhook にテキストを送信する。未設定時は sent:false（エラーにしない）。 */
export async function sendSlack(text: string, channel: 'main' | 'admin' = 'main'): Promise<SendSlackResult> {
  const url = resolveWebhookUrl(channel);
  if (!url) {
    return { sent: false };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, error: `Slack への送信に失敗しました (${res.status}): ${body.slice(0, 300)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: `Slack への送信中にエラーが発生しました: ${String(err)}` };
  }
}

// ---------------- ダイジェスト本文生成 ----------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** エントリー1件の表示行（例: ・三井物産｜2028卒 サマーインターン（3days）｜23:59〆） */
function formatDigestLine(e: EntryWithCompany): string {
  const p = jstParts(new Date(e.deadlineAt));
  return `・${e.company.name}｜${e.gradYear}卒 ${e.title}｜${pad2(p.hh)}:${pad2(p.mm)}〆`;
}

/**
 * 締切ダイジェスト本文を組み立てる。
 * entries は published かつ未経過（daysWithin 以内）のものを想定するが、
 * 本関数内でも安全のためフィルタと区分けを行う。
 */
export function buildDigestText(entries: EntryWithCompany[], daysWithin: number, now: Date = new Date()): string {
  const active = entries.filter((e) => !isExpired(e.deadlineAt, now));

  const today: EntryWithCompany[] = [];
  const tomorrow: EntryWithCompany[] = [];
  const within3: EntryWithCompany[] = [];
  const others: EntryWithCompany[] = [];

  for (const e of active) {
    const d = daysUntil(e.deadlineAt, now);
    if (d > daysWithin) continue;
    if (d <= 0) today.push(e);
    else if (d === 1) tomorrow.push(e);
    else if (d <= 3) within3.push(e);
    else others.push(e);
  }

  const sortByDeadline = (list: EntryWithCompany[]) =>
    [...list].sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());

  const sortedToday = sortByDeadline(today);
  const sortedTomorrow = sortByDeadline(tomorrow);
  const sortedWithin3 = sortByDeadline(within3);
  const sortedOthers = sortByDeadline(others);

  const p = jstParts(now);
  const header = `📢 Abuild 締切ナビ｜締切アラート（${p.m}/${p.d} ${pad2(p.hh)}:${pad2(p.mm)}時点）`;

  const sections: string[] = [];
  if (sortedToday.length > 0) {
    sections.push(`🔴 本日締切（${sortedToday.length}件）`);
    sections.push(...sortedToday.map(formatDigestLine));
  }
  if (sortedTomorrow.length > 0) {
    sections.push(`🟠 明日締切（${sortedTomorrow.length}件）`);
    sections.push(...sortedTomorrow.map(formatDigestLine));
  }
  if (sortedWithin3.length > 0) {
    sections.push(`🟡 3日以内（${sortedWithin3.length}件）`);
    sections.push(...sortedWithin3.map(formatDigestLine));
  }
  if (sortedOthers.length > 0) {
    sections.push(`🔵 ${daysWithin}日以内（${sortedOthers.length}件）`);
    sections.push(...sortedOthers.map(formatDigestLine));
  }

  const totalCount = sortedToday.length + sortedTomorrow.length + sortedWithin3.length + sortedOthers.length;

  const lines: string[] = [header];
  if (totalCount === 0) {
    lines.push(`本日〜${daysWithin}日以内の締切はありません`);
  } else {
    lines.push(...sections);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  lines.push(`👉 一覧: ${siteUrl || '/'}`);

  return lines.join('\n');
}
