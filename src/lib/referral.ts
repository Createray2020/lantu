// 推薦來源標記（2026/10/20 Ray 定案）。
//
// 教練把帶自己 FC 碼的人生護照連結（/r/<FC碼>）或 QR 給出去；客戶從那裡進來，
// 我們只做一件事：記下「這位是誰帶進來的」。
// ⚠️ 這不是客戶歸屬。歸屬仍走派案閘／客戶自己輸入教練編號／教練接受連結那條路；
//    C 階教練的推薦照樣轉派。推薦人拿到的是紀錄，不是客戶。
// ⚠️ first-touch：client_users.referrer_coach_id 一有值就不再覆蓋。
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientUsers } from "@/Shared/db/schema";
import { findCoachByCode } from "./coachLink";
import { normalizeCode } from "./codes";

export const REF_COOKIE = "lantu_ref";
export const REF_COOKIE_DAYS = 30;

/** 推薦連結本體：帶教練編號，落地在公開護照頁。 */
export function referralPath(code: string): string {
  return `/r/${encodeURIComponent(normalizeCode(code) || code)}`;
}

/** 把 cookie 裡的 FC 碼補到 client_users（只在來源欄還是空的那一列上寫；碼無效或教練非 active 不寫）。 */
export async function attachReferral(
  clientUserId: string,
  rawCode: string,
): Promise<{ coachId: string; code: string; at: Date } | null> {
  const coach = await findCoachByCode(rawCode);
  if (!coach) return null;
  const at = new Date();
  const updated = await db
    .update(clientUsers)
    .set({ referrerCoachId: coach.id, referrerCode: coach.code, referredAt: at })
    .where(and(eq(clientUsers.id, clientUserId), isNull(clientUsers.referrerCoachId)))
    .returning({ id: clientUsers.id });
  return updated.length ? { coachId: coach.id, code: coach.code, at } : null;
}

/** 這位教練帶進來多少位（教練檔案頁的小數字）。 */
export async function countReferred(coachId: string): Promise<number> {
  const r = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clientUsers)
    .where(eq(clientUsers.referrerCoachId, coachId));
  return r[0]?.n ?? 0;
}
