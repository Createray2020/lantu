// 教練帳號與權限（伺服器端）。
// Clerk 負責「你是誰」；這裡負責「你能不能用」（coaches 表的 role/status）。
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches, clientUsers } from "@/Shared/db/schema";

export type Coach = typeof coaches.$inferSelect;

function adminEmails(): string[] {
  return (process.env.LANTU_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// 確保目前登入的 Clerk 使用者在 coaches 表有一筆資料，並回傳該筆。
// - 管理員 email：自動 role=admin、status=active。
// - 其他人：首次登入建立為 status=pending（待審核）。
// 既有一般教練的 status 不會因為再次登入被覆寫（尊重後台核准結果）。
export async function ensureCoach(): Promise<Coach | null> {
  const user = await currentUser();
  if (!user) return null;

  // 互斥：已是客戶帳號 → 不建立教練（避免客戶誤入教練流程被當成待開通顧問）。
  const asClient = await db
    .select({ id: clientUsers.id })
    .from(clientUsers)
    .where(eq(clientUsers.id, user.id))
    .limit(1);
  if (asClient[0]) return null;

  const email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;
  const isAdmin = !!email && adminEmails().includes(email);

  await db
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
    });

  // 保證管理員永遠是 admin + active（即使先前是別的狀態）。
  if (isAdmin) {
    await db
      .update(coaches)
      .set({ role: "admin", status: "active" })
      .where(eq(coaches.id, user.id));
  }

  const rows = await db.select().from(coaches).where(eq(coaches.id, user.id)).limit(1);
  return rows[0] ?? null;
}

export async function isAdmin(coach: Coach | null): Promise<boolean> {
  return !!coach && coach.role === "admin";
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
export async function setCoachOrg(id: string, orgRank: string, uplineId: string | null) {
  await db.update(coaches).set({ orgRank, uplineId }).where(eq(coaches.id, id));
}
