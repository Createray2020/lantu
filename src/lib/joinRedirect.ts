// 伺服器端（頁面）才用的那一半；純函式在 joinFlow.ts（proxy／edge 也要 import，所以不能碰 next/headers）。
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { JOIN_COOKIE, isJoinCode, redeemPath } from "./joinFlow";

/**
 * 登入後的頁面（首頁／護照／setup）用：瀏覽器還留著邀請碼 cookie＝註冊途中兌換沒成功，導去 /portal/redeem 補做。
 * /portal/redeem 成敗都會清 cookie，所以不會繞圈。（cookie 只能在 route handler／proxy 清，頁面裡清不掉，才這樣繞一手。）
 */
export async function redirectIfPendingJoin(): Promise<void> {
  const code = (await cookies()).get(JOIN_COOKIE)?.value;
  if (isJoinCode(code)) redirect(redeemPath(code));
}
