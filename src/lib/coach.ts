// 教練帳號與權限（伺服器端）。
// Clerk 負責「你是誰」；這裡負責「你能不能用」（coaches 表的 role/status）。
import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";

export type Coach = typeof coaches.$inferSelect;

function adminEmails(): string[] {
  return (process.env.LANTU_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// 確保目前登入的 Clerk 使用者在 coaches 表有一筆資料，並回傳該筆。
// - 管理員 email（LANTU_ADMIN_EMAILS）：自動 role=admin、status=active。
// - 其他人：首次登入建立為 status=pending（待審核）。
// 既有一般教練的 status 不會因為再次登入被覆寫（尊重後台核准結果），
// 但 role 會依白名單雙向同步 —— 從白名單移除後必須真的降回 coach，否則 admin 權限永遠撤不掉。
//
// 用 React cache() 包住：同一個 request 內不論被幾個 page/action/API 呼叫都只打一次 DB。
export const ensureCoach = cache(async function ensureCoach(): Promise<Coach | null> {
  const user = await currentUser();
  if (!user) return null;

  // 只認「主要且已驗證」的 email。用 emailAddresses[0] 會把未驗證的次要信箱也算進白名單比對。
  const primary = user.primaryEmailAddress;
  const verified = primary?.verification?.status === "verified";
  const email = primary?.emailAddress?.toLowerCase() ?? null;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;
  const isAdmin = !!email && verified && adminEmails().includes(email);

  // upsert + returning：一趟 round trip 拿到結果，不必再 select 一次。
  const inserted = await db
    .insert(coaches)
    .values({
      id: user.id,
      email,
      name,
      role: isAdmin ? "admin" : "coach",
      status: isAdmin ? "active" : "pending",
      approvedAt: isAdmin ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: coaches.id,
      set: { email, name },
    })
    .returning();

  const row = inserted[0] ?? null;
  if (!row) return null;

  // 白名單同步：在名單內 → 保證 admin+active；不在名單內但目前是 admin → 降回 coach。
  if (isAdmin && (row.role !== "admin" || row.status !== "active")) {
    const r = await db
      .update(coaches)
      .set({ role: "admin", status: "active", approvedAt: row.approvedAt ?? new Date() })
      .where(eq(coaches.id, user.id))
      .returning();
    return r[0] ?? row;
  }
  if (!isAdmin && row.role === "admin") {
    const r = await db
      .update(coaches)
      .set({ role: "coach" })
      .where(eq(coaches.id, user.id))
      .returning();
    return r[0] ?? row;
  }
  return row;
});

// admin 必須同時是 admin 且 active。舊版只看 role，導致被停權的管理員
// /dashboard 進不去、/admin 照樣進得去（還能核准帳號、把自己升成 owner、竄改品牌）。
export async function isAdmin(coach: Coach | null): Promise<boolean> {
  return !!coach && coach.role === "admin" && coach.status === "active";
}

export async function listCoaches(): Promise<Coach[]> {
  return db.select().from(coaches).orderBy(coaches.createdAt);
}

export async function setCoachStatus(id: string, status: "pending" | "active" | "suspended") {
  await db
    .update(coaches)
    .set({ status, approvedAt: status === "active" ? new Date() : null })
    .where(eq(coaches.id, id));
}

// 設定組織職級與上線（後台維護組織樹）。
// uplineId 會先做「整條上線鏈」的環狀檢查：A→B→A 這種多層環雖然不會讓 downlineIds 無限迴圈
// （有 seen Set），但會讓兩位主管互看對方團隊，且該子樹在老闆視角整段消失。
export async function setCoachOrg(id: string, orgRank: string, uplineId: string | null) {
  if (uplineId) {
    if (uplineId === id) return { ok: false as const, error: "上線不能是自己" };
    const all = await db.select({ id: coaches.id, uplineId: coaches.uplineId }).from(coaches);
    const parent = new Map(all.map((c) => [c.id, c.uplineId]));
    let cur: string | null | undefined = uplineId;
    const seen = new Set<string>();
    while (cur) {
      if (cur === id) return { ok: false as const, error: "會形成組織環（該教練已在你的下線）" };
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = parent.get(cur) ?? null;
    }
  }
  await db.update(coaches).set({ orgRank, uplineId }).where(eq(coaches.id, id));
  return { ok: true as const };
}
