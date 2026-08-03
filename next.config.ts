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
};

export default nextConfig;
