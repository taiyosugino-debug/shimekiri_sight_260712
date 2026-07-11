// =============================================================
// デモモード時に表示する注意バナー（memoryバックエンド時のみ）
// =============================================================

export default function DemoBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
      デモモード：サンプルデータを表示しています（実際の締切情報ではありません）
    </div>
  );
}
