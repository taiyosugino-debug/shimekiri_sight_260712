// =============================================================
// 巡回で取得したページから「締切らしき情報」を抽出し、確信度を判定する。
//
// 設計方針（重要）:
//   500社の公式採用ページは HTML 構造がすべて違うため、汎用セレクタで
//   締切を正確に取ることは原理的にできない。そこで本モジュールは
//   「正確に取る」ことを諦め、代わりに
//     - 見つけたものは全件出す
//     - どれくらい信用できるかを confidence で表明する
//     - なぜ怪しいのかを人が読める reasons で添える
//   ことに徹する。判断は人が行う（review タブ）。
//
//   「怪しいものだけ出す」設計にしないのは、印が付かないことを
//   「正しい」と誤解させないため。取れずに静かに漏れた社が最も危ない。
// =============================================================

import { Confidence, EntryType } from '../types';
import { daysUntil, parseDeadlineText } from '../date';

/** 締切を示唆するキーワード。この近くにある日付ほど締切である可能性が高い */
const DEADLINE_KEYWORDS = [
  '締切',
  '締め切り',
  '〆切',
  '〆切り',
  '応募期限',
  '応募締切',
  'エントリー期限',
  'エントリー締切',
  'ES締切',
  'ES提出',
  '提出期限',
  '受付終了',
  '受付期限',
  '申込期限',
  '申込締切',
  // 「応募受付」は「応募受付を開始しました」にも一致してしまい、
  // 募集開始日を締切と誤認する原因になるため入れない（実測で確認）
];

/**
 * 日付の「後ろ」にあるときだけ締切を意味する語。
 * 「6/24まで」は締切だが、「（6/24まで） 2026年6月1日」の 6月1日 にとっての
 * 直前の「まで」は自分のものではない。方向を見ないと隣の日付を巻き込む（実測で確認）。
 */
const DEADLINE_SUFFIX_KEYWORDS = ['まで', '必着', '厳守'];

/** 「その日付は確定ではない」ことを示す語 */
const VAGUE_KEYWORDS = ['予定', '頃', 'ごろ', '未定', '目安', '随時', '見込み', '予定日', 'を予定'];

/**
 * 「この日付は締切ではない」ことを示す語。
 * これらの近くにある日付は、開催日・更新日など締切以外の日付である可能性が高い。
 * 実測で NEC の「開催期間 8/24(月) - 9/4(金)」を締切として拾ってしまった対策。
 */
const NOT_DEADLINE_KEYWORDS = [
  '開催期間',
  '実施期間',
  '開催日程',
  '開催日',
  '実施日',
  '開催',
  '実施',
  '更新日',
  '掲載日',
  '公開日',
  '投稿日',
  '発行日',
  '最終更新',
];

/**
 * 「募集はもう終わっている」ことを示す表現。
 * 見つかった場合、そのページの日付を締切として採用しない。
 * 実測で NEC の「※応募受付は終了しました」を拾えなかった対策。
 */
const CLOSED_PATTERNS: RegExp[] = [
  /応募\s*(受付)?\s*(は)?\s*終了/,
  /募集\s*(は)?\s*(終了|締切ました|締め切りました)/,
  /受付\s*(は)?\s*終了/,
  /エントリー\s*(受付)?\s*(は)?\s*終了/,
  /締(め)?切りました/,
];

/** 締切キーワードが「近い」とみなす文字数 */
const NEAR_RADIUS = 40;
/** 除外語がこの距離以内にあり、かつ締切語より近ければ、その日付は締切ではないとみなす */
const EXCLUDE_RADIUS = 25;
/** 1位と2位の距離差がこれ以内なら「どちらが本命か特定できない」と判断する */
const AMBIGUITY_MARGIN = 8;

/** 種別の推測に使う語 */
const TYPE_HINTS: { type: EntryType; words: string[] }[] = [
  { type: 'インターン', words: ['インターン', 'インターンシップ', 'internship', '就業体験'] },
  { type: '説明会・イベント', words: ['説明会', 'セミナー', 'イベント', 'ミートアップ', '座談会', 'オープンカンパニー'] },
  { type: '本選考', words: ['本選考', '新卒採用', '採用選考', 'エントリーシート', '募集要項'] },
];

/** 日付らしき文字列を拾う正規表現（年あり・年なしの両方） */
const DATE_PATTERNS: RegExp[] = [
  /20\d{2}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}\s*日?/g,
  /(?<!\d)\d{1,2}\s*[/月]\s*\d{1,2}\s*日?/g,
];

/** 前後何文字を文脈として見るか */
const CONTEXT_RADIUS = 40;

export interface DateCandidate {
  /** ページ上で見つけた生の日付文字列 */
  raw: string;
  /** その前後の文脈（人が読んで判断するための材料） */
  context: string;
  /** 文字列中の位置 */
  index: number;
  /** 締切キーワードが文脈内にあるか */
  hasDeadlineKeyword: boolean;
  /**
   * 最も近い締切キーワードまでの文字数。
   * 「まもなく締切です！（6/24まで）」の 6/24 は数文字、
   * 見出しの前にあるニュース掲載日は数十文字離れる。
   * この差で本命を選ぶのが精度の要。
   */
  keywordDistance: number;
  /** 最も近い締切キーワードの語 */
  keywordWord?: string;
  /** 「開催期間」など、締切ではないことを示す語が近くにある場合その語 */
  excludedBy?: string;
  /** 曖昧語が文脈内にあるか */
  hasVagueKeyword: boolean;
  /** 年の表記があるか（無い場合は年を推測することになる） */
  hasExplicitYear: boolean;
}

/**
 * 指定範囲 [start, end) から最も近いキーワードまでの文字数を求める。
 * 範囲に重なっている場合は 0。見つからなければ Infinity。
 */
function nearestKeyword(
  text: string,
  start: number,
  end: number,
  keywords: string[],
  /** 'after' なら日付より後ろにあるキーワードだけを対象にする */
  direction: 'any' | 'after' = 'any',
): { distance: number; word?: string } {
  let best = Number.POSITIVE_INFINITY;
  let bestWord: string | undefined;
  for (const kw of keywords) {
    let idx = text.indexOf(kw);
    while (idx !== -1) {
      const kEnd = idx + kw.length;
      if (direction === 'after' && idx < end) {
        idx = text.indexOf(kw, idx + 1);
        continue;
      }
      const d = idx >= end ? idx - end : kEnd <= start ? start - kEnd : 0;
      if (d < best) {
        best = d;
        bestWord = kw;
      }
      idx = text.indexOf(kw, idx + 1);
    }
  }
  return { distance: best, word: bestWord };
}

/** ページに「募集は終了した」旨の記載があるか */
export function findClosedMarker(text: string): string | undefined {
  const t = toHalfWidth(normalizeWhitespace(text));
  for (const re of CLOSED_PATTERNS) {
    const m = t.match(re);
    if (m) return m[0];
  }
  return undefined;
}

/** 連続する空白・改行を1つのスペースにまとめる */
export function normalizeWhitespace(text: string): string {
  return text.replace(/[\s　]+/g, ' ').trim();
}

/**
 * 全角の数字・記号を半角に変換する。
 * 日本語の採用ページは「２０２６年９月３０日」のように全角で日付を書くことが
 * 珍しくないため、日付を探す前に必ず通す。
 */
export function toHalfWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/／/g, '/')
    .replace(/：/g, ':')
    .replace(/[－ー―‐]/g, '-');
}

/**
 * テキストから日付候補をすべて拾い出す。
 * 同じ位置を複数パターンが拾わないよう、年ありパターンを優先して重複を除く。
 */
export function findDateCandidates(text: string): DateCandidate[] {
  const normalized = toHalfWidth(normalizeWhitespace(text));
  const found: DateCandidate[] = [];
  const takenRanges: { start: number; end: number }[] = [];

  DATE_PATTERNS.forEach((pattern, patternIndex) => {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // すでに年ありパターンで拾った範囲と重なるならスキップ
      if (takenRanges.some((r) => start < r.end && end > r.start)) continue;
      takenRanges.push({ start, end });

      const ctxStart = Math.max(0, start - CONTEXT_RADIUS);
      const ctxEnd = Math.min(normalized.length, end + CONTEXT_RADIUS);
      const context = normalized.slice(ctxStart, ctxEnd);

      const kwAny = nearestKeyword(normalized, start, end, DEADLINE_KEYWORDS);
      const kwSuffix = nearestKeyword(normalized, start, end, DEADLINE_SUFFIX_KEYWORDS, 'after');
      const kw = kwSuffix.distance < kwAny.distance ? kwSuffix : kwAny;
      const ng = nearestKeyword(normalized, start, end, NOT_DEADLINE_KEYWORDS);
      // 「開催期間」等が締切語より近くにあるなら、その日付は締切ではないとみなす
      const excludedBy =
        ng.distance <= EXCLUDE_RADIUS && ng.distance < kw.distance ? ng.word : undefined;

      found.push({
        raw: m[0].trim(),
        context,
        index: start,
        hasDeadlineKeyword: kw.distance <= NEAR_RADIUS,
        keywordDistance: kw.distance,
        keywordWord: kw.word,
        excludedBy,
        hasVagueKeyword: VAGUE_KEYWORDS.some((k) => context.includes(k)),
        hasExplicitYear: patternIndex === 0,
      });
    }
  });

  return found.sort((a, b) => a.index - b.index);
}

/** テキスト全体から種別を推測する。判断できなければ undefined */
export function guessEntryType(text: string): EntryType | undefined {
  const lower = text.toLowerCase();
  for (const { type, words } of TYPE_HINTS) {
    if (words.some((w) => lower.includes(w.toLowerCase()))) return type;
  }
  return undefined;
}

export interface JudgeInput {
  candidates: DateCandidate[];
  /** 前回巡回時に記録していた締切（変化検知用） */
  previousDeadlineAt?: string;
  /** ページ全体のテキスト（「募集終了」の検知に使う） */
  pageText?: string;
  now?: Date;
}

export interface Judgement {
  confidence: Confidence;
  /** 人が読む用の要確認理由。空配列なら確信度「高」 */
  reasons: string[];
  /** 採用した候補（無ければ undefined） */
  chosen?: DateCandidate;
  /** 採用した候補を解釈した ISO8601。解釈できなければ undefined */
  deadlineAt?: string;
}

/**
 * 日付候補群から1つを選び、確信度と要確認理由を決める。
 *
 * 選び方（実測結果を受けて改訂）:
 *   1. 「開催期間」「更新日」など締切以外を示す語が近い候補は除外する
 *   2. 残りのうち、締切キーワードに最も近い候補を選ぶ
 *      （「まもなく締切です！（6/24まで）」の 6/24 は数文字、
 *        見出し前のニュース掲載日は数十文字離れる。この差で本命が決まる）
 *   3. 1位と2位が僅差なら「特定できない」として日付を採用しない
 *   4. 締切キーワードの近くに日付が1つも無ければ、日付を採用しない
 *      （関係ない日付を締切欄に入れるより、空のほうが安全）
 *
 * 確信度:
 *   低 … 日付が無い / 締切語の近くに無い / 特定できない / 曖昧語 / 過去 / 2年以上先 / 募集終了
 *   中 … 年を推測した / 前回から変化した
 *   高 … 上記いずれにも当たらない
 */
export function judgeCandidates(input: JudgeInput): Judgement {
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  const closed = input.pageText ? findClosedMarker(input.pageText) : undefined;
  if (closed) {
    // 募集が終わっているページから拾った日付は締切ではない（残った開催日等を拾いやすい）。
    // 日付を採用せず、終了している旨だけを人に伝える。
    reasons.push(
      `ページに「${closed}」という記載があります。募集が終わっているため、日付は採用しませんでした`,
    );
    return { confidence: '低', reasons };
  }

  if (input.candidates.length === 0) {
    reasons.push(
      'ページ内に日付が1つも見つかりませんでした。ページの作りが特殊か、締切が画像・PDF・ログイン後にある可能性があります',
    );
    return { confidence: '低', reasons };
  }

  // 1. 締切以外を示す語が近い候補を除外
  const excluded = input.candidates.filter((c) => c.excludedBy);
  const usable = input.candidates.filter((c) => !c.excludedBy);

  // 2. 締切キーワードが近い候補だけを、距離が近い順に並べる
  const keyworded = usable
    .filter((c) => c.hasDeadlineKeyword)
    .sort((a, b) => a.keywordDistance - b.keywordDistance);

  if (keyworded.length === 0) {
    const excludedNote =
      excluded.length > 0
        ? `（「${excluded[0].excludedBy}」の近くにある日付が${excluded.length}件ありましたが、締切ではないため除外しました）`
        : '';
    reasons.push(
      `日付は${input.candidates.length}件見つかりましたが、いずれも「締切」「応募期限」などの語の近くにありません${excludedNote}。` +
        '締切がページに書かれていない可能性が高いです',
    );
    return { confidence: '低', reasons };
  }

  const chosen = keyworded[0];
  const runnerUp = keyworded[1];

  // 3. 1位と2位が僅差なら特定できない
  if (runnerUp && runnerUp.keywordDistance - chosen.keywordDistance <= AMBIGUITY_MARGIN) {
    const others = keyworded
      .slice(1, 4)
      .map((c) => c.raw)
      .join('、');
    reasons.push(
      `締切らしき日付が${keyworded.length}件あり、どれが本命か特定できませんでした（候補: ${chosen.raw}、${others}）`,
    );
    return { confidence: '低', reasons, chosen };
  }

  if (chosen.hasVagueKeyword) {
    const hit = VAGUE_KEYWORDS.filter((k) => chosen.context.includes(k)).join('、');
    reasons.push(`「${hit}」という語が近くにあり、確定した日付ではない可能性があります`);
  }

  if (!chosen.hasExplicitYear) {
    reasons.push('年の記載が無いため、年を推測しました（例:「7/31まで」）。年度をまたぐ場合は誤る可能性があります');
  }

  const deadlineAt = parseDeadlineText(chosen.raw, { now }) ?? undefined;
  if (!deadlineAt) {
    reasons.push(`「${chosen.raw}」を日付として解釈できませんでした`);
    return { confidence: '低', reasons, chosen };
  }

  const remain = daysUntil(deadlineAt, now);
  if (remain < 0) {
    reasons.push(`解釈した締切（${deadlineAt.slice(0, 10)}）がすでに過去です`);
  } else if (remain > 730) {
    reasons.push(`解釈した締切（${deadlineAt.slice(0, 10)}）が2年以上先です。年の推測を誤っている可能性があります`);
  }

  if (input.previousDeadlineAt && input.previousDeadlineAt !== deadlineAt) {
    reasons.push(`前回の巡回時（${input.previousDeadlineAt.slice(0, 10)}）から締切が変わりました`);
  }

  let confidence: Confidence = '高';
  if (closed || chosen.hasVagueKeyword || remain < 0 || remain > 730) confidence = '低';
  else if (reasons.length > 0) confidence = '中';

  return { confidence, reasons, chosen, deadlineAt };
}

/** ページ本文から人が読める短い見出しを作る（review タブの title 列用） */
export function buildTitle(pageTitle: string, chosen: DateCandidate | undefined, fallback: string): string {
  const t = normalizeWhitespace(pageTitle);
  if (t) return t.slice(0, 120);
  if (chosen) return chosen.context.slice(0, 120);
  return fallback;
}

/**
 * 本文の変化検知用ハッシュ。暗号用途ではないので軽量な FNV-1a で十分。
 * Edge / Node どちらでも追加依存なしで動く。
 */
export function contentHash(text: string): string {
  const s = normalizeWhitespace(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

