"use server";
// 案件進度（服務階段 4–8）的教練端 server actions。寫入只給主責教練（與系統管理）；S3／客戶關係／行政財法走唯讀。
import { revalidatePath } from "next/cache";
import { requireCoach, requireWritableCoach } from "@/lib/guard";
import { clientAccess } from "@/lib/clientScope";
import * as Case from "@/lib/caseStore";
import { isStage, type Stage, type CaseFlag, overdueDays, daysToDue, stageProgress, completion } from "@/lib/caseEngine";
import { caseScopeFor, canEditCase, canHandleFlags, s3For } from "@/lib/caseScope";
import { listActiveCoaches } from "@/lib/org";
import { listCasesForClient, recheckCommission } from "@/lib/serviceStore";
import { displayNameOf } from "@/lib/coachName";
import { todayISO } from "@/lib/license";
import { listNotifications, markRead, type Notification } from "@/lib/notify";
import { sendFeedback, listFeedbackForCase, handleFeedback } from "@/lib/serviceFeedback";

type R = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error && e.message ? e.message : "操作失敗" });

async function actorOf(me: { id: string; name: string | null; displayName: string | null; role: string }): Promise<Case.Actor> {
  return { type: me.role === "admin" ? "admin" : "coach", id: me.id, name: displayNameOf(me) };
}

export type CaseStageView = {
  stage: Stage; progress: "done" | "active" | "pending";
  startedOn: string | null; expectedDate: string | null; promisedDate: string | null; actualDate: string | null;
  checklist: { k: string; label: string; done: boolean; at?: string | null }[]; note: string; decision: string;
};
export type CaseViewRow = {
  id: string; caseNo: string; clientId: string; clientName: string; coachId: string; coachName: string; s3CoachId: string | null; s3Name: string | null;
  stage: Stage; status: string; flags: string[]; startedAt: string | null; pausedAt: string | null; pauseReason: string; waitingSince: string | null; waitingNote: string; waitingDays: number;
  closedAt: string | null; closeReason: string; closeNote: string; escalation: number;
  overdue: number; daysToDue: number | null; done: number; total: number;
  stages: CaseStageView[]; canEdit: boolean; canFlags: boolean;
  terms: { id: string; caseNo: string; year: number; kind: string; itemName: string; status: string }[];
  log: { at: string; who: string; action: string; reason: string; detail: Record<string, unknown> }[];
};

function shape(b: Case.CaseBundle, extra: { clientName: string; coachName: string; s3Name: string | null; canEdit: boolean; canFlags: boolean; terms: CaseViewRow["terms"]; log: CaseViewRow["log"] }): CaseViewRow {
  const c = b.case;
  const today = todayISO();
  const cur = b.stages.find((s) => s.stage === c.stage) ?? null;
  const row = { stage: c.stage as Stage, status: c.status as "active" | "paused" | "closed", flags: c.flags, startedAt: c.startedAt, waitingSince: c.waitingSince, waitingDays: c.waitingDays, pausedAt: c.pausedAt, closedAt: c.closedAt };
  const curDates = { promisedDate: cur?.promisedDate ?? null, expectedDate: cur?.expectedDate ?? null, actualDate: cur?.actualDate ?? null };
  const comp = completion(row);
  return {
    id: c.id, caseNo: c.caseNo, clientId: c.clientId, clientName: extra.clientName, coachId: c.coachId, coachName: extra.coachName, s3CoachId: c.s3CoachId, s3Name: extra.s3Name,
    stage: c.stage as Stage, status: c.status, flags: c.flags, startedAt: c.startedAt, pausedAt: c.pausedAt, pauseReason: c.pauseReason, waitingSince: c.waitingSince, waitingNote: c.waitingNote, waitingDays: c.waitingDays,
    closedAt: c.closedAt, closeReason: c.closeReason, closeNote: c.closeNote, escalation: c.escalation,
    overdue: overdueDays(row, curDates, today), daysToDue: daysToDue(row, curDates, today), done: comp.done, total: comp.total,
    stages: (["commission", "interview", "planning", "report", "tracking"] as Stage[]).map((st) => {
      const r = b.stages.find((s) => s.stage === st);
      return { stage: st, progress: stageProgress(row, st), startedOn: r?.startedOn ?? null, expectedDate: r?.expectedDate ?? null, promisedDate: r?.promisedDate ?? null, actualDate: r?.actualDate ?? null, checklist: r?.checklist ?? [], note: r?.note ?? "", decision: r?.decision ?? "" };
    }),
    canEdit: extra.canEdit, canFlags: extra.canFlags, terms: extra.terms, log: extra.log,
  };
}

/** 客戶頁的案件進度：主責可改、協作／所屬唯讀；沒有案件回 null。 */
export async function caseForClientAction(clientId: string): Promise<CaseViewRow | null> {
  const me = await requireCoach().catch(() => null);
  if (!me) return null;
  const access = await clientAccess(me.id, clientId);
  const all = await listActiveCoaches();
  const b = await Case.getCaseByClient(clientId);
  if (!b) return null;
  const scope = caseScopeFor(me, all);
  const inScope = access !== null || scope.kind === "all" || (scope.kind === "coaches" && scope.coachIds.includes(b.case.coachId));
  if (!inScope) return null;
  const [sum] = await Case.summarize([b.case]);
  const terms = await listCasesForClient(clientId);
  const log = await Case.listLog(b.case.id, 40);
  return shape(b, {
    clientName: sum?.clientName ?? "", coachName: sum?.coachName ?? "", s3Name: sum?.s3Name ?? (s3For(b.case, all) ? displayNameOf(s3For(b.case, all)!) : null),
    canEdit: canEditCase(me, b.case), canFlags: canHandleFlags(me),
    terms: terms.map((t) => ({ id: t.id, caseNo: t.caseNo, year: t.serviceYear, kind: t.kind, itemName: t.itemName, status: t.status })),
    log: log.map((l) => ({ at: l.createdAt.toISOString().slice(0, 16).replace("T", " "), who: l.actorName || (l.actorType === "system" ? "系統" : ""), action: l.action, reason: l.reason, detail: l.detail })),
  });
}

/** 沒付費也要追進度：主責教練手動開案件（冪等）。 */
export async function ensureCaseAction(clientId: string): Promise<R> {
  try {
    const me = await requireWritableCoach();
    if ((await clientAccess(me.id, clientId)) !== "owner") return { ok: false, error: "只有主責教練可以建立案件進度" };
    await Case.ensureCase(clientId, me.id, await actorOf(me));
    await recheckCommission(clientId);
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

async function editable(caseId: string) {
  const me = await requireWritableCoach();
  const c = await Case.getCase(caseId);
  if (!c) throw new Error("找不到案件");
  if (!canEditCase(me, c)) throw new Error("只有主責教練可以更改案件進度");
  return { me, c, actor: await actorOf(me) };
}
const bump = (clientId: string) => { revalidatePath(`/dashboard/clients/${clientId}`); revalidatePath("/dashboard/cases"); revalidatePath("/portal"); };

export async function completeStageAction(caseId: string, stage: string, reason = ""): Promise<R> {
  try {
    if (!isStage(stage)) return { ok: false, error: "階段不對" };
    const { c, actor } = await editable(caseId);
    const r = await Case.completeStage(caseId, stage, actor, { reason });
    if (!r.ok) return r;
    bump(c.clientId);
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function revertStageAction(caseId: string, reason: string): Promise<R> {
  try { const { c, actor } = await editable(caseId); const r = await Case.revertStage(caseId, actor, reason); if (!r.ok) return r; bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setPromisedAction(caseId: string, stage: string, date: string | null, reason = ""): Promise<R> {
  try {
    if (!isStage(stage)) return { ok: false, error: "階段不對" };
    const { c, actor } = await editable(caseId);
    const r = await Case.setPromised(caseId, stage, date || null, actor, reason); if (!r.ok) return r; bump(c.clientId); return { ok: true };
  } catch (e) { return fail(e); }
}
export async function setStageNoteAction(caseId: string, stage: string, note: string): Promise<R> {
  try { if (!isStage(stage)) return { ok: false, error: "階段不對" }; const { c, actor } = await editable(caseId); await Case.setStageNote(caseId, stage, note, actor); bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}
export async function toggleCheckAction(caseId: string, stage: string, k: string, done: boolean): Promise<R> {
  try { if (!isStage(stage)) return { ok: false, error: "階段不對" }; const { c, actor } = await editable(caseId); await Case.setChecklist(caseId, stage, k, done, actor); bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setDecisionAction(caseId: string, decision: "accept" | "revise" | "", reason = ""): Promise<R> {
  try { const { c, actor } = await editable(caseId); await Case.setDecision(caseId, decision, actor, reason); bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}
export async function pauseCaseAction(caseId: string, reason: string): Promise<R> {
  try { const { c, actor } = await editable(caseId); const r = await Case.pauseCase(caseId, actor, reason); if (!r.ok) return r; bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}
export async function resumeCaseAction(caseId: string, reason = ""): Promise<R> {
  try { const { c, actor } = await editable(caseId); const r = await Case.resumeCase(caseId, actor, reason); if (!r.ok) return r; bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}
export async function closeCaseAction(caseId: string, reason: string, note = ""): Promise<R> {
  try {
    const { c, actor } = await editable(caseId);
    const r = await Case.closeCase(caseId, actor, reason, note); if (!r.ok) return r;
    // 服務完成 → 7 天內發問卷：結案當下就發（客戶沒綁帳號就發不出去，案件頁會顯示）
    if (reason === "done") await sendFeedback(caseId).catch(() => null);
    bump(c.clientId); return { ok: true };
  } catch (e) { return fail(e); }
}
/** 教練手動發服務回饋問卷（例如一個追蹤週期結束）。 */
export async function sendFeedbackAction(caseId: string): Promise<R> {
  try {
    const { c } = await editable(caseId);
    const f = await sendFeedback(caseId);
    if (!f) return { ok: false, error: "客戶還沒有登入帳號，問卷發不出去；先用「專用登入連結」讓客戶綁定" };
    bump(c.clientId); return { ok: true };
  } catch (e) { return fail(e); }
}
export type FeedbackRow = { id: string; sentAt: string; submittedAt: string | null; avg: number | null; scores: number[]; comment: string; low: boolean; handledAt: string | null; handleNote: string };
export async function feedbackForCaseAction(caseId: string): Promise<FeedbackRow[]> {
  const me = await requireCoach().catch(() => null);
  if (!me) return [];
  const c = await Case.getCase(caseId);
  if (!c) return [];
  const all = await listActiveCoaches();
  const scope = caseScopeFor(me, all);
  if (!(scope.kind === "all" || scope.coachIds.includes(c.coachId))) return [];
  return (await listFeedbackForCase(caseId)).map((f) => ({ id: f.id, sentAt: f.sentAt.toISOString().slice(0, 10), submittedAt: f.submittedAt ? f.submittedAt.toISOString().slice(0, 10) : null, avg: f.avg, scores: f.scores, comment: f.comment, low: f.low, handledAt: f.handledAt ? f.handledAt.toISOString().slice(0, 10) : null, handleNote: f.handleNote }));
}
export async function handleFeedbackAction(feedbackId: string, caseId: string, note: string): Promise<R> {
  try {
    const me = await requireWritableCoach();
    const c = await Case.getCase(caseId);
    if (!c) return { ok: false, error: "找不到案件" };
    if (!(canEditCase(me, c) || canHandleFlags(me))) return { ok: false, error: "沒有權限" };
    await handleFeedback(feedbackId, me.id, note);
    await Case.setFlag(caseId, "lowscore", false, await actorOf(me), note);
    bump(c.clientId); return { ok: true };
  } catch (e) { return fail(e); }
}
export async function reopenCaseAction(caseId: string, reason: string): Promise<R> {
  try { const { c, actor } = await editable(caseId); const r = await Case.reopenCase(caseId, actor, reason); if (!r.ok) return r; bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}
/** 標記：waiting 主責教練；complaint／lowscore 主責或客戶關係；overdue 不給人改。 */
export async function setFlagAction(caseId: string, flag: string, on: boolean, note = ""): Promise<R> {
  try {
    const me = await requireWritableCoach();
    const c = await Case.getCase(caseId);
    if (!c) return { ok: false, error: "找不到案件" };
    if (flag === "overdue") return { ok: false, error: "逾期標記由系統判定" };
    if (!["waiting", "complaint", "lowscore"].includes(flag)) return { ok: false, error: "標記不對" };
    const allowed = canEditCase(me, c) || (flag !== "waiting" && canHandleFlags(me));
    if (!allowed) return { ok: false, error: "沒有權限" };
    const r = await Case.setFlag(caseId, flag as CaseFlag, on, await actorOf(me), note); if (!r.ok) return r;
    bump(c.clientId);
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function setS3Action(caseId: string, s3CoachId: string | null): Promise<R> {
  try { const { c, actor } = await editable(caseId); await Case.setS3(caseId, s3CoachId, actor); bump(c.clientId); return { ok: true }; } catch (e) { return fail(e); }
}

/** 案件總表（/dashboard/cases）：依身分給範圍。 */
export type CaseListRow = Omit<CaseViewRow, "stages" | "log" | "terms"> & { curDue: string | null };
export type CaseKpi = { onTime: number; late: number; byStage: Record<string, number>; avgDays: Record<string, number | null> };
export async function listCasesAction(): Promise<{ scope: string; rows: CaseListRow[]; kpi: CaseKpi }> {
  const me = await requireCoach();
  const all = await listActiveCoaches();
  const scope = caseScopeFor(me, all);
  const cases = scope.kind === "all" ? await Case.listAllCases() : await Case.listCasesForCoaches(scope.coachIds);
  const sums = await Case.summarize(cases);
  const rows: CaseListRow[] = sums.map((s) => {
    const v = shape({ case: s.case, stages: s.stages }, { clientName: s.clientName, coachName: s.coachName, s3Name: s.s3Name ?? (s3For(s.case, all) ? displayNameOf(s3For(s.case, all)!) : null), canEdit: canEditCase(me, s.case), canFlags: canHandleFlags(me), terms: [], log: [] });
    const cur = v.stages.find((x) => x.stage === v.stage);
    const { stages: _s, log: _l, terms: _t, ...rest } = v; void _s; void _l; void _t;
    return { ...rest, curDue: cur?.actualDate ?? cur?.promisedDate ?? cur?.expectedDate ?? null };
  });
  rows.sort((a, b) => (b.overdue - a.overdue) || ((a.daysToDue ?? 9999) - (b.daysToDue ?? 9999)));
  // KPI：準時率（已完成的階段，實際日 ≤ 承諾／預計日）、各階段分布、各階段平均天數
  const kpi: CaseKpi = { onTime: 0, late: 0, byStage: {}, avgDays: {} };
  const dur: Record<string, number[]> = {};
  for (const s of sums) {
    if (s.case.status !== "closed") kpi.byStage[s.case.stage] = (kpi.byStage[s.case.stage] ?? 0) + 1;
    for (const st of s.stages) {
      if (!st.actualDate) continue;
      const due = st.promisedDate ?? st.expectedDate;
      if (due) { if (st.actualDate <= due) kpi.onTime++; else kpi.late++; }
      if (st.startedOn) (dur[st.stage] ??= []).push(Math.max(0, (Date.parse(st.actualDate) - Date.parse(st.startedOn)) / 86400000));
    }
  }
  for (const [k, v] of Object.entries(dur)) kpi.avgDays[k] = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  return { scope: scope.kind === "all" ? scope.reason : scope.reason, rows, kpi };
}

// ── 通知 ─────────────────────────────────────────────────────────────────────
export async function myNotificationsAction(): Promise<Notification[]> {
  const me = await requireCoach().catch(() => null);
  if (!me) return [];
  return listNotifications("coach", me.id, 60);
}
export async function markNotificationsReadAction(ids: string[] | "all"): Promise<R> {
  try { const me = await requireCoach(); await markRead("coach", me.id, ids); revalidatePath("/dashboard"); return { ok: true }; } catch (e) { return fail(e); }
}
