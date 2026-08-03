// 諮詢紀錄與動作項目資料層（教練隔離；透過 clientId → coachId 驗證）。
import { and, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clients, reviews } from "@/Shared/db/schema";

async function assertClientOwned(coachId: string, clientId: string): Promise<void> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.coachId, coachId)))
    .limit(1);
  if (!row) throw new Error("forbidden");
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
  if (!(await reviewOwnerClient(coachId, reviewId))) throw new Error("forbidden");
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
