// 服務案件（案件進度）的 DB 層。純邏輯在 caseEngine.ts。
// 地基語意：
//   · 一客戶一案件（service_cases.client_id 唯一）。續約＝同案件下一個年期（service_terms），不是新案。
//   · 階段推進只有兩條路：completeStage（教練按「本階段完成」或系統依完成訊號自動推）、revertStage（退回上一階段，要原因）。
//   · 每一筆變更都寫 service_case_log（誰、何時、改了什麼、原因）。客戶端不顯示 log。
//   · 「結案」只能 closeCase；合約簽完、收款確認都不會結案。
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, coaches, serviceCaseLog, serviceCaseStages, serviceCases, serviceStageParams } from "@/Shared/db/schema";
import {
  STAGES, type Stage, type StageParam, type CaseStatus, type CaseFlag, isStage, nextStage, prevStage, paramsFor, newStageRow, addDays, diffDays, normalizeFlags, stageIndex,
} from "./caseEngine";
import { todayISO } from "./license";

export type ServiceCase = typeof serviceCases.$inferSelect;
export type ServiceCaseStage = typeof serviceCaseStages.$inferSelect;
export type ServiceCaseLogRow = typeof serviceCaseLog.$inferSelect;
export type Actor = { type: "coach" | "client" | "admin" | "system"; id?: string | null; name?: string | null };
export const SYSTEM: Actor = { type: "system", id: null, name: "系統" };

export type CaseBundle = { case: ServiceCase; stages: ServiceCaseStage[] };

// ── 參數 ─────────────────────────────────────────────────────────────────────
export async function loadStageParams(): Promise<Partial<Record<Stage, Partial<StageParam>>>> {
  const rows = await db.select().from(serviceStageParams);
  const out: Partial<Record<Stage, Partial<StageParam>>> = {};
  for (const r of rows) if (isStage(r.stage)) out[r.stage] = { days: r.days, checklist: r.checklist };
  return out;
}
export async function saveStageParam(stage: Stage, days: number, checklist: { k: string; label: string }[]): Promise<void> {
  const clean = checklist.map((c) => ({ k: String(c.k || "").trim().slice(0, 40), label: String(c.label || "").trim().slice(0, 80) })).filter((c) => c.k && c.label);
  await db.insert(serviceStageParams).values({ stage, days: Math.max(1, Math.round(days)), checklist: clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: serviceStageParams.stage, set: { days: Math.max(1, Math.round(days)), checklist: clean, updatedAt: new Date() } });
}

// ── 讀 ───────────────────────────────────────────────────────────────────────
export async function getCase(id: string): Promise<ServiceCase | null> {
  const r = await db.select().from(serviceCases).where(eq(serviceCases.id, id)).limit(1);
  return r[0] ?? null;
}
export async function getCaseByClient(clientId: string): Promise<CaseBundle | null> {
  const [c] = await db.select().from(serviceCases).where(eq(serviceCases.clientId, clientId)).limit(1);
  if (!c) return null;
  return { case: c, stages: await stagesOf(c.id) };
}
export async function stagesOf(caseId: string): Promise<ServiceCaseStage[]> {
  const rows = await db.select().from(serviceCaseStages).where(eq(serviceCaseStages.caseId, caseId));
  return rows.sort((a, b) => stageIndex(a.stage as Stage) - stageIndex(b.stage as Stage));
}
export async function stagesForCases(ids: string[]): Promise<Record<string, ServiceCaseStage[]>> {
  if (!ids.length) return {};
  const rows = await db.select().from(serviceCaseStages).where(inArray(serviceCaseStages.caseId, ids));
  const out: Record<string, ServiceCaseStage[]> = {};
  for (const r of rows) (out[r.caseId] ??= []).push(r);
  for (const k of Object.keys(out)) out[k].sort((a, b) => stageIndex(a.stage as Stage) - stageIndex(b.stage as Stage));
  return out;
}
export async function listCasesForCoaches(coachIds: string[]): Promise<ServiceCase[]> {
  if (!coachIds.length) return [];
  return db.select().from(serviceCases).where(inArray(serviceCases.coachId, coachIds)).orderBy(desc(serviceCases.updatedAt));
}
export async function listAllCases(): Promise<ServiceCase[]> {
  return db.select().from(serviceCases).orderBy(desc(serviceCases.updatedAt));
}
export async function listLog(caseId: string, limit = 60): Promise<ServiceCaseLogRow[]> {
  return db.select().from(serviceCaseLog).where(eq(serviceCaseLog.caseId, caseId)).orderBy(desc(serviceCaseLog.createdAt)).limit(limit);
}
/** 最近一次「人」動過案件的日期（給逾期升級判定「仍無更新」）。 */
export async function lastHumanTouch(caseId: string): Promise<string | null> {
  const r = await db.select({ at: sql<string>`max(${serviceCaseLog.createdAt})` }).from(serviceCaseLog)
    .where(and(eq(serviceCaseLog.caseId, caseId), sql`${serviceCaseLog.actorType} <> 'system'`));
  const v = r[0]?.at;
  return v ? new Date(v).toISOString().slice(0, 10) : null;
}

async function log(caseId: string, actor: Actor, action: string, detail: Record<string, unknown> = {}, reason = "", stage: Stage | null = null): Promise<void> {
  await db.insert(serviceCaseLog).values({
    caseId, stage, actorType: actor.type, actorId: actor.id ?? null, actorName: (actor.name ?? "").slice(0, 80), action, detail, reason: reason.trim().slice(0, 400),
  });
}
async function touch(caseId: string, set: Partial<typeof serviceCases.$inferInsert> = {}): Promise<void> {
  await db.update(serviceCases).set({ ...set, updatedAt: new Date() }).where(eq(serviceCases.id, caseId));
}

// ── 建案 ─────────────────────────────────────────────────────────────────────
/** 冪等：這位客戶已有案件就回它。案號＝客戶編號（沒編號用 id 前 8 碼）。建案同時長第一階段列。 */
export async function ensureCase(clientId: string, coachId: string, actor: Actor, startedAt?: string): Promise<ServiceCase> {
  const had = await db.select().from(serviceCases).where(eq(serviceCases.clientId, clientId)).limit(1);
  if (had[0]) return had[0];
  const [cl] = await db.select({ code: clients.code }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const today = startedAt ?? todayISO();
  const caseNo = cl?.code ?? clientId.slice(0, 8);
  const params = await loadStageParams();
  try {
    const [row] = await db.insert(serviceCases).values({ clientId, coachId, caseNo, stage: "commission", status: "active", startedAt: today }).returning();
    const s = newStageRow("commission", today, paramsFor("commission", params));
    await db.insert(serviceCaseStages).values({ caseId: row.id, stage: s.stage, startedOn: s.startedOn, expectedDate: s.expectedDate, checklist: s.checklist });
    await log(row.id, actor, "case_created", { caseNo }, "", "commission");
    return row;
  } catch {
    const again = await db.select().from(serviceCases).where(eq(serviceCases.clientId, clientId)).limit(1);
    if (again[0]) return again[0];
    throw new Error("案件建立失敗");
  }
}

// ── 階段推進 ──────────────────────────────────────────────────────────────────
async function stageRow(caseId: string, stage: Stage): Promise<ServiceCaseStage | null> {
  const r = await db.select().from(serviceCaseStages).where(and(eq(serviceCaseStages.caseId, caseId), eq(serviceCaseStages.stage, stage))).limit(1);
  return r[0] ?? null;
}
async function ensureStageRow(caseId: string, stage: Stage, startedOn: string): Promise<ServiceCaseStage> {
  const had = await stageRow(caseId, stage);
  if (had) return had;
  const s = newStageRow(stage, startedOn, paramsFor(stage, await loadStageParams()));
  const [row] = await db.insert(serviceCaseStages).values({ caseId, stage, startedOn, expectedDate: s.expectedDate, checklist: s.checklist })
    .onConflictDoNothing().returning();
  return row ?? (await stageRow(caseId, stage))!;
}

export type StageResult = { ok: true; case: ServiceCase } | { ok: false; error: string };

/**
 * 本階段完成：實際日落地、案件推到下一階；下一階列長出來（起算＝今天）。
 * 階段 8（執行追蹤）沒有「下一階」：完成＝這一季追蹤做完，預計日往後推一個週期、清單重置，案件維持進行中。
 * 冪等：重複呼叫同一階段（已不是目前階段）直接回案件。
 */
export async function completeStage(caseId: string, stage: Stage, actor: Actor, opts: { date?: string; reason?: string; auto?: boolean } = {}): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (c.status === "closed") return { ok: false, error: "案件已結案" };
  if (c.stage !== stage) return { ok: true, case: c };
  const today = opts.date ?? todayISO();
  const cur = await ensureStageRow(caseId, stage, c.startedAt ?? today);
  const nxt = nextStage(stage);
  if (!nxt) {
    // 執行追蹤：一個週期完成
    const params = paramsFor("tracking", await loadStageParams());
    await db.update(serviceCaseStages).set({
      startedOn: today, expectedDate: addDays(today, params.days), promisedDate: null,
      checklist: cur.checklist.map((x) => ({ ...x, done: false, at: null })), updatedAt: new Date(),
    }).where(eq(serviceCaseStages.id, cur.id));
    await touch(caseId, { escalation: 0, escalatedAt: null, flags: normalizeFlags(c.flags).filter((f) => f !== "overdue") });
    await log(caseId, actor, "tracking_cycle_done", { on: today }, opts.reason ?? "", stage);
    return { ok: true, case: (await getCase(caseId))! };
  }
  await db.update(serviceCaseStages).set({ actualDate: today, checklist: cur.checklist.map((x) => ({ ...x, done: true, at: x.at ?? today })), updatedAt: new Date() }).where(eq(serviceCaseStages.id, cur.id));
  await ensureStageRow(caseId, nxt, today);
  await touch(caseId, { stage: nxt, escalation: 0, escalatedAt: null, flags: normalizeFlags(c.flags).filter((f) => f !== "overdue" && f !== "waiting"), waitingSince: null });
  await log(caseId, actor, opts.auto ? "stage_auto_done" : "stage_done", { from: stage, to: nxt, on: today }, opts.reason ?? "", stage);
  return { ok: true, case: (await getCase(caseId))! };
}

/** 退回上一階段（要原因）：上一階的實際日清掉、目前這一階的列保留但起算清空。 */
export async function revertStage(caseId: string, actor: Actor, reason: string): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (c.status === "closed") return { ok: false, error: "案件已結案" };
  if (!reason.trim()) return { ok: false, error: "退回上一階段要填原因" };
  const prev = prevStage(c.stage as Stage);
  if (!prev) return { ok: false, error: "已經是第一個階段" };
  const p = await stageRow(caseId, prev);
  if (p) await db.update(serviceCaseStages).set({ actualDate: null, updatedAt: new Date() }).where(eq(serviceCaseStages.id, p.id));
  const curRow = await stageRow(caseId, c.stage as Stage);
  if (curRow) await db.update(serviceCaseStages).set({ startedOn: null, expectedDate: null, promisedDate: null, updatedAt: new Date() }).where(eq(serviceCaseStages.id, curRow.id));
  await touch(caseId, { stage: prev, escalation: 0, escalatedAt: null });
  await log(caseId, actor, "stage_reverted", { from: c.stage, to: prev }, reason, prev);
  return { ok: true, case: (await getCase(caseId))! };
}

/** 承諾完成日：第一次設不用原因；改既有承諾一定要原因（提案書：承諾日變更須填原因）。 */
export async function setPromised(caseId: string, stage: Stage, date: string | null, actor: Actor, reason = ""): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "日期格式不對" };
  const row = await ensureStageRow(caseId, stage, c.startedAt ?? todayISO());
  if (row.promisedDate && row.promisedDate !== date && !reason.trim()) return { ok: false, error: "更改承諾日期要填原因" };
  await db.update(serviceCaseStages).set({ promisedDate: date, updatedAt: new Date() }).where(eq(serviceCaseStages.id, row.id));
  await touch(caseId);
  await log(caseId, actor, "promised_set", { stage, from: row.promisedDate, to: date }, reason, stage);
  return { ok: true, case: c };
}
export async function setStageNote(caseId: string, stage: Stage, note: string, actor: Actor): Promise<void> {
  const c = await getCase(caseId); if (!c) return;
  const row = await ensureStageRow(caseId, stage, c.startedAt ?? todayISO());
  await db.update(serviceCaseStages).set({ note: note.trim().slice(0, 400), updatedAt: new Date() }).where(eq(serviceCaseStages.id, row.id));
  await touch(caseId);
  await log(caseId, actor, "note_set", { stage }, "", stage);
}
export async function setChecklist(caseId: string, stage: Stage, k: string, done: boolean, actor: Actor): Promise<void> {
  const c = await getCase(caseId); if (!c) return;
  const row = await ensureStageRow(caseId, stage, c.startedAt ?? todayISO());
  const today = todayISO();
  const list = row.checklist.map((x) => (x.k === k ? { ...x, done, at: done ? today : null } : x));
  await db.update(serviceCaseStages).set({ checklist: list, updatedAt: new Date() }).where(eq(serviceCaseStages.id, row.id));
  await touch(caseId);
  await log(caseId, actor, done ? "check_done" : "check_undone", { stage, k }, "", stage);
}
/** 系統依完成訊號勾清單項（冪等，不寫 log 噪音：已勾就不動）。 */
export async function autoCheck(caseId: string, stage: Stage, k: string): Promise<boolean> {
  const row = await stageRow(caseId, stage);
  if (!row) return false;
  const item = row.checklist.find((x) => x.k === k);
  if (!item || item.done) return false;
  const today = todayISO();
  await db.update(serviceCaseStages).set({ checklist: row.checklist.map((x) => (x.k === k ? { ...x, done: true, at: today } : x)), updatedAt: new Date() }).where(eq(serviceCaseStages.id, row.id));
  await log(caseId, SYSTEM, "check_auto", { stage, k }, "", stage);
  return true;
}
export async function setDecision(caseId: string, decision: "accept" | "revise" | "", actor: Actor, reason = ""): Promise<void> {
  const c = await getCase(caseId); if (!c) return;
  const row = await ensureStageRow(caseId, "report", c.startedAt ?? todayISO());
  await db.update(serviceCaseStages).set({ decision, updatedAt: new Date() }).where(eq(serviceCaseStages.id, row.id));
  await touch(caseId);
  await log(caseId, actor, "decision_set", { decision }, reason, "report");
  if (decision) await autoCheck(caseId, "report", "decision");
}

// ── 狀態與標記 ────────────────────────────────────────────────────────────────
export async function pauseCase(caseId: string, actor: Actor, reason: string): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (c.status === "closed") return { ok: false, error: "案件已結案" };
  if (!reason.trim()) return { ok: false, error: "暫停要填原因" };
  await touch(caseId, { status: "paused", pausedAt: todayISO(), pauseReason: reason.trim().slice(0, 400) });
  await log(caseId, actor, "paused", {}, reason);
  return { ok: true, case: (await getCase(caseId))! };
}
export async function resumeCase(caseId: string, actor: Actor, reason = ""): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (c.status !== "paused") return { ok: true, case: c };
  const today = todayISO();
  // 暫停期間不計時：把暫停天數加進累計等待天數
  const paused = c.pausedAt ? Math.max(0, diffDays(c.pausedAt, today)) : 0;
  await touch(caseId, { status: "active", pausedAt: null, pauseReason: "", waitingDays: (c.waitingDays || 0) + paused, escalation: 0, escalatedAt: null });
  await log(caseId, actor, "resumed", { pausedDays: paused }, reason);
  return { ok: true, case: (await getCase(caseId))! };
}
export async function closeCase(caseId: string, actor: Actor, reason: string, note = ""): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (!reason.trim()) return { ok: false, error: "結案要選原因" };
  await touch(caseId, { status: "closed", closedAt: todayISO(), closeReason: reason.trim().slice(0, 40), closeNote: note.trim().slice(0, 400), flags: normalizeFlags(c.flags).filter((f) => f !== "overdue" && f !== "waiting"), waitingSince: null });
  await log(caseId, actor, "closed", { reason }, note);
  return { ok: true, case: (await getCase(caseId))! };
}
export async function reopenCase(caseId: string, actor: Actor, reason: string): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (c.status !== "closed") return { ok: true, case: c };
  if (!reason.trim()) return { ok: false, error: "重新開啟要填原因" };
  await touch(caseId, { status: "active", closedAt: null, closeReason: "", closeNote: "" });
  await log(caseId, actor, "reopened", {}, reason);
  return { ok: true, case: (await getCase(caseId))! };
}

/** 標記：waiting 開＝暫停計時起算；關＝把這一段等待天數加進累計。overdue 只給系統（cron）。 */
export async function setFlag(caseId: string, flag: CaseFlag, on: boolean, actor: Actor, note = ""): Promise<StageResult> {
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  const flags = new Set(normalizeFlags(c.flags));
  const today = todayISO();
  const set: Partial<typeof serviceCases.$inferInsert> = {};
  if (flag === "waiting") {
    if (on && !flags.has("waiting")) { set.waitingSince = today; set.waitingNote = note.trim().slice(0, 200); flags.delete("overdue"); set.escalation = 0; set.escalatedAt = null; }
    if (!on && flags.has("waiting")) { set.waitingDays = (c.waitingDays || 0) + (c.waitingSince ? Math.max(0, diffDays(c.waitingSince, today)) : 0); set.waitingSince = null; set.waitingNote = ""; }
  }
  if (on) flags.add(flag); else flags.delete(flag);
  await touch(caseId, { ...set, flags: [...flags] });
  await log(caseId, actor, on ? "flag_on" : "flag_off", { flag }, note);
  return { ok: true, case: (await getCase(caseId))! };
}
export async function setS3(caseId: string, s3CoachId: string | null, actor: Actor): Promise<void> {
  await touch(caseId, { s3CoachId });
  await log(caseId, actor, "s3_set", { s3CoachId });
}
export async function setCaseCoach(caseId: string, coachId: string, actor: Actor, reason = ""): Promise<void> {
  const c = await getCase(caseId); if (!c) return;
  await touch(caseId, { coachId });
  await log(caseId, actor, "coach_set", { from: c.coachId, to: coachId }, reason);
}
/** cron 用：寫逾期標記與升級步驟（系統身分）。 */
export async function markOverdue(caseId: string, step: number, flags: string[]): Promise<void> {
  const c = await getCase(caseId); if (!c) return;
  const today = todayISO();
  const next = new Set(normalizeFlags(flags));
  if (step > 0) next.add("overdue"); else next.delete("overdue");
  const changedStep = step !== c.escalation;
  await db.update(serviceCases).set({ flags: [...next], escalation: step, escalatedAt: changedStep ? (step > 0 ? today : null) : c.escalatedAt }).where(eq(serviceCases.id, caseId));
  if (changedStep) await log(caseId, SYSTEM, "escalation", { from: c.escalation, to: step });
}

// ── 給頁面的彙總 ──────────────────────────────────────────────────────────────
export type CaseSummary = {
  case: ServiceCase; stages: ServiceCaseStage[];
  clientName: string; clientCode: string | null; coachName: string; s3Name: string | null;
};
export async function summarize(cases: ServiceCase[]): Promise<CaseSummary[]> {
  if (!cases.length) return [];
  const [stages, cls, cos] = await Promise.all([
    stagesForCases(cases.map((c) => c.id)),
    db.select({ id: clients.id, name: clients.name, code: clients.code }).from(clients).where(inArray(clients.id, cases.map((c) => c.clientId))),
    db.select({ id: coaches.id, name: sql<string | null>`coalesce(nullif(${coaches.displayName}, ''), ${coaches.name})` }).from(coaches),
  ]);
  const cm = new Map(cls.map((c) => [c.id, c]));
  const nm = new Map(cos.map((c) => [c.id, c.name ?? ""]));
  return cases.map((c) => ({
    case: c, stages: stages[c.id] ?? [],
    clientName: cm.get(c.clientId)?.name ?? "", clientCode: cm.get(c.clientId)?.code ?? null,
    coachName: nm.get(c.coachId) ?? "", s3Name: c.s3CoachId ? nm.get(c.s3CoachId) ?? null : null,
  }));
}

export { STAGES, type CaseStatus };
