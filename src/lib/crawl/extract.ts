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
  '応募受付',
  'まで',
];

/** 「その日付は確定ではない」ことを示す語 */
const VAGUE_KEYWORDS = ['予定', '頃', 'ごろ', '未定', '目安', '随時', '見込み', '予定日', 'を予定'];

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
  /** 曖昧語が文脈内にあるか */
  hasVagueKeyword: boolean;
  /** 年の表記があるか（無い場合は年を推測することになる） */
  hasExplicitYear: boolean;
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

      found.push({
        raw: m[0].trim(),
        context,
        index: start,
        hasDeadlineKeyword: DEADLINE_KEYWORDS.some((k) => context.includes(k)),
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
 * 判定ルール（低いほど人の確認が必要）:
 *   低 … 締切が1つも見つからない
 *   低 … 締切キーワード付きの候補が複数あり、どれか特定できない
 *   低 … 「予定」「頃」「未定」など曖昧語が近くにある
 *   低 … 締切が過去、または2年以上先
 *   中 … 年の記載がなく推測した
 *   中 … 前回の取得値から日付が変わった
 *   中 … 締切キーワードが近くに無い（ただの日付を拾った可能性）
 *   高 … 上記いずれにも当たらない
 */
export function judgeCandidates(input: JudgeInput): Judgement {
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  if (input.candidates.length === 0) {
    return {
      confidence: '低',
      reasons: ['ページ内に締切らしき日付が1つも見つかりませんでした。ページの作りが特殊か、締切が画像・PDF・ログイン後にある可能性があります'],
    };
  }

  // 締切キーワード付きの候補を優先。無ければ全候補から選ぶ
  const keyworded = input.candidates.filter((c) => c.hasDeadlineKeyword);
  const pool = keyworded.length > 0 ? keyworded : input.candidates;
  const chosen = pool[0];

  if (keyworded.length === 0) {
    reasons.push('「締切」「応募期限」などの語が近くに無い日付です。締切ではない日付（更新日・開催日など）を拾っている可能性があります');
  }

  if (keyworded.length > 1) {
    const others = keyworded.slice(1, 4).map((c) => c.raw).join('、');
    reasons.push(`締切らしき日付が${keyworded.length}件見つかり、どれが本命か特定できませんでした（他の候補: ${others}）`);
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

  const confidence = decideConfidence({
    reasons,
    hasKeyword: keyworded.length > 0,
    multipleKeyworded: keyworded.length > 1,
    vague: chosen.hasVagueKeyword,
    expired: remain < 0,
    tooFar: remain > 730,
  });

  return { confidence, reasons, chosen, deadlineAt };
}

interface ConfidenceFactors {
  reasons: string[];
  hasKeyword: boolean;
  multipleKeyworded: boolean;
  vague: boolean;
  expired: boolean;
  tooFar: boolean;
}

function decideConfidence(f: ConfidenceFactors): Confidence {
  // 「低」に落とす条件: 特定できない / 曖昧語 / 日付として明らかにおかしい
  if (f.multipleKeyworded || f.vague || f.expired || f.tooFar || !f.hasKeyword) return '低';
  // 理由が1つでも残っていれば「中」（年の推測・前回からの変化など）
  if (f.reasons.length > 0) return '中';
  return '高';
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

