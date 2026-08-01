// =============================================================
// review タブで人が「承認」した行を entries へ反映する。
//
// 運用の流れ:
//   1. 週次巡回が review タブに候補を全件書き出す（decision = 未確認）
//   2. 人がスプレッドシートの「承認」列に OK / NG を書き込む
//   3. 本モジュールが OK 行を entries へ draft として作成し、decision を「取込済」に更新する
//
// 安全側の設計:
//   - 承認されていても締切が解釈できていない行は取り込まない（日付なしの Entry を作らない）
//   - 取り込んだ Entry は必ず draft。公開は管理画面で人が行う
//   - 取込済の行は entryId を持ち、二重取り込みされない
// =============================================================

import { Entry, EntryType, ReviewItem, Store } from '../types';

export interface PromoteResult {
  approved: number;
  imported: number;
  skipped: { id: string; companyName: string; reason: string }[];
  errors: string[];
  /** 作成された Entry の id */
  entryIds: string[];
}

/** review 行から Entry のタイトルを組み立てる */
export function buildEntryTitle(item: ReviewItem): string {
  const t = item.title.trim();
  if (t && t !== item.companyName) return t.slice(0, 120);
  const type = item.type ?? 'エントリー';
  return `${item.companyName} ${type}`.slice(0, 120);
}

/**
 * 締切の年から卒業年度を推定する。
 * 日本の新卒採用は4月始まりなので、4〜12月締切は翌々年卒、1〜3月締切は翌年卒を主対象とみなす。
 * あくまで推定であり、管理画面で人が直せる。
 */
export function guessGradYear(deadlineIso: string): number {
  const y = Number(deadlineIso.slice(0, 4));
  const m = Number(deadlineIso.slice(5, 7));
  if (!y || !m) return new Date().getFullYear() + 2;
  // 例: 2026年6月締切のインターン → 2028年卒が主対象
  return m >= 4 ? y + 2 : y + 1;
}

export interface PromoteOptions {
  /** 取り込む Entry の初期難易度 */
  defaultDifficulty?: number;
}

/**
 * decision が「承認」の review 行を entries へ取り込む。
 * すでに entryId を持つ行（取込済）はスキップする。
 */
export async function promoteApprovedReviewItems(
  store: Store,
  opts: PromoteOptions = {},
): Promise<PromoteResult> {
  const result: PromoteResult = { approved: 0, imported: 0, skipped: [], errors: [], entryIds: [] };
  const difficulty = opts.defaultDifficulty ?? 3;

  let items: ReviewItem[];
  try {
    items = await store.listReviewItems();
  } catch (err) {
    result.errors.push(`review の読み込みに失敗しました: ${errText(err)}`);
    return result;
  }

  for (const item of items) {
    if (item.decision !== '承認') continue;
    result.approved += 1;

    if (item.entryId) {
      result.skipped.push({ id: item.id, companyName: item.companyName, reason: 'すでに取込済です' });
      continue;
    }
    if (!item.deadlineAt) {
      result.skipped.push({
        id: item.id,
        companyName: item.companyName,
        reason: '締切日が空のため取り込めません。deadline_at 列に日付を入れてから再度承認してください',
      });
      continue;
    }
    if (!item.companyId) {
      result.skipped.push({ id: item.id, companyName: item.companyName, reason: 'company_id が空です' });
      continue;
    }

    try {
      const entry: Entry = await store.createEntry({
        companyId: item.companyId,
        title: buildEntryTitle(item),
        type: (item.type ?? '本選考') as EntryType,
        gradYear: guessGradYear(item.deadlineAt),
        deadlineAt: item.deadlineAt,
        difficulty,
        sourceUrl: item.pageUrl,
        applyUrl: item.pageUrl,
        // 承認済みでも必ず draft。公開は管理画面で人が最終判断する
        status: 'draft',
        source: `crawl:${item.id}`,
      });
      await store.updateReviewItem(item.id, { decision: '取込済', entryId: entry.id });
      result.imported += 1;
      result.entryIds.push(entry.id);
    } catch (err) {
      result.errors.push(`${item.companyName}: 取り込みに失敗しました (${errText(err)})`);
    }
  }

  return result;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
