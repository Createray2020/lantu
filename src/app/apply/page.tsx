import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 教練申請的對外短網址（招募頁、LINE 對話、名片都可以直接給這一條）。
 *
 * 到得了這裡就代表已經登入 —— proxy.ts 用 `auth.protect({ unauthenticatedUrl: '/sign-up' })`
 * 守著它：沒帳號的人在 middleware 就被送去教練註冊，註冊完 Clerk 會自動落到 /dashboard/apply。
 *
 * ⚠️ **不要把 /apply 加回公開路由、也不要在這裡自己 `auth()` 判斷**：
 *    公開路由不跑 dev-browser handshake（這站是開發金鑰 pk_test），
 *    auth() 會對「其實已經登入」的人回 null，於是把有帳號的人送去註冊新帳號 ——
 *    2026/08/25 錄影實錄：已登入的客戶帳號按「直接送出教練申請」後被丟去
 *    Clerk 的 Create your account，怎麼按都進不了申請頁。
 */
export default async function ApplyEntry() {
  redirect("/dashboard/apply");
}
