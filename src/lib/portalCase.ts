// 會員中心的資料組裝（客戶端）：案件＋階段 → MemberCenterData。只給承諾／實際日；預計日不出去。
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, coaches, reviews } from "@/Shared/db/schema";
import { getCaseByClient, loadStageParams } from "./caseStore";
import { stageProgress, dueForClient, completion, paramsFor, STAGES, type Stage } from "./caseEngine";
import { listClientTodos } from "./clientTodos";
import { getSupportContact } from "./supportContact";
import { displayNameOf } from "./coachName";
import { todayISO } from "./license";
import type { MemberCenterData } from "@/app/portal/MemberCenter";

export type PortalCaseState = { kind: "none" } | { kind: "no_case"; coachName: string } | { kind: "case"; data: MemberCenterData };

export async function portalCaseState(clientId: string, clientName: string): Promise<PortalCaseState> {
  const [cl] = await db.select({ coachId: clients.coachId, name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!cl?.coachId) return { kind: "none" };
  const [co] = await db.select({ displayName: coaches.displayName, name: coaches.name, email: coaches.email }).from(coaches).where(eq(coaches.id, cl.coachId)).limit(1);
  const coachName = co ? displayNameOf(co) : "";
  const b = await getCaseByClient(clientId);
  if (!b) return { kind: "no_case", coachName };
  const c = b.case;
  const today = todayISO();
  const [next] = await db.select({ at: reviews.nextAppt }).from(reviews)
    .where(and(eq(reviews.clientId, clientId), isNotNull(reviews.nextAppt), gte(reviews.nextAppt, today))).orderBy(desc(reviews.date)).limit(1);
  const row = { stage: c.stage as Stage, status: c.status as "active" | "paused" | "closed" };
  const comp = completion(row);
  const [todos, support, overrides] = await Promise.all([listClientTodos(clientId), getSupportContact(), loadStageParams()]);
  return {
    kind: "case",
    data: {
      name: cl.name || clientName, caseNo: c.caseNo, startedAt: c.startedAt, stage: c.stage as Stage, status: c.status,
      waiting: c.flags.includes("waiting") ? { since: c.waitingSince, note: c.waitingNote } : null,
      done: comp.done, total: comp.total, coachName, nextMeeting: next?.at ?? null,
      stages: STAGES.map((st) => {
        const r = b.stages.find((s) => s.stage === st);
        return {
          stage: st, progress: stageProgress(row, st),
          due: dueForClient({ promisedDate: r?.promisedDate ?? null, actualDate: r?.actualDate ?? null }),
          // 客戶端只給承諾／實際；預計完成日留教練端（Ray 2026/10/28 定案），這裡刻意不送出去
          promisedDate: r?.promisedDate ?? null, actualDate: r?.actualDate ?? null,
          // 待開始的階段還沒有列：先用預設清單（全未勾）讓客戶看得到後面的流程（Ray 2026/10/28）
          checklist: r ? r.checklist.map((x) => ({ label: x.label, done: x.done })) : paramsFor(st, overrides).checklist.map((x) => ({ label: x.label, done: false })),
          note: r?.note ?? "", decision: r?.decision ?? "",
        };
      }),
      todos: todos.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, done: t.done })),
      support,
    },
  };
}
