// 客戶的「可見範圍」與「可寫範圍」——教練端所有查詢的兩把尺。
//
// 這支檔案存在的理由：共同執案（client_collaborators）上線後，「這位客戶是不是我的」
// 不再只有一種答案。
//
//   ownedClient(me)    ＝ 我是主責 → 可讀、可寫
//   readableClient(me) ＝ 我是主責 **或** 我是已接受的協作教練 → 只可讀
//   templateClient()   ＝ 共用示範範本 → 全體教練可讀，**沒有人可寫**（第四把尺，見檔尾）
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

/**
 * 共用示範範本一律不算「客戶」。
 *
 * ⚠️ 這個條件是明確的排除，不是備援。範本的形狀本來就是 coach_id = null，
 * 照理說 `eq(clients.coachId, me)` 永遠選不到它——但那是「剛好安全」：
 * 只要哪天有人手滑把某個範本的 coach_id 設成某位教練（最可能的路徑是「把既有客戶
 * 轉成範本」時忘了清 coach_id），那個範本就會直接出現在他的客戶列表、可寫、還佔他的額度，
 * 而且第一個發現的人會是被改壞展示的另一位教練。
 * 加上這一句之後，這件事在資料層就不可能發生，跟資料乾不乾淨無關。
 *
 * ⚠️ 條件**逐支函式寫死**、不抽成共用常數：clientScope.drift.test.ts 是逐字掃
 * `eq(clients.isTemplate, false)` 這串原始碼的。抽成常數會讓掃描漂過去，
 * 而「掃得到」正是這道防線唯一的維持方式。
 */

/** 寫入範圍：只有主責教練（且必定不是範本）。 */
export function ownedClient(coachId: string): SQL {
  return and(eq(clients.coachId, coachId), eq(clients.isTemplate, false)) as SQL;
}

/**
 * 讀取範圍：主責 **或** 已接受邀請的協作教練。
 *
 * 用 EXISTS 相關子查詢而不是先撈一份 id 陣列再 inArray()：
 * 協作數量不受控（一位教練可能被邀進幾十個案子），而且兩段式查詢中間的空窗
 * 會讓「剛被移除」的協作者還能讀到一次。
 */
export function readableClient(coachId: string): SQL {
  return and(
    or(
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
    ),
    // 範本永遠走 templateClient()，不從這裡外洩（理由見上方 NOT-TEMPLATE 那段）。
    eq(clients.isTemplate, false),
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

/**
 * 共用示範範本的可見範圍。**第四把尺，而且是唯一一把跨租戶的尺。**
 *
 * 前三把尺都帶著 coachId：它們回答的是「這位客戶跟我是什麼關係」。
 * 這一把不帶任何身分——它回答的是「這一列是不是公司的公開展示素材」，
 * 所以只要是登入中的 active 教練，看到的都是同一份。
 *
 * 為什麼要開這把尺：教練坐在客戶旁邊時需要一份「已經有內容」的個案翻給對方看，
 * 而那份東西不能是任何一位真實客戶（會外洩），也不能是每位教練各自建一份
 * （改壞了沒人救得回來、還白白吃掉每個人的客戶額度）。
 * 所以它是一份公司維護的、全體共用的、誰都改不動的展示資料。
 *
 * ⚠️⚠️ 它的邊界只有一條，但這一條非常硬：
 *
 *   **沒有任何寫入路徑可以吃這把尺。**
 *
 * 它跟 annotatableClient() 的風險方向剛好相反：annotatable 是「範圍窄、但可寫」，
 * 一旦外流是多幾個人改得動一位客戶；templateClient 是「不可寫、但範圍是全公司」，
 * 一旦被接到任何 update/delete 上，就是**任何一位教練都改得動所有教練的展示素材**，
 * 而且甲改壞的東西是乙在客戶面前才發現。所以範本的寫入完全不走這裡：
 * 只走 lib/templates.ts 的管理端四支，那四支**自己驗 isAdmin()**，
 * 用的租戶條件是「你是不是管理員」，不是這把尺。
 *
 * 開它的四道配套，缺一不可：
 *
 *   1. 這支函式**只准出現在 `src/lib/templates.ts`**（與本檔）。
 *      任何寫入路徑（clients / plans / reviews / revisions / notes）沾到它，
 *      就是上面那個「全公司互相改壞」的情境。
 *      → `clientScope.drift.test.ts` 逐檔掃原始碼守著。
 *
 *   2. `ownedClient()` 與 `readableClient()` 都明確排除 `isTemplate`。
 *      缺這道 → 誤設了 coach_id 的範本會混進某位教練的客戶列表：可寫、且佔額度。
 *
 *   3. `usedClientCount()`（lib/quota.ts）同樣排除。
 *      缺這道 → 範本佔掉全體教練的客戶數上限，而他們的列表上根本看不到那幾位是誰。
 *
 *   4. 讀取端回傳的東西要**在型別上標成唯讀**（templates.ts 的 `readOnly: true`），
 *      UI 才有東西可以掛唯讀橫幅。缺這道 → 畫面長得跟一般客戶一模一樣，
 *      教練會照常編輯，然後每一次存檔都被資料層默默擋掉（他只會覺得系統壞了）。
 *
 * 想拿範本來實際試算，走 `copyTemplateToCoach()`：複製成一位**正常的客戶**
 * （coachId＝自己、isTemplate=false、發真實客戶編號、計入額度），從那一刻起
 * 它就只受第一把尺管轄，跟這裡再也沒有關係。
 */
export function templateClient(): SQL {
  return eq(clients.isTemplate, true) as SQL;
}
