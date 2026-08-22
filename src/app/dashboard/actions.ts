"use server";

// 客戶管理的伺服器動作。每個動作都在伺服器端重新驗證教練身份、狀態與使用期限。
import { revalidatePath } from "next/cache";
import { requireWritableCoach, requireClientQuota } from "@/lib/guard";
import * as Clients from "@/lib/clients";
import * as Plans from "@/lib/plans";
import * as Reviews from "@/lib/reviews";
import { logRevision } from "@/lib/revisions";

// 這裡是教練端「所有寫入」的唯一身分入口 —— 期限到期的唯讀鎖定就掛在 requireWritableCoach()，
// 不要繞過它直接取教練身分，否則那條路徑會變成到期後仍可寫的破口。
async function coachId(): Promise<string> {
  const me = await requireWritableCoach();
  return me.id;
}

// ── 客戶 ─────────────────────────────────────────────
// 回傳成敗而不是用 throw：額度已滿與期限到期是「使用者要看到理由」的情況，
// 而 Next 在正式環境會把 server action 丟出的錯誤訊息換成沒有意義的 digest，
// 畫面上就只剩「建立失敗，請重試」——重試一百次也不會成功。
export type CreateClientResult = { ok: true; id: string } | { ok: false; error: string };

export async function createClientAction(input: Clients.ClientInput): Promise<CreateClientResult> {
  const me = await requireWritableCoach();
  try {
    // 客戶數上限依級別（實習與 C1–C3 為 20 位、S1–S2 為 50 位、S3 與首席為 100 位）
    await requireClientQuota(me);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "已達客戶數上限" };
  }
  const id = await Clients.createClient(me.id, input);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/overview");
  return { ok: true, id };
}

export async function updateClientAction(clientId: string, patch: Partial<Clients.ClientInput>): Promise<void> {
  const cid = await coachId();
  await Clients.updateClient(cid, clientId, patch);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
}

export async function archiveClientAction(clientId: string): Promise<void> {
  const cid = await coachId();
  await Clients.setClientStatus(cid, clientId, "archived");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${clientId}`);
}

// ── 年度版本 ─────────────────────────────────────────
export async function savePlanDataAction(planId: string, data: unknown): Promise<{ netWorth: number | null; healthGrade: string | null }> {
  const me = await requireWritableCoach();
  const snap = await Plans.updatePlanData(me.id, planId, data);
  await logRevision(planId, "coach", me.id, me.name, data); // 存版本快照＋標作者
  return snap;
}

export async function clonePlanAction(planId: string): Promise<string> {
  const cid = await coachId();
  const id = await Plans.clonePlan(cid, planId);
  // 唯一沒補 revalidatePath 的教練端寫入 action：呼叫端會 router.push 到新編輯器所以看不出來，
  // 但使用者按上一頁回客戶頁時會看不到剛複製出的版本。
  revalidatePath("/dashboard/clients");
  return id;
}

export async function createPlanAction(clientId: string, name: string): Promise<string> {
  const cid = await coachId();
  const id = await Plans.createPlan(cid, clientId, name);
  revalidatePath(`/dashboard/clients/${clientId}`);
  return id;
}

export async function updatePlanMetaAction(clientId: string, planId: string, patch: Plans.PlanMetaPatch): Promise<void> {
  const cid = await coachId();
  await Plans.updatePlanMeta(cid, planId, patch);
  revalidatePath(`/dashboard/clients/${clientId}`);
}

export async function deletePlanAction(clientId: string, planId: string): Promise<void> {
  const cid = await coachId();
  await Plans.deletePlan(cid, planId);
  revalidatePath(`/dashboard/clients/${clientId}`);
}

// ── 諮詢紀錄 ─────────────────────────────────────────
export async function createReviewAction(clientId: string, input: Reviews.ReviewInput): Promise<void> {
  const cid = await coachId();
  await Reviews.createReview(cid, clientId, input);
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/overview");
}

export async function updateReviewAction(clientId: string, reviewId: string, patch: Partial<Reviews.ReviewInput>): Promise<void> {
  const cid = await coachId();
  await Reviews.updateReview(cid, reviewId, patch);
  revalidatePath(`/dashboard/clients/${clientId}`);
}

export async function deleteReviewAction(clientId: string, reviewId: string): Promise<void> {
  const cid = await coachId();
  await Reviews.deleteReview(cid, reviewId);
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/overview");
}

// ── 動作項目 ─────────────────────────────────────────
export async function createActionItemAction(clientId: string, input: Reviews.ActionItemInput): Promise<void> {
  const cid = await coachId();
  await Reviews.createActionItem(cid, clientId, input);
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/overview");
}

export async function setActionItemDoneAction(clientId: string, itemId: string, done: boolean): Promise<void> {
  const cid = await coachId();
  await Reviews.setActionItemDone(cid, itemId, done);
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/overview");
}

export async function deleteActionItemAction(clientId: string, itemId: string): Promise<void> {
  const cid = await coachId();
  await Reviews.deleteActionItem(cid, itemId);
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/overview");
}
