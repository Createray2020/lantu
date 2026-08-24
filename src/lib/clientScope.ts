// 客戶的「可見範圍」與「可寫範圍」——教練端所有查詢的兩把尺。
//
// 這支檔案存在的理由：共同執案（client_collaborators）上線後，「這位客戶是不是我的」
// 不再只有一種答案。
//
//   ownedClient(me)    ＝ 我是主責 → 可讀、可寫
//   readableClient(me) ＝ 我是主責 **或** 我是已接受的協作教練 → 只可讀
//
// ⚠️ 任何會改資料的路徑（lib/clients 的 update、lib/plans 的 save/clone/delete、
//    lib/reviews、lib/revisions 的 restore）一律只能用 ownedClient()。
//    把 readableClient() 接到寫入條件上，「唯讀協作」就當場變成「共同編輯」，
//    而且畫面上完全看不出來 —— clientScope.test.ts 逐支守著這件事。
import { and, eq, exists, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientCollaborators, clients } from "@/Shared/db/schema";

/** 協作關係生效中的狀態值。pending/declined/revoked 都看不到任何東西。 */
export const COLLAB_ACCEPTED = "accepted";

/** 寫入範圍：只有主責教練。 */
export function ownedClient(coachId: string): SQL {
  return eq(clients.coachId, coachId) as SQL;
}

/**
 * 讀取範圍：主責 **或** 已接受邀請的協作教練。
 *
 * 用 EXISTS 相關子查詢而不是先撈一份 id 陣列再 inArray()：
 * 協作數量不受控（一位教練可能被邀進幾十個案子），而且兩段式查詢中間的空窗
 * 會讓「剛被移除」的協作者還能讀到一次。
 */
export function readableClient(coachId: string): SQL {
  return or(
    eq(clients.coachId, coachId),
    exists(
      db
        .select({ one: sql`1` })
        .from(clientCollaborators)
        .where(
          and(
            eq(clientCollaborators.clientId, clients.id),
            eq(clientCollaborators.coachId, coachId),
            eq(clientCollaborators.status, COLLAB_ACCEPTED),
          ),
        ),
    ),
  ) as SQL;
}

/** 這位教練對這位客戶的權限：主責 / 唯讀協作 / 沒有。 */
export type ClientAccess = "owner" | "viewer" | null;

export async function clientAccess(coachId: string, clientId: string): Promise<ClientAccess> {
  const [row] = await db
    .select({ coachId: clients.coachId })
    .from(clients)
    .where(and(eq(clients.id, clientId), readableClient(coachId)))
    .limit(1);
  if (!row) return null;
  return row.coachId === coachId ? "owner" : "viewer";
}
