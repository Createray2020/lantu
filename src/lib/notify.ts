// 站內通知中心（2026/10/28 案件進度定案 ④）。三邊共用：教練（recipient_type=coach）與客戶（client）。
// 不推播、不寄信——不登入就看不到，這是已接受的限制。
// dedupeKey：同一件事只發一次（cron 每天跑也不會洗版）。沒給就每次都發。
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { notifications } from "@/Shared/db/schema";

export type Notification = typeof notifications.$inferSelect;
export type RecipientType = "coach" | "client";
export type NotifyKind = "case_due" | "case_overdue" | "case_escalation" | "case_stage" | "case_question" | "case_flag" | "doc_sign" | "survey" | "todo" | "info";

export const KIND_LABEL: Record<NotifyKind, string> = {
  case_due: "即將到期", case_overdue: "逾期", case_escalation: "逾期升級", case_stage: "進度更新", case_question: "客戶提問", case_flag: "案件標記",
  doc_sign: "文件簽署", survey: "服務回饋", todo: "待辦", info: "通知",
};

export type NotifyInput = { to: RecipientType; id: string; kind: NotifyKind; title: string; body?: string; href?: string; caseId?: string | null; dedupeKey?: string | null };

/** 發一則；dedupeKey 撞到就靜默略過（回 false）。失敗不丟——通知是附屬，不能把主流程拉倒。 */
export async function notify(input: NotifyInput): Promise<boolean> {
  try {
    const rows = await db.insert(notifications).values({
      recipientType: input.to, recipientId: input.id, kind: input.kind, title: input.title.slice(0, 160), body: (input.body ?? "").slice(0, 600), href: input.href ?? "",
      caseId: input.caseId ?? null, dedupeKey: input.dedupeKey ?? null,
    }).onConflictDoNothing().returning({ id: notifications.id });
    return rows.length > 0;
  } catch {
    return false;
  }
}
export async function notifyMany(ids: string[], input: Omit<NotifyInput, "id">): Promise<number> {
  let n = 0;
  for (const id of [...new Set(ids)]) if (await notify({ ...input, id, dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${id}` : null })) n++;
  return n;
}

export async function listNotifications(to: RecipientType, id: string, limit = 40): Promise<Notification[]> {
  return db.select().from(notifications).where(and(eq(notifications.recipientType, to), eq(notifications.recipientId, id))).orderBy(desc(notifications.createdAt)).limit(limit);
}
export async function unreadCount(to: RecipientType, id: string): Promise<number> {
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.recipientType, to), eq(notifications.recipientId, id), isNull(notifications.readAt)));
  return r[0]?.n ?? 0;
}
export async function markRead(to: RecipientType, id: string, ids: string[] | "all"): Promise<void> {
  const where = ids === "all"
    ? and(eq(notifications.recipientType, to), eq(notifications.recipientId, id), isNull(notifications.readAt))
    : and(eq(notifications.recipientType, to), eq(notifications.recipientId, id), inArray(notifications.id, ids));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
