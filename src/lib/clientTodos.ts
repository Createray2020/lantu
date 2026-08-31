// 客戶端的待辦清單。
//
// 資料就是既有的 action_items（教練端「動作項目」那張表），不另開新表——
// 「教練要客戶補的東西」與「這次諮詢談定要做的事」本來就是同一件事，
// 分成兩張表只會讓兩邊各記一半。
//
// 兩個來源：
//  1. 規劃器「待補齊清單」按「送到客戶待辦」（Reviews.createActionItems）
//  2. 一場諮詢結束時，kind='todo' 的註記自動落進來（consultSession）
//
// ⚠️ clientId 一律由呼叫端從登入身分反查，不從表單參數拿；這裡再加一道
//    「這一筆真的屬於你」的條件，兩道都在才擋得住改 id 去勾別人的待辦。
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems } from "@/Shared/db/schema";

export type ClientTodo = {
  id: string;
  title: string;
  owner: string | null;
  dueDate: string | null;
  done: boolean;
};

/** 未完成排前面，其次依到期日、再依建立順序。 */
export async function listClientTodos(clientId: string): Promise<ClientTodo[]> {
  return db
    .select({
      id: actionItems.id,
      title: actionItems.title,
      owner: actionItems.owner,
      dueDate: actionItems.dueDate,
      done: actionItems.done,
    })
    .from(actionItems)
    .where(eq(actionItems.clientId, clientId))
    .orderBy(asc(actionItems.done), asc(actionItems.dueDate), asc(actionItems.createdAt));
}

/** 客戶自己勾完成／取消。回傳 false ＝ 這筆不屬於他（或不存在），呼叫端不要當成成功。 */
export async function setClientTodoDone(clientId: string, itemId: string, done: boolean): Promise<boolean> {
  const rows = await db
    .update(actionItems)
    .set({ done })
    .where(and(eq(actionItems.id, itemId), eq(actionItems.clientId, clientId)))
    .returning({ id: actionItems.id });
  return rows.length > 0;
}
