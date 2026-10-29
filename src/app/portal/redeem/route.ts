import { NextResponse, type NextRequest } from "next/server";
import { JOIN_COOKIE, claimPath, isJoinCode } from "@/lib/joinFlow";

export const dynamic = "force-dynamic";

// 舊入口（2026/10/29 上午那一版）：當時註冊回來直接兌換，現在改成先到認領頁確認。
// 已經在半路上的人（forceRedirectUrl 還指著這裡）照樣接得上——轉去 /portal/claim。
// 非公開路由（proxy 先完成登入確認）。
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? req.cookies.get(JOIN_COOKIE)?.value ?? "";
  return NextResponse.redirect(new URL(isJoinCode(code) ? claimPath(code) : "/portal", url));
}
