// 客戶帳號與身分（伺服器端）。
// Clerk 負責「你是誰」；這裡負責「你是客戶端使用者」（client_users 表）。
// 註：教練與客戶不互斥——同一個帳號可同時是教練也是客戶（自己的財務規劃）。
//     介面看你進到哪個區域（/portal＝客戶、/dashboard＝教練），不由身分綁死。
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientLoginEvents, clientUsers } from "@/Shared/db/schema";

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

  // 角色判斷一律走跨表（coaches/client_users）；不呼叫 Clerk Backend API，
  // 避免開發金鑰限額/網路抖動讓存檔的 server action 間斷 503。

  const rows = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.id, user.id))
    .limit(1);
  const row = rows[0] ?? null;
  // 停權要真的擋得住。此前 status 只是被寫進去、全系統沒有任何一支在讀，
  // 停權的帳號照樣能進 /portal 讀寫自己的規劃——等於這個欄位是裝飾用的。
  // 與 ensureCoach 的 pending/suspended 判斷對稱。
  if (row && row.status !== "active") return null;
  if (row) await recordLogin(row);
  return row;
}

/**
 * 訪客足跡：這次進來算不算「一次新的登入」。
 *
 * ⚠️ 一次登入 ＝ 一個 Clerk session，不是一次頁面載入。ensureClientUser() 每開一頁就跑一次，
 *    直接 +1 的話，一位訪客翻十頁就會在後台變成「登入 10 次」。
 * ⚠️ 判斷與寫入合在**同一句 UPDATE** 裡（WHERE last_session_id IS DISTINCT FROM ?）：
 *    neon-http 沒有交易，先讀再寫的話，同一個 session 的兩個平行請求會各自看到舊值、
 *    各記一次。交給 Postgres 的列鎖，第二句重新比對時 last_session_id 已經是新的 → 不動。
 *    事件列只在 UPDATE 真的改到一列時才寫，兩者不會脫鉤。
 * ⚠️ 這裡的任何失敗都只吞掉：訪客記錄壞掉可以之後補，但不能讓客戶連 /portal 都進不去。
 */
async function recordLogin(row: ClientUser): Promise<void> {
  try {
    const { sessionId } = await auth();
    if (!sessionId || row.lastSessionId === sessionId) return;
    const now = new Date();
    const changed = await db
      .update(clientUsers)
      .set({
        lastLoginAt: now,
        lastSessionId: sessionId,
        loginCount: sql`${clientUsers.loginCount} + 1`,
      })
      .where(and(
        eq(clientUsers.id, row.id),
        // drizzle 0.45 沒有 isDistinctFrom()；IS DISTINCT FROM 才處理得了 last_session_id 為 NULL
        // 的第一次登入（`<> ?` 對 NULL 回 NULL＝條件不成立，那一筆會永遠記不到）。
        sql`${clientUsers.lastSessionId} is distinct from ${sessionId}`,
      ))
      .returning({ id: clientUsers.id });
    if (changed.length === 0) return;
    await db.insert(clientLoginEvents).values({ clientUserId: row.id, sessionId, at: now });
  } catch {
    // 靜默：訪客記錄是側寫，不是客戶端的必要路徑。
  }
}
