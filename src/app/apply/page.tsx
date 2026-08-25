import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

/**
 * 教練申請的對外短網址（招募頁、LINE 對話、名片都可以直接給這一條）。
 *
 * 它只做一件事：把人送到「他現在該去的那一步」。
 *   · 還沒有帳號 → /sign-up（Clerk 註冊完自動落到 /dashboard/apply）
 *   · 已經登入（含只有客戶帳號的人）→ /dashboard/apply
 *
 * 為什麼要多這一層而不是讓招募頁自己判斷：`/join` 是 force-static 的行銷頁，
 * 加上 auth() 會讓整頁變成每次都要跑伺服器。分岔集中在這裡，招募頁維持靜態。
 *
 * ⚠️ 這條路徑必須列在 proxy.ts 的公開路由裡 —— 否則未登入的人會先被導去 /login，
 *    而 /login 的註冊連結是**客戶**註冊，新教練會辦成客戶帳號。
 */
export default async function ApplyEntry() {
  const { userId } = await auth();
  redirect(userId ? "/dashboard/apply" : "/sign-up");
}
