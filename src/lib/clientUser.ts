// 客戶帳號與身分（伺服器端）。
// Clerk 負責「你是誰」；這裡負責「你是客戶端使用者」（client_users 表）。
// 與 coaches 互斥：已是教練者不建立客戶帳號（反向互斥見 ensureCoach）。
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientUsers, coaches } from "@/Shared/db/schema";

export type ClientUser = typeof clientUsers.$inferSelect;

// 確保目前登入的 Clerk 使用者在 client_users 表有一筆資料，並回傳該筆。
// - 若該 Clerk 使用者已是教練（coaches 有列）→ 回 null（他是教練，不是客戶）。
// - 否則首次登入即建立為 status=active（客戶自助入口，免教練審核）。
export async function ensureClientUser(): Promise<ClientUser | null> {
  const user = await currentUser();
  if (!user) return null;

  // 互斥：已是教練 → 不是客戶。
  const asCoach = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(eq(coaches.id, user.id))
    .limit(1);
  if (asCoach[0]) return null;

  const email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;

  await db
    .insert(clientUsers)
    .values({ id: user.id, email, name, status: "active" })
    .onConflictDoUpdate({ target: clientUsers.id, set: { email, name } });

  // 盡力在 Clerk 標記角色（供未來 middleware／導流優化用；失敗不影響流程）。
  if (user.publicMetadata?.role !== "client") {
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(user.id, {
        publicMetadata: { role: "client" },
      });
    } catch {
      // best-effort，忽略
    }
  }

  const rows = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.id, user.id))
    .limit(1);
  return rows[0] ?? null;
}
