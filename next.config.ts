import type { NextConfig } from "next";

// 把「這次 build 的版本識別」（Vercel 的 commit SHA）烤進前端，
// 供 VersionWatcher 與伺服器端 /api/version 比對，偵測是否有新版部署。
const buildVersion =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  "dev";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: buildVersion,
  },
  // 瀏覽器分頁的小圖示一律是嵐途 logo（2026/09/25 Ray）。
  // ⚠️ 不要再放 src/app/favicon.ico：那是 create-next-app 附的 Vercel 三角形，
  //    Next 會自動插一條 <link rel="icon" href="/favicon.ico">，Chrome 會優先拿它，蓋掉 layout 裡的品牌 icon。
  //    瀏覽器（還有書籤、LINE 預覽）也會直接要 /favicon.ico，所以把這個網址轉給動態品牌 icon——
  //    後台換 logo 時分頁圖示跟著換。
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/api/brand/icon" }];
  },
};

export default nextConfig;
