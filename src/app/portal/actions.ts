"use server";

// 客戶端首頁的 server actions。
// ⚠️ "use server" 檔案的每一個 export 都必須是 async function——匯出一個常數會讓
//    整個模組變成「沒有任何 export」，而且只有 next build 抓得到。
import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientPlanCase } from "@/lib/clientPlan";
import { setClientTodoDone } from "@/lib/clientTodos";

/**
 * 客戶把自己的待辦勾成完成（或取消）。
 *
 * clientId 從登入身分反查，不從參數拿——否則任何人都能勾掉別人的待辦。
 * 資料層 setClientTodoDone 另有一道 clientId 條件，兩道都在才算擋住。
 */
export async function toggleMyTodoAction(itemId: string, done: boolean): Promise<{ ok: boolean }> {
  const user = await ensureClientUser();
  if (!user) return { ok: false };
  const plan = await getClientPlanCase(user.id);
  if (!plan) return { ok: false };
  const ok = await setClientTodoDone(plan.clientId, itemId, done);
  if (ok) revalidatePath("/portal");
  return { ok };
}
