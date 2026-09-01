"use server";

// 客戶端首頁的 server actions。
// ⚠️ "use server" 檔案的每一個 export 都必須是 async function——匯出一個常數會讓
//    整個模組變成「沒有任何 export」，而且只有 next build 抓得到。
import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientPlanCase } from "@/lib/clientPlan";
import { setClientTodoDone } from "@/lib/clientTodos";
import { submitClientQuiz } from "@/lib/clientRiskQuiz";
import { RISK_QUIZ_TODO } from "@/lib/riskQuizTodo";
import { db } from "@/Shared/db";
import { actionItems } from "@/Shared/db/schema";
import { and, eq } from "drizzle-orm";

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

/**
 * 客戶送出投資風險屬性測驗。
 *
 * ⚠️ clientId 從登入身分反查，答案只送選項索引——分數與等級一律由伺服器
 *    用 src/lib/riskQuiz.ts 重算（信任前端算的分數＝讓客戶自己決定風險等級）。
 * ⚠️ 送出成功順手把那則待辦勾掉，否則客戶填完了清單上還掛著。
 */
export async function submitMyRiskQuizAction(
  answers: unknown,
): Promise<{ ok: true; score: number; tier: string } | { ok: false; error: string }> {
  const user = await ensureClientUser();
  if (!user) return { ok: false, error: "請先登入" };
  const plan = await getClientPlanCase(user.id);
  if (!plan) return { ok: false, error: "找不到你的規劃" };
  const r = await submitClientQuiz(plan.clientId, answers);
  if (!r.ok) return r;
  try {
    await db
      .update(actionItems)
      .set({ done: true })
      .where(and(eq(actionItems.clientId, plan.clientId), eq(actionItems.title, RISK_QUIZ_TODO)));
  } catch {
    /* 待辦勾不掉不該讓作答白填 */
  }
  revalidatePath("/portal");
  return { ok: true, score: r.row.score ?? 0, tier: r.row.tier ?? "" };
}
