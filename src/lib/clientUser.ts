// 客戶帳號與身分（伺服器端）。
// Clerk 負責「你是誰」；這裡負責「你是客戶端使用者」（client_users 表）。
// 註：教練與客戶不互斥——同一個帳號可同時是教練也是客戶（自己的財務規劃）。
//     介面看你進到哪個區域（/portal＝客戶、/dashboard＝教練），不由身分綁死。
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientUsers } from "@/Shared/db/schema";

export type ClientUser = typeof clientUsers.$inferSelect;

// 確保目前登入的 Clerk 使用者在 client_users 表有一筆資料，並回傳該筆。
// 任何登入者（含教練）都可有客戶身分；首次進來即建立為 status=active（自助、免審核）。
export async function ensureClientUser(): Promise<ClientUser | null> {
  const user = await currentUser();
  if (!user) return null;

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
