import { NextResponse, type NextRequest } from "next/server";
import { ensureClientUser } from "@/lib/clientUser";
import { redeemInvite } from "@/lib/coachLink";
import { JOIN_COOKIE, isJoinCode, joinPath } from "@/lib/joinFlow";

export const dynamic = "force-dynamic";

// 兌換邀請碼的唯一入口（2026/10/29，見 lib/joinFlow.ts）。
// ⚠️ 這條路由刻意**不是**公開路由：proxy 先 auth.protect（完成 Clerk handshake）才進得來，
//    沒登入的人被送回 /portal/join 那張說明頁。所以這裡拿到的使用者一定是真的登入者。
// 兌換完不論成敗都清 cookie，再導去 /portal/join?…&done=1 顯示結果（redeemInvite 冪等，結果頁再算一次是同一個答案）。
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? req.cookies.get(JOIN_COOKIE)?.value ?? "";
  const clear = (res: NextResponse) => {
    res.cookies.set(JOIN_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };
  if (!isJoinCode(code)) return clear(NextResponse.redirect(new URL("/portal", url)));
  const user = await ensureClientUser();
  // 理論上 proxy 已擋。保險起見回結果頁（done=1 → join 頁不會再導回這裡）；cookie 也清——留著的話首頁每次都會被拉來這裡空轉。
  if (!user) return clear(NextResponse.redirect(new URL(joinPath(code, true), url)));
  try {
    await redeemInvite(code, user);
  } catch (e) {
    console.error("[join] redeem failed", e);
  }
  return clear(NextResponse.redirect(new URL(joinPath(code, true), url)));
}
