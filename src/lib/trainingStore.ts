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
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches, coachApplications, coachDisplayName, trainingEnrollments } from "@/Shared/db/schema";
import { getApplySettings, checkApprovalGate, activateCoach } from "./coachApplyStore";
import { getAcctState, createCaseReceipt, receiptsForCase, type CaseFeeInput } from "./acctStore";
import { caseFunding, referralChain, type Receipt } from "./acctEngine";
import { startSigning, listInstancesForCase, withSigners, caseProgress, type InstanceWithSigners } from "./docsStore";
import { getBrand } from "./brand";
import { E_SIGN_CLAUSE, type DocVars } from "./docs";
import { todayISO } from "./license";
import { fmtMoney0 as fmtInt } from "./money";

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
  const [row] = await db
    .insert(trainingEnrollments)
    .values({ coachId, itemId: item.id, itemName: item.name, amountDue: item.price || 0, reviewStage: "pending" })
    .returning();
  return row;
}

export async function getEnrollmentForCoach(coachId: string): Promise<Enrollment | null> {
  const rows = await db
    .select()
    .from(trainingEnrollments)
    .where(and(eq(trainingEnrollments.coachId, coachId), ne(trainingEnrollments.reviewStage, "cancelled")))
    .orderBy(desc(trainingEnrollments.createdAt))
    .limit(1);
  return rows[0] ?? null;
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
  const enr = await getEnrollmentForCoach(coachId);
  if (!enr) return { ok: false, error: "沒有培訓報名案件" };
  if (enr.reviewStage === "activated" || enr.reviewStage === "rejected") return { ok: false, error: "這個案件已經結案" };
  const [S, appRows] = await Promise.all([getAcctState(), db.select({ introducerId: coachApplications.introducerId }).from(coachApplications).where(eq(coachApplications.coachId, coachId)).limit(1)]);
  const intro = appRows[0]?.introducerId ?? null;
  const sharers = intro ? referralChain(intro, S.coachList ?? []) : [];
  try {
    const id = await createCaseReceipt("training", enr.id, enr.itemId, input, { verified: false, enteredBy: coachId, sharers });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === "invalid-amount" ? "請填正確的金額與日期" : "提報失敗" };
  }
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

  const r = await activateCoach(enr.coachId, by);
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
  const [rows, brand] = await Promise.all([
    db.select({ name: coachDisplayName, email: coaches.email, code: coaches.code }).from(coaches).where(eq(coaches.id, coachId)).limit(1),
    getBrand(),
  ]);
  const c = rows[0];
  return {
    today: todayISO(),
    esign_clause: E_SIGN_CLAUSE,
    "company.name": brand.brandName,
    "member.name": c?.name ?? "",
    "member.email": c?.email ?? "",
    "member.code": c?.code ?? "",
    "item.name": enr.itemName,
    "item.price": fmtInt(enr.amountDue),
    "case.amount": fmtInt(enr.amountDue),
  };
}
