// 教練推薦連結：/r/FC2609002 → 記 30 天 cookie → 轉到公開護照頁。
// 碼無效（不是 active 教練）就不記 cookie，照樣轉到護照頁——連結永遠能用，只是沒有來源。
// ⚠️ 只記來源，不送連結申請、不碰派案閘（見 lib/referral.ts）。
import { NextResponse, type NextRequest } from "next/server";
import { findCoachByCode } from "@/lib/coachLink";
import { REF_COOKIE, REF_COOKIE_DAYS } from "@/lib/referral";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const res = NextResponse.redirect(new URL("/passport", req.url));
  const coach = await findCoachByCode(decodeURIComponent(code || "")).catch(() => null);
  if (coach) {
    res.cookies.set(REF_COOKIE, coach.code, {
      maxAge: REF_COOKIE_DAYS * 86400,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
