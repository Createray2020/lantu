// 培訓報名案件（2026/10/28 電子簽署的第一個消費者）。
//
// 一條線：送出報聘 → 建案（應收＝培訓方案價格）→ 申請人提報付款 → 公司確認收款
//        → 後台「審核通過並啟動簽署」（審核閘＋收款門檻）→ 申請人逐份簽 → 全部必簽完成 → 正式開通。
//
// 三組狀態分開記、各自可追溯：
//   · 資格審核：coach_applications（檢核表、推薦人確認）＋這裡的 review_stage
//   · 收款：acct_receipts(case_type='training', case_id=案件 id)，verified 由帳務後台改
//   · 文件：doc_instances(case_type='training')
// 開通條件在 tryActivateEnrollment 一處檢查，而且冪等：重送、重複回報、按兩次都不會再開通或重設期限。
import { and, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches, coachApplications, coachDisplayName, trainingEnrollments } from "@/Shared/db/schema";
import { getApplySettings, checkApprovalGate, activateCoach } from "./coachApplyStore";
import { getAcctState, createCaseReceipt, receiptsForCase, verifyAcctReceipt, type CaseFeeInput } from "./acctStore";
import { caseFunding, referralChain, type Receipt } from "./acctEngine";
import { startSigning, listInstancesForCase, withSigners, caseProgress, getSet, latestEnabledTemplate, isUniqueViolation, getSignerProfile, profileVars, profileMissing, type InstanceWithSigners, type SignerProfile, type DocTemplate } from "./docsStore";
import type { DocSignerSlot } from "./docs";
import { getBrand } from "./brand";
import { E_SIGN_CLAUSE, type DocVars } from "./docs";
import { varDef, varsInHtml } from "./docsVars";
import { PAYMENT_METHODS } from "./acctEngine";
import { todayISO } from "./license";
import { fmtMoney0 as fmtInt } from "./money";

/** 行政確認欄（後台填）：身分、報名前說明方式、補簽原報名日。 */
export type MemberKind = "intern" | "partner" | "hired";
export const MEMBER_KIND_LABEL: Record<MemberKind, string> = { intern: "實習教練", partner: "合作教練", hired: "報聘教練" };
export type BriefKind = "meeting" | "public";
export type EnrollmentAdminInput = { memberKind: MemberKind; briefKind: BriefKind | null; briefDate: string | null; briefVersion: string; resignDate: string | null };

export type Enrollment = typeof trainingEnrollments.$inferSelect;
export type ReviewStage = "pending" | "passed" | "activated" | "rejected" | "cancelled";

// ── 建案與查詢 ───────────────────────────────────────────────────────────────
/**
 * 送出報聘時建案。後台沒設培訓方案（trainingItemId=null）→ 不建、回 null（舊流程：審核通過即開通）。
 * 同一位申請人已有未取消的案就沿用（重送申請不會再開一案）。
 */
export async function ensureEnrollment(coachId: string): Promise<Enrollment | null> {
  const settings = await getApplySettings();
  if (!settings.trainingItemId) return null;
  const existing = await getEnrollmentForCoach(coachId);
  if (existing) return existing;
  const S = await getAcctState();
  const item = S.items.find((i) => i.id === settings.trainingItemId);
  if (!item) return null; // 設定指到已刪掉的項目：不擋申請
  try {
    const [row] = await db
      .insert(trainingEnrollments)
      .values({ coachId, itemId: item.id, itemName: item.name, amountDue: item.price || 0, reviewStage: "pending" })
      .returning();
    return row;
  } catch (e) {
    // 同時送了兩次：部分唯一索引擋下第二筆，沿用第一筆
    if (isUniqueViolation(e)) return getEnrollmentForCoach(coachId);
    throw e;
  }
}

export async function getEnrollmentForCoach(coachId: string, opts: { includeRejected?: boolean } = {}): Promise<Enrollment | null> {
  const rows = await db
    .select()
    .from(trainingEnrollments)
    .where(and(eq(trainingEnrollments.coachId, coachId), notInArray(trainingEnrollments.reviewStage, opts.includeRejected ? ["cancelled"] : ["cancelled", "rejected"])))
    .orderBy(desc(trainingEnrollments.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** 退回之後公司要重新受理：把最近一案從 rejected 拉回 pending（歷程保留），後台按鈕用。 */
export async function reopenEnrollment(coachId: string): Promise<{ ok: boolean; error?: string }> {
  const live = await getEnrollmentForCoach(coachId);
  if (live) return { ok: true };
  const rows = await db
    .select()
    .from(trainingEnrollments)
    .where(and(eq(trainingEnrollments.coachId, coachId), eq(trainingEnrollments.reviewStage, "rejected")))
    .orderBy(desc(trainingEnrollments.createdAt))
    .limit(1);
  if (!rows[0]) return { ok: false, error: "沒有退回的案件" };
  await db.update(trainingEnrollments).set({ reviewStage: "pending", updatedAt: new Date() }).where(eq(trainingEnrollments.id, rows[0].id));
  return { ok: true };
}

export async function getEnrollment(id: string): Promise<Enrollment | null> {
  const rows = await db.select().from(trainingEnrollments).where(eq(trainingEnrollments.id, id)).limit(1);
  return rows[0] ?? null;
}

/** 一位申請人的完整狀態：案件＋收款＋文件（後台 ReviewPanel 與申請人進度頁共用）。 */
export type EnrollmentView = {
  enrollment: Enrollment;
  receipts: Receipt[];
  funding: ReturnType<typeof caseFunding>;
  docs: InstanceWithSigners[];
  progress: ReturnType<typeof caseProgress>;
};

export async function enrollmentView(enr: Enrollment): Promise<EnrollmentView> {
  const [receipts, instances] = await Promise.all([receiptsForCase("training", enr.id), listInstancesForCase("training", enr.id)]);
  const live = instances.filter((i) => i.status !== "void");
  const docs = await withSigners(live);
  return { enrollment: enr, receipts, funding: caseFunding(receipts, enr.amountDue), docs, progress: caseProgress(live) };
}

/** 後台名冊用：多位申請人的案件一次撈。 */
export async function enrollmentsFor(coachIds: string[]): Promise<Record<string, Enrollment>> {
  if (!coachIds.length) return {};
  const rows = await db
    .select()
    .from(trainingEnrollments)
    .where(and(inArray(trainingEnrollments.coachId, coachIds), ne(trainingEnrollments.reviewStage, "cancelled")))
    .orderBy(desc(trainingEnrollments.createdAt));
  const out: Record<string, Enrollment> = {};
  for (const r of rows) if (!out[r.coachId]) out[r.coachId] = r;
  return out;
}

// ── 收款 ─────────────────────────────────────────────────────────────────────
/**
 * 申請人提報付款：寫一筆 verified=false 的培訓費收款，等帳務後台確認。
 * 推薦端沿申請時填的推薦人輔導鏈（課程推薦率，V7.2 §14）；沒推薦人就空。
 */
export async function reportTrainingPayment(coachId: string, input: CaseFeeInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return recordTrainingReceipt(coachId, input, { verified: false, enteredBy: coachId });
}

/**
 * 後台代記培訓費（LT01，2026/10/29）：申請人沒自己按「我已付款」（例如之前就匯過款、資料在備註裡），
 * 後台核對過銀行明細後直接記一筆「已確認」的收款——之前只能等申請人提報，後台沒有任何「確認入帳」可按。
 */
export async function recordTrainingPaymentByAdmin(coachId: string, input: CaseFeeInput, adminId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return recordTrainingReceipt(coachId, input, { verified: true, enteredBy: adminId });
}

async function recordTrainingReceipt(coachId: string, input: CaseFeeInput, opts: { verified: boolean; enteredBy: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const enr = await getEnrollmentForCoach(coachId);
  if (!enr) return { ok: false, error: "沒有培訓報名案件" };
  if (enr.reviewStage === "activated" || enr.reviewStage === "rejected") return { ok: false, error: "這個案件已經結案" };
  const [S, appRows] = await Promise.all([getAcctState(), db.select({ introducerId: coachApplications.introducerId }).from(coachApplications).where(eq(coachApplications.coachId, coachId)).limit(1)]);
  const intro = appRows[0]?.introducerId ?? null;
  const sharers = intro ? referralChain(intro, S.coachList ?? []) : [];
  try {
    const id = await createCaseReceipt("training", enr.id, enr.itemId, input, { verified: opts.verified, enteredBy: opts.enteredBy, sharers });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === "invalid-amount" ? "請填正確的金額與日期" : opts.verified ? "記帳失敗" : "提報失敗" };
  }
}

/** 後台在審核列直接「確認入帳」申請人提報的那一筆（只認這位申請人自己案件的收款）。 */
export async function verifyTrainingReceipt(coachId: string, receiptId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const enr = await getEnrollmentForCoach(coachId);
  if (!enr) return { ok: false, error: "沒有培訓報名案件" };
  const rs = await receiptsForCase("training", enr.id);
  if (!rs.some((r) => r.id === receiptId && !r.void)) return { ok: false, error: "找不到這筆收款" };
  await verifyAcctReceipt(receiptId, true);
  return { ok: true };
}

/** 這個培訓方案的範本組合裡有沒有啟用中的範本。 */
export async function setHasTemplates(itemId: string): Promise<boolean> {
  const keys = await getSet("training_item", itemId);
  for (const k of keys) if (await latestEnabledTemplate(k)) return true;
  return false;
}

/** 這個培訓方案的範本組合裡有沒有「公司」簽名位（有＝後台核准時要選公司代表）。 */
export async function setNeedsCompanySigner(itemId: string): Promise<boolean> {
  const keys = await getSet("training_item", itemId);
  for (const k of keys) {
    const t = await latestEnabledTemplate(k);
    if ((t?.signers as DocSignerSlot[] | undefined)?.some((x) => x.role === "company")) return true;
  }
  return false;
}

// ── 審核通過 → 啟動簽署 ─────────────────────────────────────────────────────
export type PassResult =
  | { ok: true; activated: boolean; docs: number; noTemplates: boolean }
  | { ok: false; error: string };

/**
 * 後台「審核通過並啟動簽署」。
 * 閘：審核閘（推薦人確認＋檢核表）＋收款門檻（一期＝全額確認）。
 * 過了：案件→passed、依培訓方案的範本組合產文件；沒有範本就直接開通（等同舊流程）。
 * 冪等：已 passed 再按＝回既有簽署進度；已 activated 再按＝回 activated。
 */
export async function passReview(coachId: string, reviewerId: string, companySignerId: string | null = reviewerId): Promise<PassResult> {
  const gate = await checkApprovalGate(coachId);
  if (!gate.ok) return gate;
  const enr = await getEnrollmentForCoach(coachId);
  if (!enr) {
    // 沒有培訓案件（後台沒設培訓方案）：舊流程，審核通過即開通。
    const r = await activateCoach(coachId, reviewerId);
    return r.ok ? { ok: true, activated: true, docs: 0, noTemplates: true } : r;
  }
  if (enr.reviewStage === "activated") {
    // 案件早就開通過（例如停權後「重設待審」再核准）：不重跑收款與文件，直接把帳號開回來（activateCoach 冪等）。
    const r = await activateCoach(coachId, reviewerId);
    return r.ok ? { ok: true, activated: true, docs: 0, noTemplates: false } : r;
  }
  if (enr.reviewStage === "rejected" || enr.reviewStage === "cancelled") return { ok: false, error: "這個案件已退回或取消" };

  const funding = caseFunding(await receiptsForCase("training", enr.id), enr.amountDue);
  if (!funding.met) return { ok: false, error: `收款未達門檻：應收 ${fmtInt(enr.amountDue)}，已確認 ${fmtInt(funding.confirmed)}${funding.pending ? `（另有 ${fmtInt(funding.pending)} 待查帳）` : ""}` };
  // 資料閘（2026/10/28）：範本用到的欄位沒填齊不啟動——文件一產出就凍結，缺的欄位會變成永遠的空白。
  const ready = await enrollmentReadiness(enr);
  if (ready.missing.length) return { ok: false, error: `資料未填齊，還不能產文件：${ready.missing.map((m) => `${m.label}（${m.by === "person" ? "申請人填" : "行政確認"}）`).join("、")}` };

  if (enr.reviewStage === "pending") {
    await db
      .update(trainingEnrollments)
      .set({ reviewStage: "passed", passedAt: new Date(), passedBy: reviewerId, updatedAt: new Date() })
      .where(and(eq(trainingEnrollments.id, enr.id), eq(trainingEnrollments.reviewStage, "pending")));
    await db.update(coachApplications).set({ reviewerId, updatedAt: new Date() }).where(eq(coachApplications.coachId, coachId));
  }

  const [member, company, vars] = await Promise.all([partyOf(coachId), companySignerId ? partyOf(companySignerId) : null, buildVars(enr, coachId)]);
  const r = await startSigning({
    caseType: "training",
    caseId: enr.id,
    setKind: "training_item",
    setRef: enr.itemId,
    vars,
    ctx: { member, company },
    createdBy: reviewerId,
  });
  if (!r.ok) return r;
  if (r.noTemplates) {
    const a = await tryActivateEnrollment(enr.id, reviewerId);
    return a.ok ? { ok: true, activated: a.activated, docs: 0, noTemplates: true } : { ok: false, error: a.error ?? "開通失敗" };
  }
  // 範本有、但實例全都已完成（例如作廢重啟後補簽完）→ 順手試開通
  const a = await tryActivateEnrollment(enr.id, reviewerId);
  return { ok: true, activated: a.ok && a.activated, docs: r.instances.length, noTemplates: false };
}

/** 退回（資格不符）。保留收款與文件歷程，不刪。 */
export async function rejectEnrollment(coachId: string, reviewerId: string, note: string): Promise<void> {
  const enr = await getEnrollmentForCoach(coachId);
  if (!enr || enr.reviewStage === "activated") return;
  await db
    .update(trainingEnrollments)
    .set({ reviewStage: "rejected", passedBy: reviewerId, note: note.trim().slice(0, 400), updatedAt: new Date() })
    .where(eq(trainingEnrollments.id, enr.id));
}

// ── 正式開通 ─────────────────────────────────────────────────────────────────
/**
 * 四條件齊才開通：審核通過（passed）＋收款達門檻＋所有必簽文件完成＋案件未取消。
 * 由「最後一份文件簽完」（docsHooks）與「後台再按一次」兩條路呼叫，所以必須冪等。
 */
export async function tryActivateEnrollment(enrollmentId: string, by: string): Promise<{ ok: boolean; activated: boolean; error?: string }> {
  const enr = await getEnrollment(enrollmentId);
  if (!enr) return { ok: false, activated: false, error: "找不到案件" };
  if (enr.reviewStage === "activated") return { ok: true, activated: false };
  if (enr.reviewStage !== "passed") return { ok: false, activated: false, error: "尚未審核通過" };
  const [receipts, instances] = await Promise.all([receiptsForCase("training", enr.id), listInstancesForCase("training", enr.id)]);
  if (!caseFunding(receipts, enr.amountDue).met) return { ok: false, activated: false, error: "收款未達門檻" };
  const live = instances.filter((i) => i.status !== "void");
  const prog = caseProgress(live);
  if (live.some((i) => i.required) && !prog.allDone) return { ok: false, activated: false, error: `必簽文件 ${prog.done}/${prog.required}` };
  // 範本組合有文件、但這一案一份活的實例都沒有（啟動失敗過、或被作廢等重發）：不能就這樣開通——先回去按「審核通過並啟動簽署」。
  if (!live.length && (await setHasTemplates(enr.itemId))) return { ok: false, activated: false, error: "應簽文件尚未產生，請先重新啟動簽署" };

  // 審核人：呼叫端給的若不是教練 id（例如簽完文件的自動開通路徑），退回審核通過那位、再退回本人。
  const actor = (await db.select({ id: coaches.id }).from(coaches).where(eq(coaches.id, by)).limit(1)).length ? by : (enr.passedBy ?? enr.coachId);
  const r = await activateCoach(enr.coachId, actor);
  if (!r.ok) return { ok: false, activated: false, error: r.error };
  // 只有「原本不是 activated」的那一次更新會成功——兩條路同時進來也只有一條寫得到。
  const rows = await db
    .update(trainingEnrollments)
    .set({ reviewStage: "activated", activatedAt: new Date(), expiresAt: r.applied.licenseUntil ?? null, updatedAt: new Date() })
    .where(and(eq(trainingEnrollments.id, enr.id), eq(trainingEnrollments.reviewStage, "passed")))
    .returning({ id: trainingEnrollments.id });
  return { ok: true, activated: rows.length > 0 };
}

// ── 變數與簽署人 ─────────────────────────────────────────────────────────────
async function partyOf(coachId: string) {
  const rows = await db.select({ id: coaches.id, name: coachDisplayName }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
  return rows[0] ? { coachId: rows[0].id, name: rows[0].name ?? "" } : null;
}

async function buildVars(enr: Enrollment, coachId: string): Promise<DocVars> {
  const [rows, brand, prof, appRows, receipts] = await Promise.all([
    db.select({ name: coachDisplayName, email: coaches.email, code: coaches.code }).from(coaches).where(eq(coaches.id, coachId)).limit(1),
    getBrand(),
    getSignerProfile({ kind: "coach", id: coachId }),
    db.select({ phone: coachApplications.phone, introducerId: coachApplications.introducerId, introducerCode: coachApplications.introducerCode, submittedAt: coachApplications.submittedAt }).from(coachApplications).where(eq(coachApplications.coachId, coachId)).limit(1),
    receiptsForCase("training", enr.id),
  ]);
  const c = rows[0];
  const app = appRows[0];
  const ref = app?.introducerId ? (await db.select({ name: coachDisplayName, code: coaches.code }).from(coaches).where(eq(coaches.id, app.introducerId)).limit(1))[0] : null;
  // 付款方式：最早一筆已確認的收款（一期全額，通常只有一筆）
  const paid = receipts.filter((r) => !r.void && r.verified !== false).sort((a, b) => (a.on < b.on ? -1 : 1))[0];
  const method = paid?.method ?? null;
  const kind = (enr.memberKind as MemberKind) ?? "intern";
  return {
    today: todayISO(),
    esign_clause: E_SIGN_CLAUSE,
    "company.name": brand.brandName,
    "member.name": c?.name ?? "",
    "member.code": c?.code ?? "",
    ...profileVars("member", prof, { email: c?.email ?? "", phone: app?.phone ?? "" }),
    "member.kind": MEMBER_KIND_LABEL[kind] ?? "",
    "member.is_intern": kind === "intern",
    "member.is_partner": kind === "partner",
    "member.is_hired": kind === "hired",
    "ref.name": ref?.name ?? "",
    "ref.code": ref?.code ?? app?.introducerCode ?? "",
    "pay.method": method ? (PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method) : "",
    "pay.date": paid?.on ?? "",
    "pay.is_bank": method === "bank",
    "pay.is_card": method === "card",
    "pay.is_zero": method === "zero_installment",
    "brief.date": enr.briefDate ?? "",
    "brief.version": enr.briefVersion ?? "",
    "brief.is_meeting": enr.briefKind === "meeting",
    "brief.is_public": enr.briefKind === "public",
    "enroll.date": (app?.submittedAt ? todayISO(app.submittedAt) : todayISO(enr.createdAt)),
    "enroll.resign_date": enr.resignDate ?? "",
    "enroll.is_resign": !!enr.resignDate,
    "item.name": enr.itemName,
    "item.price": fmtInt(enr.amountDue),
    "case.amount": fmtInt(enr.amountDue),
  };
}

// ── 啟動前的資料檢查 ─────────────────────────────────────────────────────────
export type MissingItem = { label: string; by: "person" | "admin" };
export type Readiness = { missing: MissingItem[]; profile: SignerProfile | null; usesProfile: boolean };

/**
 * 這一案的範本組合用到哪些欄位、哪些還沒填。
 *   · 簽約人資料（member.id_no／address／…）：看 signer_profiles；範本沒用到就不要求。
 *   · 行政確認（說明會日期／公版版本）：範本有 brief.* 就要 briefKind，且對應的日期／版本要有。
 */
export async function enrollmentReadiness(enr: Enrollment): Promise<Readiness> {
  const keys = await getSet("training_item", enr.itemId);
  const templates = (await Promise.all(keys.map((k) => latestEnabledTemplate(k)))).filter((t): t is DocTemplate => !!t);
  const used = new Set(templates.flatMap((t) => varsInHtml(t.html)));
  const prof = await getSignerProfile({ kind: "coach", id: enr.coachId });
  const missing: MissingItem[] = [];
  const usesProfile = [...used].some((k) => varDef(k)?.need === "person");
  if (usesProfile) for (const l of profileMissing(prof)) missing.push({ label: l, by: "person" });
  const usesBrief = [...used].some((k) => k.startsWith("brief."));
  if (usesBrief) {
    if (!enr.briefKind) missing.push({ label: "報名前說明方式（說明會／公版介紹）", by: "admin" });
    else if (enr.briefKind === "meeting" && !enr.briefDate) missing.push({ label: "說明會日期", by: "admin" });
    else if (enr.briefKind === "public" && !enr.briefVersion) missing.push({ label: "公版介紹版本", by: "admin" });
  }
  return { missing, profile: prof, usesProfile };
}

/** 後台填行政確認欄。開通後不再改（合約已凍結，改了也不會進文件）。 */
export async function saveEnrollmentAdmin(coachId: string, raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const enr = await getEnrollmentForCoach(coachId);
  if (!enr) return { ok: false, error: "沒有培訓報名案件" };
  if (enr.reviewStage === "activated") return { ok: false, error: "已開通的案件不能再改" };
  const x = (raw ?? {}) as Record<string, unknown>;
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const v: EnrollmentAdminInput = {
    memberKind: x.memberKind === "partner" || x.memberKind === "hired" ? x.memberKind : "intern",
    briefKind: x.briefKind === "meeting" || x.briefKind === "public" ? x.briefKind : null,
    briefDate: date(x.briefDate),
    briefVersion: String(x.briefVersion ?? "").trim().slice(0, 60),
    resignDate: date(x.resignDate),
  };
  await db.update(trainingEnrollments).set({ ...v, updatedAt: new Date() }).where(eq(trainingEnrollments.id, enr.id));
  return { ok: true };
}
