// 回傳「目前線上部署」的版本識別（runtime 讀取，永不快取）。
// 前端會拿它跟自己 build 時烤進的 NEXT_PUBLIC_APP_VERSION 比對，判斷是否有新版。
export const dynamic = "force-dynamic";

export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";
  return Response.json(
    { version },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
