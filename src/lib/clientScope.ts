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

/**
 * 註記寫入範圍：主責 **或** 已接受邀請的協作教練。
 *
 * ⚠️⚠️ 這是第三把尺，也是唯一一條「讀得到就寫得進去」的例外，開它是有代價的。
 *
 * 為什麼要開：共同執案的用途就是找資深教練來看一個案子，而他能給的東西是「意見」。
 * 一個字都不能留的協作，等於只能口頭講完就散了。所以協作教練可以寫註記——
 * 但只能寫註記，資料本身仍然一個字都改不動。
 *
 * 開它的三道配套，缺一不可（少任何一道，唯讀協作就從「能留意見」變成「能影響客戶」）：
 *
 *   1. 這支函式**只准出現在 `src/lib/notes.ts`**。任何其他寫入路徑用到它，
 *      唯讀協作就會擴散成可寫，而畫面上完全看不出來。
 *      → `clientScope.drift.test.ts` 逐檔掃原始碼守著。
 *
 *   2. 協作教練寫的列，`authorAccess='viewer'`，而 `visible` 由**資料層強制**寫成 false
 *      （不是靠 UI 把 checkbox 變灰）。他的意見留給主責教練看，不會流到客戶面前。
 *
 *   3. 他只能改／刪**自己寫的那一列**（`authorId = me`），不能動主責寫的。
 *
 * 除了註記以外的任何東西（clients / plans / reviews / actionItems / revisions 的寫入），
 * 一律只能用 ownedClient()。
 */
export function annotatableClient(coachId: string): SQL {
  return readableClient(coachId);
}
