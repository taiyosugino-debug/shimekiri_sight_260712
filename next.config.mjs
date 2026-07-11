/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel 以外（AWS / Xserver VPS の Docker 等）へそのまま持ち出せる自己完結ビルド
  output: 'standalone',
  // 画像最適化サーバーに依存しない（ポータビリティ優先）
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
