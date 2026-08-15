"use server";

// 客戶管理的伺服器動作。每個動作都在伺服器端重新驗證教練身份與狀態。
import { revalidatePath } from "next/cache";
import { ensureCoach } from "@/lib/coach";
import * as Clients from "@/lib/clients";
import * as Plans from "@/lib/plans";
import * as Reviews from "@/lib/reviews";
import { logRevision } from "@/lib/revisions";

async function coachId(): Promise<string> {
  const me = await ensureCoach();
  if (!me || me.status !== "active") throw new Error("forbidden");
  return me.id;
}

// ── 客戶 ─────────────────────────────────────────────
export async function createClientAction(input: Clients.ClientInput): Promise<string> {
  const cid = await coachId();
  const id = await Clients.createClient(cid, input);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/overview");
  return id;
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
  const me = await ensureCoach();
  if (!me || me.status !== "active") throw new Error("forbidden");
  const snap = await Plans.updatePlanData(me.id, planId, data);
  await logRevision(planId, "coach", me.id, me.name, data); // 存版本快照＋標作者
  return snap;
}

export async function clonePlanAction(planId: string): Promise<string> {
  const cid = await coachId();
  const id = await Plans.clonePlan(cid, planId);
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
