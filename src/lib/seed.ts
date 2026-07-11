// =============================================================
// シードデータ生成（PROJECT_SPEC.md §13）
// 締切は now からの相対オフセットで動的生成するため、デモが陳腐化しない。
// =============================================================

import { Company, CompanyInput, Entry, EntryInput, Source } from './types';
import { addDays, jstParts, toIsoJst } from './date';

/** now を基準に、指定日数後の JST 締切 ISO を作る（時刻は hh:mm） */
function deadlineIn(now: Date, days: number, hh = 23, mm = 59): string {
  const target = addDays(now, days);
  const p = jstParts(target);
  return toIsoJst(p.y, p.m, p.d, hh, mm);
}

interface SeedCompanyDef {
  key: string;
  name: CompanyInput['name'];
  industry: CompanyInput['industry'];
  size: CompanyInput['size'];
  hpUrl: string;
}

const COMPANY_DEFS: SeedCompanyDef[] = [
  { key: 'mitsui', name: '三井物産', industry: '総合商社', size: '大手', hpUrl: 'https://www.mitsui.com/jp/ja/recruit/' },
  { key: 'mitsubishi-corp', name: '三菱商事', industry: '総合商社', size: '大手', hpUrl: 'https://www.mitsubishicorp.com/jp/ja/recruit/' },
  { key: 'itochu', name: '伊藤忠商事', industry: '総合商社', size: '大手', hpUrl: 'https://www.itochu.co.jp/ja/recruit/' },
  { key: 'bcg', name: 'BCG', industry: 'コンサル', size: '大手', hpUrl: 'https://www.bcg.com/ja-jp/careers' },
  { key: 'mckinsey', name: 'マッキンゼー・アンド・カンパニー', industry: 'コンサル', size: '大手', hpUrl: 'https://www.mckinsey.com/jp/careers' },
  { key: 'accenture', name: 'アクセンチュア', industry: 'コンサル', size: 'メガベンチャー', hpUrl: 'https://www.accenture.com/jp-ja/careers' },
  { key: 'pwc', name: 'PwCコンサルティング', industry: 'コンサル', size: '大手', hpUrl: 'https://www.pwc.com/jp/ja/careers.html' },
  { key: 'goldman', name: 'ゴールドマン・サックス', industry: '金融', size: '大手', hpUrl: 'https://www.goldmansachs.com/careers/' },
  { key: 'nomura', name: '野村證券', industry: '金融', size: '大手', hpUrl: 'https://www.nomura.co.jp/recruit/' },
  { key: 'mufg', name: '三菱UFJ銀行', industry: '金融', size: '大手', hpUrl: 'https://www.bk.mufg.jp/recruit/' },
  { key: 'toyota', name: 'トヨタ自動車', industry: 'メーカー', size: '大手', hpUrl: 'https://toyota.jp/recruit/' },
  { key: 'sony', name: 'ソニーグループ', industry: 'メーカー', size: '大手', hpUrl: 'https://www.sony.com/ja/SonyInfo/recruit/' },
  { key: 'panasonic', name: 'パナソニック', industry: 'メーカー', size: '大手', hpUrl: 'https://recruit.panasonic.com/' },
  { key: 'keyence', name: 'キーエンス', industry: 'メーカー', size: '大手', hpUrl: 'https://www.keyence.co.jp/recruit/' },
  { key: 'nintendo', name: '任天堂', industry: 'メーカー', size: '大手', hpUrl: 'https://www.nintendo.co.jp/jobs/' },
  { key: 'dentsu', name: '電通', industry: '広告', size: '大手', hpUrl: 'https://www.dentsu.co.jp/recruit/' },
  { key: 'hakuhodo', name: '博報堂', industry: '広告', size: '大手', hpUrl: 'https://www.hakuhodo.co.jp/recruit/' },
  { key: 'nttdata', name: 'NTTデータ', industry: 'IT', size: '大手', hpUrl: 'https://nttdata-recruit.com/' },
  { key: 'recruit', name: 'リクルート', industry: '人材', size: 'メガベンチャー', hpUrl: 'https://recruit-saiyo.jp/' },
  { key: 'rakuten', name: '楽天グループ', industry: 'IT', size: 'メガベンチャー', hpUrl: 'https://corp.rakuten.co.jp/careers/' },
  { key: 'cyberagent', name: 'サイバーエージェント', industry: 'IT', size: 'メガベンチャー', hpUrl: 'https://www.cyberagent.co.jp/careers/' },
  { key: 'lineyahoo', name: 'LINEヤフー', industry: 'IT', size: 'メガベンチャー', hpUrl: 'https://www.lycorp.co.jp/ja/recruit/' },
  { key: 'cybozu', name: 'サイボウズ', industry: 'IT', size: '中堅・中小', hpUrl: 'https://cybozu.co.jp/recruit/' },
  { key: 'smarthr', name: 'SmartHR', industry: 'IT', size: 'スタートアップ', hpUrl: 'https://smarthr.co.jp/recruit/' },
];

/** 企業に応じたベース難易度（1..5） */
function baseDifficulty(size: CompanyInput['size']): number {
  switch (size) {
    case '大手':
      return 4;
    case 'メガベンチャー':
      return 3;
    case '中堅・中小':
      return 2;
    case 'スタートアップ':
      return 2;
    default:
      return 3;
  }
}

function clampDifficulty(n: number): number {
  return Math.min(5, Math.max(1, n));
}

interface EntryDraft {
  companyKey: string;
  title: string;
  type: EntryInput['type'];
  gradYear: number;
  days: number; // now からの相対日数
  hh?: number;
  mm?: number;
  difficultyAdj?: number; // ベースからの調整
  pickup?: boolean;
  status?: EntryInput['status'];
  description: string;
  applySuffix?: string; // hpUrl に追記するパス
  selectionFlow?: string; // 選考の流れ
  webTest?: string; // 使うWebテストの種類
}

// 約30件。pickup 5件・draft 2件・archived 1件・期限切れ published 1-2件を含む。
const ENTRY_DRAFTS: EntryDraft[] = [
  { companyKey: 'mitsui', title: 'サマーインターン（3days）', type: 'インターン', gradYear: 2028, days: 12, pickup: true, description: '総合商社のビジネスモデルを体感する3日間の実践型プログラムです。', selectionFlow: 'ES提出 → Webテスト → グループディスカッション → 面接（2回）', webTest: '玉手箱' },
  { companyKey: 'mitsubishi-corp', title: 'サマーインターンシップ', type: 'インターン', gradYear: 2028, days: 9, pickup: true, description: '商社パーソンの仕事を疑似体験するグループワーク中心のプログラム。', selectionFlow: 'ES提出 → Webテスト → 面接（複数回）', webTest: 'SPI（テストセンター）' },
  { companyKey: 'itochu', title: '業界研究セミナー', type: '説明会・イベント', gradYear: 2028, days: 3, hh: 19, mm: 0, difficultyAdj: -2, description: 'オンライン開催の業界研究セミナーです。質疑応答の時間もあります。' },
  { companyKey: 'itochu', title: '秋冬インターン エントリー', type: 'インターン', gradYear: 2028, days: 40, description: '各事業本部の業務を深く知る秋冬インターンのエントリー受付です。' },
  { companyKey: 'bcg', title: 'ケース面接対策インターン', type: 'インターン', gradYear: 2028, days: 6, pickup: true, description: 'ケース面接の考え方を学ぶ1dayワークショップ形式のインターンです。', selectionFlow: 'ES提出 → Webテスト → ケース面接（2回）', webTest: 'BCG独自のオンラインテスト' },
  { companyKey: 'mckinsey', title: 'サマープログラム', type: 'インターン', gradYear: 2028, days: 15, difficultyAdj: 1, description: '選考倍率が非常に高い難関プログラム。エントリーシートに加え適性検査があります。', selectionFlow: 'ES提出 → 適性検査 → ケース面接（複数回）', webTest: 'Solve（マッキンゼー独自）' },
  { companyKey: 'accenture', title: 'テクノロジーコンサルタント職 説明会', type: '説明会・イベント', gradYear: 2028, days: 5, hh: 18, mm: 30, difficultyAdj: -2, description: 'テクノロジー領域のコンサルティング職種紹介イベントです。' },
  { companyKey: 'accenture', title: '冬季インターン エントリー', type: 'インターン', gradYear: 2028, days: 55, description: '戦略・テクノロジー・オペレーションズの3コースから選択できる冬季インターン。' },
  { companyKey: 'pwc', title: '秋季インターンシップ', type: 'インターン', gradYear: 2028, days: 33, description: '監査・税務・コンサルティングの各部門を紹介するインターンです。' },
  { companyKey: 'goldman', title: 'サマーアナリストプログラム', type: 'インターン', gradYear: 2028, days: 20, difficultyAdj: 1, pickup: true, description: '投資銀行部門の業務を体験する10週間のサマーアナリストプログラム。', selectionFlow: 'ES提出（英文レジュメ含む） → Webテスト → 面接（複数回）', webTest: 'SHL形式（玉手箱型）' },
  { companyKey: 'nomura', title: 'サマーインターンシップ', type: 'インターン', gradYear: 2028, days: 11, description: '証券ビジネスの基礎を学ぶグループワーク中心のプログラムです。', selectionFlow: 'ES提出 → Webテスト → 面接（1回）', webTest: '玉手箱' },
  { companyKey: 'mufg', title: 'ウィンターインターンシップ', type: 'インターン', gradYear: 2028, days: 48, description: '銀行業務の全体像を学べる冬季インターンシップです。' },
  { companyKey: 'mufg', title: '本選考エントリー（第一クール）', type: '本選考', gradYear: 2027, days: 25, difficultyAdj: 0, description: '本選考第一クールのエントリーシート受付です。' },
  { companyKey: 'toyota', title: '技術系サマーインターン', type: 'インターン', gradYear: 2028, days: 18, description: 'モノづくりの現場を体感できる技術系学生向けインターンです。', selectionFlow: 'ES提出 → 適性検査 → 面接（1回）', webTest: 'SPI（WEBテスティング）' },
  { companyKey: 'sony', title: 'クリエイティブ職インターン', type: 'インターン', gradYear: 2028, days: 22, pickup: true, description: 'エンタテインメント事業のクリエイティブ職を体験できるプログラム。' },
  { companyKey: 'panasonic', title: '技術系インターンシップ', type: 'インターン', gradYear: 2028, days: 27, description: 'くらしに関わる技術開発の現場を知るインターンシップです。' },
  { companyKey: 'keyence', title: '会社説明会', type: '説明会・イベント', gradYear: 2028, days: 2, hh: 14, mm: 0, difficultyAdj: -2, description: '高収益経営の秘密に迫るオンライン会社説明会です。' },
  { companyKey: 'nintendo', title: 'サマーインターンシップ', type: 'インターン', gradYear: 2028, days: 30, difficultyAdj: 1, description: 'ゲーム開発の企画・プログラム・デザイン各コースのインターンです。' },
  { companyKey: 'dentsu', title: 'クリエイティブ職インターン', type: 'インターン', gradYear: 2028, days: 14, description: '広告クリエイティブの企画立案を体験するプログラムです。' },
  { companyKey: 'hakuhodo', title: 'マーケティング職インターン', type: 'インターン', gradYear: 2028, days: 16, description: '生活者発想を学ぶマーケティング職向けインターンシップ。' },
  { companyKey: 'nttdata', title: 'エンジニア職インターン', type: 'インターン', gradYear: 2028, days: 8, description: 'システム開発の上流工程を体験できるエンジニア職向けインターンです。', selectionFlow: 'ES提出 → Webテスト → グループディスカッション → 面接', webTest: '玉手箱' },
  { companyKey: 'recruit', title: 'ビジネスコースインターン', type: 'インターン', gradYear: 2028, days: 4, difficultyAdj: -1, description: '新規事業提案にチャレンジするビジネスコースのインターンです。', selectionFlow: 'ES提出 → Webテスト → 面接（2回）', webTest: 'SPI' },
  { companyKey: 'rakuten', title: 'エンジニア職サマーインターン', type: 'インターン', gradYear: 2028, days: 24, pickup: true, description: 'グローバルなEC・フィンテック事業を支える技術を学ぶインターン。' },
  { companyKey: 'cyberagent', title: 'サマーインターンシップ', type: 'インターン', gradYear: 2028, days: 7, description: '広告・ゲーム・メディア事業から選べる複数コース制インターンです。', selectionFlow: 'ES提出 → 面接（2回）', webTest: 'なし（面接のみ）' },
  { companyKey: 'lineyahoo', title: 'プロダクト開発インターン', type: 'インターン', gradYear: 2028, days: 35, description: '生活インフラを支えるプロダクト開発を体験するインターンです。' },
  { companyKey: 'cybozu', title: '開発職1dayインターン', type: 'インターン', gradYear: 2028, days: 1, difficultyAdj: -1, description: 'チームワークあふれる会社を作るための開発現場を知る1dayインターン。' },
  { companyKey: 'smarthr', title: 'プロダクト職説明会', type: '説明会・イベント', gradYear: 2028, days: 0, hh: 20, mm: 0, difficultyAdj: -1, description: '急成長スタートアップのプロダクト組織を紹介するオンライン説明会。' },
  { companyKey: 'smarthr', title: 'エンジニア職インターン', type: 'インターン', gradYear: 2028, days: 45, description: 'SaaSプロダクト開発の現場に入り込むエンジニア向けインターン。' },
  // draft（承認待ちフローのデモ用）
  { companyKey: 'itochu', title: '冬季インターン（食料カンパニー）', type: 'インターン', gradYear: 2028, days: 60, status: 'draft', description: '食料分野のビジネスを学ぶ冬季インターンです（自動取込・承認待ち）。' },
  { companyKey: 'recruit', title: 'プロダクトマネージャー職インターン', type: 'インターン', gradYear: 2028, days: 50, status: 'draft', description: 'プロダクトマネジメントを体験するインターンです（CSV取込・承認待ち）。' },
  // archived（保管データのデモ用）
  { companyKey: 'bcg', title: '冬季ケースインターン（募集終了）', type: 'インターン', gradYear: 2027, days: -30, status: 'archived', description: '募集終了済みの過去プログラムです。' },
  // 期限切れ published（過去分がそのまま見える例）
  { companyKey: 'mitsubishi-corp', title: '本選考エントリー（一次締切）', type: '本選考', gradYear: 2027, days: -2, description: '本選考エントリーシートの一次締切です（締切済み）。' },
  { companyKey: 'goldman', title: '本選考エントリー（早期選考）', type: '本選考', gradYear: 2027, days: -5, description: '早期選考ルートのエントリーは締め切られました。' },
];

function toEntryInput(now: Date, def: EntryDraft, companyId: string): EntryInput & { id?: string } {
  const company = COMPANY_DEFS.find((c) => c.key === def.companyKey)!;
  const diff = clampDifficulty(baseDifficulty(company.size) + (def.difficultyAdj ?? 0));
  return {
    companyId,
    title: def.title,
    type: def.type,
    gradYear: def.gradYear,
    deadlineAt: deadlineIn(now, def.days, def.hh ?? 23, def.mm ?? 59),
    difficulty: diff,
    applyUrl: company.hpUrl,
    description: def.description,
    // デモ用: 情報源URLは企業の採用ページを既定にする
    sourceUrl: company.hpUrl,
    selectionFlow: def.selectionFlow,
    webTest: def.webTest,
    status: def.status ?? 'published',
    pickup: def.pickup ?? false,
    source: 'manual',
  };
}

/** now を基準にシードデータ一式を組み立てる */
export function buildSeedData(now: Date): { companies: Company[]; entries: Entry[]; sources: Source[] } {
  const updatedAt = new Date(now).toISOString();
  const createdAt = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(); // 30日前に作成された体

  const companyIdMap = new Map<string, string>();
  const companies: Company[] = COMPANY_DEFS.map((def) => {
    const id = `co_${def.key}`;
    companyIdMap.set(def.key, id);
    const company: Company = {
      id,
      name: def.name,
      industry: def.industry,
      size: def.size,
      hpUrl: def.hpUrl,
      note: undefined,
      createdAt,
      updatedAt,
    };
    return company;
  });

  const entries: Entry[] = ENTRY_DRAFTS.map((def, idx) => {
    const companyId = companyIdMap.get(def.companyKey)!;
    const input = toEntryInput(now, def, companyId);
    const entry: Entry = {
      id: `en_${String(idx + 1).padStart(3, '0')}`,
      companyId: input.companyId,
      title: input.title,
      type: input.type,
      gradYear: input.gradYear,
      deadlineAt: input.deadlineAt,
      difficulty: input.difficulty,
      applyUrl: input.applyUrl,
      description: input.description,
      sourceUrl: input.sourceUrl,
      selectionFlow: input.selectionFlow,
      webTest: input.webTest,
      status: input.status ?? 'published',
      pickup: input.pickup ?? false,
      source: input.source ?? 'manual',
      createdAt,
      updatedAt,
    };
    return entry;
  });

  const sources: Source[] = [
    {
      id: 'src_sample_json',
      name: '（サンプル）採用イベントJSON取込',
      type: 'json',
      url: 'https://example.com/careers/events.json',
      configJson: JSON.stringify(
        {
          itemsPath: 'items',
          fields: {
            companyName: 'company.name',
            title: 'title',
            deadline: 'deadline',
            url: 'url',
          },
          defaults: { type: 'インターン', gradYear: 2028, difficulty: 3 },
          limit: 50,
        },
        null,
        2,
      ),
      enabled: false,
      lastRunAt: undefined,
      lastStatus: undefined,
      lastMessage: '未実行（サンプル設定のため無効化されています。実際のURLに差し替えてから有効化してください）',
      createdAt,
      updatedAt,
    },
  ];

  return { companies, entries, sources };
}
