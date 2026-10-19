// 推薦來源標記（2026/10/20 Ray 定案）。
//
// 教練把帶自己 FC 碼的人生護照連結（/r/<FC碼>）或 QR 給出去；客戶從那裡進來，
// 我們只做一件事：記下「這位是誰帶進來的」。
// ⚠️ 這不是客戶歸屬。歸屬仍走派案閘／客戶自己輸入教練編號／教練接受連結那條路；
//    C 階教練的推薦照樣轉派。推薦人拿到的是紀錄，不是客戶。
// ⚠️ first-touch：client_users.referrer_coach_id 一有值就不再覆蓋。
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientUsers, clients, plans } from "@/Shared/db/schema";
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

/** 教練「我的推薦」小統計：帶進幾位、幾位存了護照、幾位後來掛上教練（不一定是他）、幾位掛在他名下。 */
export type ReferralStats = {
  total: number;
  passport: number;
  linked: number;
  mine: number;
  recent: { name: string; at: Date | null; state: "註冊" | "存了護照" | "已掛教練" | "掛在我名下" }[];
};
export async function referralStats(coachId: string): Promise<ReferralStats> {
  const users = await db
    .select({ id: clientUsers.id, name: clientUsers.name, at: clientUsers.referredAt })
    .from(clientUsers)
    .where(eq(clientUsers.referrerCoachId, coachId))
    .orderBy(desc(clientUsers.referredAt));
  if (!users.length) return { total: 0, passport: 0, linked: 0, mine: 0, recent: [] };
  const ids = users.map((u) => u.id);
  const clientRows = await db
    .select({ id: clients.id, clientUserId: clients.clientUserId, coachId: clients.coachId })
    .from(clients)
    .where(inArray(clients.clientUserId, ids));
  const clientIds = clientRows.map((c) => c.id);
  const planRows = clientIds.length
    ? await db.select({ clientId: plans.clientId }).from(plans)
        .where(and(inArray(plans.clientId, clientIds), eq(plans.track, "client")))
    : [];
  const hasPassport = new Set(planRows.map((p) => p.clientId));
  const byUser = new Map(clientRows.filter((c) => c.clientUserId).map((c) => [c.clientUserId as string, c]));
  let passport = 0, linked = 0, mine = 0;
  const recent = users.slice(0, 8).map((u) => {
    const c = byUser.get(u.id);
    const pp = !!(c && hasPassport.has(c.id));
    const lk = !!(c && c.coachId);
    const me = !!(c && c.coachId === coachId);
    return { name: u.name || "（未填姓名）", at: u.at, state: (me ? "掛在我名下" : lk ? "已掛教練" : pp ? "存了護照" : "註冊") as ReferralStats["recent"][number]["state"] };
  });
  for (const u of users) {
    const c = byUser.get(u.id);
    if (c && hasPassport.has(c.id)) passport++;
    if (c && c.coachId) linked++;
    if (c && c.coachId === coachId) mine++;
  }
  return { total: users.length, passport, linked, mine, recent };
}
