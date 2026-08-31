// 諮詢紀錄與動作項目資料層（教練隔離；透過 clientId → coachId 驗證）。
import { and, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clients, plans, reviews } from "@/Shared/db/schema";

async function assertClientOwned(coachId: string, clientId: string): Promise<void> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.coachId, coachId)))
    .limit(1);
  if (!row) throw new Error("forbidden");
}

/**
 * 諮詢紀錄掛的 planId 必須是**同一位客戶**的規劃。
 *
 * 少了這一句，只要驗過 clientId（那是呼叫端唯一會驗的東西），planId 就原樣寫進去了：
 * 拿別位客戶（甚至別位教練名下客戶）的 plan id 送進來也照收。後果不是外洩——
 * reviews.plan_id 只是個 uuid，畫面不會去讀它——而是資料默默錯位：
 * 客戶詳情頁的「這次檢視的是哪一版」指到不存在於這位客戶的版本，
 * 而 deletePlan 的 ON DELETE SET NULL 又會在別人刪版本時把它清成 null，事後查不出原本指到誰。
 *
 * planId 為 null／undefined＝這筆紀錄不掛版本，是正常情況，直接放行。
 */
export async function assertPlanOfClient(planId: string | null | undefined, clientId: string): Promise<void> {
  if (!planId) return;
  const [row] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.clientId, clientId)))
    .limit(1);
  if (!row) throw new Error("plan-not-of-client");
}

export type ReviewInput = {
  date: string;
  type?: string;
  planId?: string | null;
  attendees?: string | null;
  summary?: string | null;
  nextAppt?: string | null;
};

export async function createReview(coachId: string, clientId: string, input: ReviewInput): Promise<string> {
  await assertClientOwned(coachId, clientId);
  await assertPlanOfClient(input.planId, clientId);
  const [row] = await db
    .insert(reviews)
    .values({
      clientId,
      date: input.date,
      type: input.type ?? "review",
      planId: input.planId ?? null,
      attendees: input.attendees ?? null,
      summary: input.summary ?? null,
      nextAppt: input.nextAppt ?? null,
    })
    .returning({ id: reviews.id });
  return row.id;
}

async function reviewOwnerClient(coachId: string, reviewId: string): Promise<string | null> {
  const [row] = await db
    .select({ clientId: reviews.clientId })
    .from(reviews)
    .innerJoin(clients, eq(reviews.clientId, clients.id))
    .where(and(eq(reviews.id, reviewId), eq(clients.coachId, coachId)))
    .limit(1);
  return row?.clientId ?? null;
}

export async function updateReview(coachId: string, reviewId: string, patch: Partial<ReviewInput>): Promise<void> {
  const clientId = await reviewOwnerClient(coachId, reviewId);
  if (!clientId) throw new Error("forbidden");
  if (patch.planId !== undefined) await assertPlanOfClient(patch.planId, clientId);
  await db
    .update(reviews)
    .set({
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.planId !== undefined ? { planId: patch.planId } : {}),
      ...(patch.attendees !== undefined ? { attendees: patch.attendees } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.nextAppt !== undefined ? { nextAppt: patch.nextAppt } : {}),
    })
    .where(eq(reviews.id, reviewId));
}

export async function deleteReview(coachId: string, reviewId: string): Promise<void> {
  if (!(await reviewOwnerClient(coachId, reviewId))) throw new Error("forbidden");
  await db.delete(reviews).where(eq(reviews.id, reviewId));
}

export type ActionItemInput = {
  title: string;
  owner?: string | null;
  dueDate?: string | null;
  reviewId?: string | null;
};

export async function createActionItem(coachId: string, clientId: string, input: ActionItemInput): Promise<string> {
  await assertClientOwned(coachId, clientId);
  const [row] = await db
    .insert(actionItems)
    .values({
      clientId,
      title: input.title,
      owner: input.owner ?? null,
      dueDate: input.dueDate ?? null,
      reviewId: input.reviewId ?? null,
    })
    .returning({ id: actionItems.id });
  return row.id;
}

/**
 * 一次建立多筆動作項目（「待補齊清單 → 客戶待辦」用）。
 *
 * ⚠️ 同一個標題不重複建：教練會反覆按「送到客戶待辦」，每按一次多一份就沒人想用了。
 *    只比對「還沒完成」的那些——已經完成又再度缺件是真的要再提醒一次。
 * ⚠️ 回傳實際新增的筆數，畫面才講得出「新增 3 筆、4 筆已經在清單上」。
 */
export async function createActionItems(
  coachId: string,
  clientId: string,
  titles: string[],
  owner: string | null = "客戶",
): Promise<{ added: number; skipped: number }> {
  await assertClientOwned(coachId, clientId);
  const want = Array.from(new Set(titles.map((t) => String(t ?? "").trim()).filter(Boolean))).slice(0, 50);
  if (!want.length) return { added: 0, skipped: 0 };
  const existing = await db
    .select({ title: actionItems.title })
    .from(actionItems)
    .where(and(eq(actionItems.clientId, clientId), eq(actionItems.done, false)));
  const have = new Set(existing.map((r) => r.title));
  const fresh = want.filter((t) => !have.has(t));
  if (fresh.length) {
    await db.insert(actionItems).values(fresh.map((title) => ({ clientId, title, owner })));
  }
  return { added: fresh.length, skipped: want.length - fresh.length };
}

async function itemOwned(coachId: string, itemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: actionItems.id })
    .from(actionItems)
    .innerJoin(clients, eq(actionItems.clientId, clients.id))
    .where(and(eq(actionItems.id, itemId), eq(clients.coachId, coachId)))
    .limit(1);
  return !!row;
}

export async function setActionItemDone(coachId: string, itemId: string, done: boolean): Promise<void> {
  if (!(await itemOwned(coachId, itemId))) throw new Error("forbidden");
  await db.update(actionItems).set({ done }).where(eq(actionItems.id, itemId));
}

export async function deleteActionItem(coachId: string, itemId: string): Promise<void> {
  if (!(await itemOwned(coachId, itemId))) throw new Error("forbidden");
  await db.delete(actionItems).where(eq(actionItems.id, itemId));
}
