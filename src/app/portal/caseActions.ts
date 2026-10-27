"use server";
// 客戶端（會員中心）的案件相關 actions：標通知已讀、向教練提問（寫站內通知＋案件紀錄）。
import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientPlanCase } from "@/lib/clientPlan";
import { markRead, notify } from "@/lib/notify";
import { getCaseByClient } from "@/lib/caseStore";
import { db } from "@/Shared/db";
import { serviceCaseLog } from "@/Shared/db/schema";
import { submitFeedback } from "@/lib/serviceFeedback";

type R = { ok: true } | { ok: false; error: string };

export async function markNotificationsReadAction(ids: string[] | "all"): Promise<R> {
  const me = await ensureClientUser();
  if (!me) return { ok: false, error: "請先登入" };
  await markRead("client", me.id, ids);
  revalidatePath("/portal");
  return { ok: true };
}

/** 客戶在會員中心問教練：通知主責教練（kind=case_question）、寫進案件紀錄。沒有案件時也能問（只發通知）。 */
export async function askCoachAction(text: string): Promise<R> {
  const me = await ensureClientUser();
  if (!me) return { ok: false, error: "請先登入" };
  const q = text.trim().slice(0, 600);
  if (!q) return { ok: false, error: "請先寫下你的問題" };
  const pc = await getClientPlanCase(me.id);
  if (!pc) return { ok: false, error: "你還沒有指定的教練" };
  const b = await getCaseByClient(pc.clientId);
  const { clients } = await import("@/Shared/db/schema");
  const { eq } = await import("drizzle-orm");
  const [cl] = await db.select({ coachId: clients.coachId, name: clients.name }).from(clients).where(eq(clients.id, pc.clientId)).limit(1);
  if (!cl?.coachId) return { ok: false, error: "你還沒有指定的教練" };
  await notify({ to: "coach", id: cl.coachId, kind: "case_question", title: `${cl.name || me.name || "客戶"} 在會員中心提問`, body: q, href: `/dashboard/clients/${pc.clientId}`, caseId: b?.case.id ?? null });
  if (b) await db.insert(serviceCaseLog).values({ caseId: b.case.id, stage: b.case.stage, actorType: "client", actorId: me.id, actorName: (cl.name || me.name || "客戶").slice(0, 80), action: "client_question", detail: { text: q } });
  revalidatePath("/portal");
  return { ok: true };
}

export async function submitFeedbackAction(id: string, scores: number[], comment: string): Promise<R> {
  const me = await ensureClientUser();
  if (!me) return { ok: false, error: "請先登入" };
  const r = await submitFeedback(id, me.id, scores, comment);
  if (!r.ok) return r;
  revalidatePath("/portal");
  return { ok: true };
}
