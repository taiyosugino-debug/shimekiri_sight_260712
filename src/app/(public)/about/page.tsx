// =============================================================
// 使い方・カレンダー連携ページ（server component）
// =============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '使い方・カレンダー連携｜Abuild 締切ナビ',
};

/** ICS配信URLの基点。NEXT_PUBLIC_SITE_URL が無ければ相対パスにする */
function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
}

export default function AboutPage() {
  const origin = siteOrigin();
  const icalUrl = `${origin}/api/ical`;
  const icalFilteredUrl = `${origin}/api/ical?gradYear=2028&type=インターン`;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-bold text-slate-900">使い方・カレンダー連携</h1>
      <p className="mb-6 text-sm text-slate-500">
        Abuild 締切ナビの使い方と、締切をカレンダーに自動反映する方法を説明します。
      </p>

      {/* 使い方 */}
      <section className="card mb-4 p-5">
        <h2 className="mb-2 text-base font-bold text-slate-900">使い方</h2>
        <ol className="list-inside list-decimal space-y-1.5 text-sm leading-relaxed text-slate-700">
          <li>トップページの一覧で、種別・卒年・企業規模・業界・残り日数・難易度で絞り込めます。</li>
          <li>フリーワード検索で企業名やタイトルからも探せます。</li>
          <li>「注目のエントリー」には特に見逃したくない締切をピックアップしています。</li>
          <li>各行・カードをタップすると詳細ページでエントリーページへのリンクを確認できます。</li>
          <li>締切は必ず各企業の公式サイトでも最終確認してください。</li>
        </ol>
      </section>

      {/* カレンダー連携手順 */}
      <section className="card mb-4 p-5">
        <h2 className="mb-2 text-base font-bold text-slate-900">
          <span aria-hidden="true">📅</span> カレンダー連携（Google / iPhone）
        </h2>
        <p className="mb-3 text-sm leading-relaxed text-slate-700">
          Abuild 締切ナビは締切一覧をカレンダー購読用のICS形式（<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/api/ical</code>）で配信しています。
          一度登録すれば、新しい締切が追加されたときも自動でカレンダーに反映されます。
        </p>

        <div className="mb-4">
          <h3 className="mb-1.5 text-sm font-bold text-slate-900">Googleカレンダーの場合</h3>
          <ol className="list-inside list-decimal space-y-1 text-sm leading-relaxed text-slate-700">
            <li>PCでGoogleカレンダーを開く</li>
            <li>左側メニューの「他のカレンダー」の「＋」→「URLで追加」を選択</li>
            <li>下記のURLを貼り付けて「カレンダーを追加」</li>
          </ol>
        </div>

        <div className="mb-4">
          <h3 className="mb-1.5 text-sm font-bold text-slate-900">iPhoneカレンダーの場合</h3>
          <ol className="list-inside list-decimal space-y-1 text-sm leading-relaxed text-slate-700">
            <li>「設定」アプリ →「カレンダー」→「アカウント」を開く</li>
            <li>「アカウントを追加」→「照会カレンダー」を選択</li>
            <li>下記のURLを「サーバー」欄に貼り付けて「次へ」</li>
          </ol>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="label">配信URL（全件）</p>
          <p className="break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            {icalUrl}
          </p>
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="label">フィルタ付きの例（2028卒・インターンのみ）</p>
          <p className="break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            {icalFilteredUrl}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            <code className="rounded bg-white px-1 py-0.5">gradYear</code>（卒年）・
            <code className="rounded bg-white px-1 py-0.5">type</code>（種別）・
            <code className="rounded bg-white px-1 py-0.5">size</code>（企業規模）・
            <code className="rounded bg-white px-1 py-0.5">industry</code>（業界）・
            <code className="rounded bg-white px-1 py-0.5">daysWithin</code>（残り日数）・
            <code className="rounded bg-white px-1 py-0.5">difficultyMin</code>（難易度）・
            <code className="rounded bg-white px-1 py-0.5">q</code>（フリーワード）を
            組み合わせて自分専用のカレンダーURLを作れます。
          </p>
        </div>
      </section>

      {/* 情報更新の仕組み */}
      <section className="card mb-4 p-5">
        <h2 className="mb-2 text-base font-bold text-slate-900">情報更新の仕組み</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          毎朝、企業の採用ページやフィードから自動で締切情報を取り込んでいます。取り込まれた情報はいったん
          「承認待ち」として保存され、Abuild社内での内容確認・承認を経てから一覧に公開されます。
          手動での登録・修正も随時行っています。
        </p>
      </section>

      {/* 免責 */}
      <section className="card p-5">
        <h2 className="mb-2 text-base font-bold text-slate-900">免責事項</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          掲載している締切情報は自動取込・手動登録により随時更新していますが、内容の正確性・最新性を保証するものではありません。
          締切日時は変更される場合がありますので、エントリーの際は必ず各企業の公式サイト・採用ページで最新の情報をご確認ください。
          本サイトの情報を利用したことにより生じたいかなる損害についても、当方は責任を負いかねます。
        </p>
      </section>
    </div>
  );
}
