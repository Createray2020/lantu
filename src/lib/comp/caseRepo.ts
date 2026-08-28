// 業務制度 波2/波3：案件、分潤、批次、訓練、職級異動的資料層。
//
// 分潤計算的唯一入口是 computePayouts()：解析有效輔導鏈 → 丟進引擎 → 產出明細列。
// 後台試算器與這裡用的是同一支 splitCase，所以「試算看到的」與「真的發下去的」必然一致。

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import {
  coaches, compBatches, compCases, compMaintenance, compPayouts, compRankEvents,
  compTrainingRecords, compTrainingSessions,
} from "@/Shared/db/schema";
import { resolveChain, type AdvisorRow } from "./chain";
import { splitForModule, type PayoutLine } from "./engine";
import { loadParams, ensureActiveVersion } from "./repo";
import type { CompParams } from "./types";
import type { CaseRow } from "./stats";

export type CoachRow = typeof coaches.$inferSelect;
export type CaseRecord = typeof compCases.$inferSelect;
export type PayoutRecord = typeof compPayouts.$inferSelect;
export type BatchRecord = typeof compBatches.$inferSelect;

export async function listAdvisors(): Promise<CoachRow[]> {
  return db.select().from(coaches).orderBy(coaches.createdAt);
}

export function toAdvisorRows(rows: CoachRow[]): AdvisorRow[] {
  return rows.map((c) => ({
    id: c.id, name: c.name || c.email || c.id,
    rankCode: c.rankCode, uplineId: c.uplineId, sponsorId: c.sponsorId, status: c.status,
  }));
}

export function toCaseRows(rows: CaseRecord[]): CaseRow[] {
  return rows.map((c) => ({
    id: c.id, executorId: c.executorId, promoterId: c.promoterId, moduleCode: c.moduleCode,
    clientId: c.clientId, clientName: c.clientName, fee: c.fee,
    refundAmount: c.refundAmount, caseYear: c.caseYear,
    paidAt: c.paidAt, surveyAt: c.surveyAt, status: c.status,
  }));
}

export async function listCases(filter?: { status?: string; executorId?: string }): Promise<CaseRecord[]> {
  const where = [];
  if (filter?.status) where.push(eq(compCases.status, filter.status));
  if (filter?.executorId) where.push(eq(compCases.executorId, filter.executorId));
  const q = db.select().from(compCases).orderBy(desc(compCases.createdAt));
  return where.length ? q.where(and(...where)) : q;
}

/** 某個制度版本底下，還沒發放分潤的案件數（發布新版前的影響評估）。 */
export async function countUnpaidCases(versionId: string): Promise<number> {
  const rows = await db.select({ id: compCases.id }).from(compCases)
    .where(and(
      eq(compCases.versionId, versionId),
      inArray(compCases.status, ["open", "closed"]),
    ));
  return rows.length;
}

export async function getCase(id: string): Promise<CaseRecord | null> {
  const r = await db.select().from(compCases).where(eq(compCases.id, id)).limit(1);
  return r[0] ?? null;
}

export async function listPayouts(caseId: string): Promise<PayoutRecord[]> {
  return db.select().from(compPayouts)
    .where(and(eq(compPayouts.caseId, caseId), sql`${compPayouts.status} <> 'void'`));
}

export async function listPayoutsFor(payeeId: string): Promise<PayoutRecord[]> {
  return db.select().from(compPayouts)
    .where(and(eq(compPayouts.payeeId, payeeId), sql`${compPayouts.status} <> 'void'`))
    .orderBy(desc(compPayouts.createdAt));
}

/**
 * 計算一筆案件的分潤明細（不寫 DB）。
 * 推廣端與執案端各自解析自己的輔導鏈（附錄 B：兩人分屬不同鏈時各走各的）。
 */
export function computePayouts(
  c: Pick<CaseRecord, "fee" | "isCompanyLead" | "promoterId" | "executorId" | "refundAmount">
    & { moduleCode?: string | null },
  advisors: AdvisorRow[],
  params: CompParams,
): { lines: PayoutLine[]; balanced: boolean; warnings: string[]; skipped: string[] } {
  const execR = resolveChain(c.executorId, advisors, params);
  if (!execR) return { lines: [], balanced: false, warnings: ["找不到執案顧問"], skipped: [] };
  const promoR = c.promoterId ? resolveChain(c.promoterId, advisors, params) : null;

  // 分潤基準＝實收金額（部分退費按實收比例重算，§23-2）。
  const net = Math.max(0, (c.fee ?? 0) - (c.refundAmount ?? 0));

  const res = splitForModule(
    {
      fee: net,
      isCompanyLead: c.isCompanyLead,
      promoter: promoR?.self ?? null,
      promoterChain: promoR?.chain ?? [],
      executor: execR.self,
      executorChain: execR.chain,
    },
    params,
    c.moduleCode,
  );
  const skipped = [...(execR.skipped ?? []), ...(promoR?.skipped ?? [])]
    .map((x) => `${x.name}（${x.rankCode}）：${x.reason}`);
  return { lines: res.lines, balanced: res.balanced, warnings: res.warnings, skipped };
}

/**
 * 把算好的明細寫進 DB：舊列先標 void，再寫新列。
 * 不做原地 update —— 分潤是要對帳的東西，改過什麼必須看得出來。
 * （neon-http 沒有互動式交易；萬一 void 成功而 insert 失敗，重按一次「重算分潤」即可補上。）
 */
function payoutValues(caseId: string, l: PayoutLine) {
  return {
    caseId,
    payeeId: l.payeeId,
    payeeKey: l.payeeId ?? l.kind,
    payeeName: l.name,
    kind: l.kind,
    role: l.role,
    rankCode: l.rankCode,
    promoPct: l.promoPct, execPct: l.execPct, bonusPct: l.bonusPct, totalPct: l.totalPct,
    amount: l.amount,
    status: "pending",
    trace: l.trace,
  };
}

export async function writePayouts(caseId: string, lines: PayoutLine[]) {
  await db.update(compPayouts).set({ status: "void" })
    .where(and(
      eq(compPayouts.caseId, caseId),
      inArray(compPayouts.status, ["pending", "batched"]),
    ));
  if (!lines.length) return;
  await db.insert(compPayouts).values(lines.map((l) => payoutValues(caseId, l)));
}

export type CaseInput = {
  clientId?: string | null;
  clientName: string;
  serviceType?: string;
  moduleCode?: string | null;
  fee: number;
  isCompanyLead?: boolean;
  promoterId?: string | null;
  executorId: string;
  signedAt?: string | null;
  paidAt?: string | null;
  surveyAt?: string | null;
  caseYear?: number;
  note?: string | null;
};

function yearOf(input: CaseInput): number {
  const d = input.signedAt || input.paidAt;
  return input.caseYear ?? (d ? Number(d.slice(0, 4)) : new Date().getUTCFullYear());
}

/** 純資料整形，不碰 DB。createCase 與 createCasesBatch 共用同一份規則。 */
function caseValues(versionId: string, input: CaseInput) {
  return {
    versionId,
    clientId: input.clientId || null,
    clientName: input.clientName,
    serviceType: input.serviceType || "full",
    moduleCode: input.moduleCode || "",
    fee: input.fee,
    isCompanyLead: !!input.isCompanyLead,
    promoterId: input.isCompanyLead ? null : (input.promoterId || null),
    executorId: input.executorId,
    signedAt: input.signedAt || null,
    paidAt: input.paidAt || null,
    surveyAt: input.surveyAt || null,
    caseYear: yearOf(input),
    status: input.surveyAt ? "closed" : "open",
    note: input.note || null,
  };
}

export async function createCase(input: CaseInput): Promise<CaseRecord> {
  const version = await ensureActiveVersion();
  const rows = await db.insert(compCases).values(caseValues(version.id, input)).returning();
  const created = rows[0];
  await recalcCase(created.id);
  return created;
}

/**
 * CSV 批次匯入專用：一次進 N 筆案件。
 *
 * 逐筆呼叫 createCase() 的成本不是「多幾次往返」而已 —— 它每一筆都走 recalcCase()，
 * 而 recalcCase() 每一次都重新 loadParams()（整個制度版本的職級表、門檻表、模塊表）
 * 加上 listAdvisors()（全教練名冊）。50 列的 CSV 就是 50 次完整參數載入、
 * 50 次全表名冊查詢，全部拿到的還是同一份資料。
 *
 * 這裡把兩件事拆開：
 *   1. 全部案件**一句** insert（單一語句本身就是原子的：要嘛整批進、要嘛一列都沒有）。
 *   2. 參數與名冊**只載一次**，再逐筆算 payouts。
 *
 * ⚠️ 去重（同一份 CSV 重傳兩次會變成兩批案件）**沒有**在這裡解決：那需要一組
 * 牽涉產品判斷的唯一鍵，不是資料層自己決定得了的。這一支只處理效能與參數載入。
 */
export async function createCasesBatch(inputs: CaseInput[]): Promise<CaseRecord[]> {
  if (!inputs.length) return [];
  const version = await ensureActiveVersion();
  const created = await db
    .insert(compCases)
    .values(inputs.map((i) => caseValues(version.id, i)))
    .returning();

  const params = await loadParams(version.id);
  const advisors = toAdvisorRows(await listAdvisors());
  // 剛建立的案件不可能有舊的 payouts，所以跳過 writePayouts() 的「先標 void」那一句，
  // 並且把整批明細併成一句 insert。
  const values = created.flatMap((c) =>
    computePayouts(c, advisors, params).lines.map((l) => payoutValues(c.id, l)),
  );
  if (values.length) await db.insert(compPayouts).values(values);
  return created;
}

export async function updateCase(id: string, patch: Partial<CaseInput> & { status?: string }) {
  const cur = await getCase(id);
  if (!cur) throw new Error("case-not-found");
  const next = {
    clientId: patch.clientId !== undefined ? (patch.clientId || null) : cur.clientId,
    clientName: patch.clientName ?? cur.clientName,
    serviceType: patch.serviceType ?? cur.serviceType,
    moduleCode: patch.moduleCode !== undefined ? (patch.moduleCode || "") : cur.moduleCode,
    fee: patch.fee ?? cur.fee,
    isCompanyLead: patch.isCompanyLead ?? cur.isCompanyLead,
    promoterId: patch.promoterId !== undefined ? (patch.promoterId || null) : cur.promoterId,
    executorId: patch.executorId ?? cur.executorId,
    signedAt: patch.signedAt !== undefined ? (patch.signedAt || null) : cur.signedAt,
    paidAt: patch.paidAt !== undefined ? (patch.paidAt || null) : cur.paidAt,
    surveyAt: patch.surveyAt !== undefined ? (patch.surveyAt || null) : cur.surveyAt,
    caseYear: patch.caseYear ?? cur.caseYear,
    note: patch.note !== undefined ? (patch.note || null) : cur.note,
    updatedAt: new Date(),
  };
  const status =
    patch.status ??
    (cur.status === "refunded" || cur.status === "paid" ? cur.status : next.surveyAt ? "closed" : "open");
  if (next.isCompanyLead) next.promoterId = null;
  await db.update(compCases).set({ ...next, status }).where(eq(compCases.id, id));
  await recalcCase(id);
}

/** 重算分潤。已發放（paid）的列不動——發出去的錢不會因為改制度而改變（§31）。 */
export async function recalcCase(id: string) {
  const c = await getCase(id);
  if (!c) throw new Error("case-not-found");
  const params = await loadParams(c.versionId);
  const advisors = toAdvisorRows(await listAdvisors());
  const { lines } = computePayouts(c, advisors, params);
  await writePayouts(id, lines);
}

/** 退費／解約（§23）。金額寫回案件並依實收重算；全額退費時整筆不計晉升指標。 */
export async function refundCase(id: string, refundAmount: number) {
  const c = await getCase(id);
  if (!c) throw new Error("case-not-found");
  const amount = Math.max(0, Math.min(refundAmount, c.fee));
  const full = amount >= c.fee;
  await db.update(compCases)
    .set({ refundAmount: amount, status: full ? "refunded" : c.status, updatedAt: new Date() })
    .where(eq(compCases.id, id));
  await recalcCase(id);
}

// ── 發放批次（§22） ─────────────────────────────────────────────────────────

export async function listBatches(): Promise<BatchRecord[]> {
  return db.select().from(compBatches).orderBy(desc(compBatches.period));
}

/**
 * 產生某個月份的發放批次：把「已實收、尚未入批」的 pending 分潤收進來。
 * 未實收的案件不進批（§22-1）。
 */
export async function createBatch(period: string, payoutDate: string | null) {
  const existing = await db.select().from(compBatches).where(eq(compBatches.period, period)).limit(1);
  const batch = existing[0]
    ?? (await db.insert(compBatches).values({ period, payoutDate }).returning())[0];
  if (batch.status === "paid") throw new Error("batch-paid");

  const rows = await db
    .select({ id: compPayouts.id, amount: compPayouts.amount })
    .from(compPayouts)
    .innerJoin(compCases, eq(compPayouts.caseId, compCases.id))
    .where(and(
      eq(compPayouts.status, "pending"),
      isNull(compPayouts.batchId),
      sql`${compCases.paidAt} is not null`,
      sql`${compCases.status} <> 'refunded'`,
    ));

  if (rows.length) {
    await db.update(compPayouts)
      .set({ batchId: batch.id, status: "batched" })
      .where(inArray(compPayouts.id, rows.map((r) => r.id)));
  }
  const total = rows.reduce((a, r) => a + r.amount, 0);
  await db.update(compBatches)
    .set({ totalAmount: total, payoutDate: payoutDate ?? batch.payoutDate })
    .where(eq(compBatches.id, batch.id));
  return { batchId: batch.id, count: rows.length, total };
}

export async function markBatchPaid(batchId: string, operatorId: string) {
  await db.update(compPayouts).set({ status: "paid" })
    .where(and(eq(compPayouts.batchId, batchId), eq(compPayouts.status, "batched")));
  await db.update(compBatches).set({ status: "paid", approvedBy: operatorId })
    .where(eq(compBatches.id, batchId));
  // 案件狀態跟著推進（分潤已發放）。
  await db.execute(sql`
    update comp_cases set status = 'paid'
    where status in ('open','closed')
      and id in (select case_id from comp_payouts where batch_id = ${batchId})
  `);
}

// ── 訓練（§16-2） ───────────────────────────────────────────────────────────

export async function listTrainingSessions() {
  return db.select().from(compTrainingSessions).orderBy(desc(compTrainingSessions.heldOn));
}

export async function listTrainingRecords(year?: number) {
  const q = db.select().from(compTrainingRecords).orderBy(desc(compTrainingRecords.createdAt));
  return year === undefined ? q : q.where(eq(compTrainingRecords.year, year));
}

export async function createTrainingSession(input: {
  heldOn: string; topic: string; mode?: string; hours?: number | null; speakerId?: string | null; note?: string | null;
}) {
  const rows = await db.insert(compTrainingSessions).values({
    heldOn: input.heldOn, topic: input.topic, mode: input.mode || "onsite",
    hours: input.hours ?? null, speakerId: input.speakerId || null, note: input.note || null,
  }).returning();
  return rows[0];
}

/**
 * 點名：把出席者寫成訓練紀錄。
 * 講師那一筆的時數套用制度的「講師倍率」，其餘套「每場認列」。
 * onConflictDoUpdate 讓重複點名成為更新而不是加倍（唯一鍵在 session+coach+kind）。
 */
export async function markAttendance(sessionId: string, coachIds: string[], params: CompParams) {
  const s = params.settings;
  const sess = (await db.select().from(compTrainingSessions)
    .where(eq(compTrainingSessions.id, sessionId)).limit(1))[0];
  if (!sess) throw new Error("session-not-found");

  const base = sess.hours ?? s.trainPerSession ?? 0;
  const mult = s.trainSpeakerMultiplier ?? 1;
  const year = Number(sess.heldOn.slice(0, 4));

  const values = coachIds.map((id) => ({
    coachId: id, sessionId, year,
    kind: id === sess.speakerId ? "speaker" : "internal",
    hours: id === sess.speakerId ? base * mult : base,
    title: sess.topic,
    status: "approved",
  }));
  if (sess.speakerId && !coachIds.includes(sess.speakerId)) {
    values.push({
      coachId: sess.speakerId, sessionId, year, kind: "speaker",
      hours: base * mult, title: sess.topic, status: "approved",
    });
  }
  if (!values.length) return;
  await db.insert(compTrainingRecords).values(values).onConflictDoUpdate({
    target: [compTrainingRecords.sessionId, compTrainingRecords.coachId, compTrainingRecords.kind],
    set: { hours: sql`excluded.hours`, title: sql`excluded.title`, status: sql`excluded.status` },
  });
}

export async function addExternalTraining(input: {
  coachId: string; year: number; hours: number; title: string; evidence?: string | null; approved?: boolean;
}) {
  await db.insert(compTrainingRecords).values({
    coachId: input.coachId, sessionId: null, year: input.year, kind: "external",
    hours: input.hours, title: input.title, evidence: input.evidence || null,
    status: input.approved ? "approved" : "pending",
  });
}

export async function setTrainingStatus(id: string, status: "approved" | "rejected") {
  await db.update(compTrainingRecords).set({ status }).where(eq(compTrainingRecords.id, id));
}

// ── 職級異動與維持資格快照 ──────────────────────────────────────────────────

export async function listRankEvents(coachId?: string) {
  const q = db.select().from(compRankEvents).orderBy(desc(compRankEvents.createdAt));
  return coachId ? q.where(eq(compRankEvents.coachId, coachId)) : q;
}

export async function setAdvisorRank(
  coachId: string,
  toCode: string | null,
  reason: string,
  operatorId: string,
  note?: string,
) {
  const cur = (await db.select().from(coaches).where(eq(coaches.id, coachId)).limit(1))[0];
  if (!cur) throw new Error("coach-not-found");
  if (cur.rankCode === toCode) return;
  // ⚠️ 職級與異動紀錄必須一起成立。分開兩趟往返時，第二句失敗就留下一位
  // 「職級變了但時間軸上查不到為什麼」的顧問——而職級決定分潤率，這是財務紀錄。
  // neon-http 沒有互動式交易，db.batch() 是這裡唯一的原子寫法。
  await db.batch([
    db.update(coaches).set({ rankCode: toCode }).where(eq(coaches.id, coachId)),
    db.insert(compRankEvents).values({
      coachId, fromCode: cur.rankCode, toCode, reason,
      effectiveAt: new Date().toISOString().slice(0, 10),
      operatorId, note: note || null,
    }),
  ]);
}

export async function saveMaintenance(rows: {
  coachId: string; year: number; execCases: number; trainHours: number;
  execPass: boolean; trainPass: boolean; exempt: boolean; exemptReason?: string | null;
}[]) {
  if (!rows.length) return;
  await db.insert(compMaintenance).values(
    rows.map((r) => ({ ...r, exemptReason: r.exemptReason ?? null, evaluatedAt: new Date() })),
  ).onConflictDoUpdate({
    target: [compMaintenance.coachId, compMaintenance.year],
    set: {
      execCases: sql`excluded.exec_cases`,
      trainHours: sql`excluded.train_hours`,
      execPass: sql`excluded.exec_pass`,
      trainPass: sql`excluded.train_pass`,
      exempt: sql`excluded.exempt`,
      exemptReason: sql`excluded.exempt_reason`,
      evaluatedAt: sql`excluded.evaluated_at`,
    },
  });
}

export async function listMaintenance(year: number) {
  return db.select().from(compMaintenance).where(eq(compMaintenance.year, year));
}
