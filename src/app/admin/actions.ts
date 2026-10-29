"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { ensureCoach, isAdmin, setCoachStatus, setCoachOrg, transferClients, removeCoach } from "@/lib/coach";
import { saveBrand } from "@/lib/brand";
import { saveApplySettings, saveReviewChecks } from "@/lib/coachApplyStore";
import { passReview, rejectEnrollment, reopenEnrollment, saveEnrollmentAdmin, recordTrainingPaymentByAdmin, verifyTrainingReceipt } from "@/lib/trainingStore";
import type { ApplySettings } from "@/lib/coachApply";

// 後台動作的統一回傳型別：讓 client 端能顯示「已儲存 / 失敗原因」，
// 而不是丟出例外後在畫面上靜默失敗。
export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "invalid-rank": "職級不正確",
  "invalid-logo-format": "只接受 PNG 圖片",
  "logo-too-large": "圖片太大（上限約 3MB）",
  "missing-logo": "橫式 logo 與方形 icon 都要上傳",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

// isAdmin() 同時檢查 role==='admin' 與 status==='active'，
// 所以被停權的管理員在這裡就會被擋下（舊版只看 role，停權後 /admin 照樣能用）。
async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

// dataURL(PNG) 白名單驗證：只收 image/png dataURL，容量上限 ~3MB（base64）。
// 2026/10/25 資安盤點 #10：只驗前綴不夠——規劃器把 logoUrl 拼進 <img src="…">，
// base64 段混進引號就能逃出屬性。這裡把 base64 字元集與 PNG magic bytes 都驗死。
function validPng(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m) throw new Error("invalid-logo-format");
  if (s.length > 3_500_000) throw new Error("logo-too-large");
  const head = Buffer.from(m[1].slice(0, 16), "base64");
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 8 || PNG_MAGIC.some((b, i) => head[i] !== b)) throw new Error("invalid-logo-format");
  return s;
}

const RANKS = ["member", "manager", "owner"] as const;

// 設定組織樹：職級（member/manager/owner）＋推薦人。
export async function updateOrg(
  id: string,
  input: { orgRank: string; uplineId: string },
): Promise<ActionResult> {
  try {
    await guard();
    const orgRank = input.orgRank;
    if (!RANKS.includes(orgRank as (typeof RANKS)[number])) throw new Error("invalid-rank");
    const upline = String(input.uplineId || "");
    const r = await setCoachOrg(id, orgRank, upline && upline !== id ? upline : null);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function setStatus(
  id: string,
  status: "pending" | "active" | "suspended",
): Promise<ActionResult> {
  try {
    await guard();
    await setCoachStatus(id, status);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 核准報聘。
 *
 * 2026/08/31 起這裡不再只是 `status='active'`：先過檢核表閘門（推薦人確認、逐項打勾），
 * 通過才開通，而且開通當下一次帶齊職級（預設 C1）、推薦人（推薦人）、使用期限（預設一年）。
 * 沒有申請表的舊帳號一律直接放行 —— 見 approvalGate 的 hasApplication。
 */
export async function approveCoach(id: string, companySignerId?: string | null): Promise<ActionResult & { activated?: boolean; docs?: number }> {
  try {
    const me = await guard();
    // 2026/10/28：有培訓案件 → 審核閘＋收款門檻 → 啟動簽署（簽完才開通）；沒有案件 → 審核閘 → 直接開通（舊流程）。
    // 公司代表簽名位：後台選了誰就是誰；沒選＝按下這顆鈕的管理員。
    const r = await passReview(id, me.id, companySignerId || me.id);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true, activated: r.activated, docs: r.docs };
  } catch (e) {
    return fail(e);
  }
}

/** LT01：審核列直接確認申請人提報的培訓費（不用跑去帳務頁的待查帳）。 */
export async function verifyTrainingReceiptAction(coachId: string, receiptId: string): Promise<ActionResult> {
  try {
    await guard();
    const r = await verifyTrainingReceipt(coachId, receiptId);
    if (!r.ok) return r;
    revalidatePath("/admin");
    revalidatePath("/admin/accounting/receipts");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** LT01：申請人沒提報、但已付款（例如之前就匯過款）——後台核對後代記一筆已確認的培訓費。 */
export async function recordTrainingPaymentAction(coachId: string, input: { on: string; amount: number; last5?: string; note?: string }): Promise<ActionResult> {
  try {
    const me = await guard();
    const [c] = await db.select({ name: coaches.name, email: coaches.email }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
    if (!c) return { ok: false, error: "找不到這位申請人" };
    const r = await recordTrainingPaymentByAdmin(coachId, {
      amount: Number(input.amount) || 0, on: String(input.on ?? ""), method: "bank", last5: String(input.last5 ?? "").trim(),
      payer: c.name || c.email || coachId, note: `後台代記${input.note?.trim() ? `：${input.note.trim()}` : ""}`.slice(0, 200),
    }, me.id);
    if (!r.ok) return r;
    revalidatePath("/admin");
    revalidatePath("/admin/accounting/receipts");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 退回培訓報名（資格不符）：案件標 rejected，收款與文件歷程保留；帳號維持待審，之後可重新處理。 */
export async function rejectTrainingAction(coachId: string, note: string): Promise<ActionResult> {
  try {
    const me = await guard();
    await rejectEnrollment(coachId, me.id, note ?? "");
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 文件都簽完了但開通沒跟上、或啟動簽署失敗過（審核通過了卻沒有文件）：後台再推一次。
 * 走 passReview（冪等）：缺文件會重新產、文件齊了就開通。
 */
export async function retryActivateAction(coachId: string): Promise<ActionResult> {
  try {
    const me = await guard();
    const r = await passReview(coachId, me.id, me.id);
    if (!r.ok) return { ok: false, error: r.error };
    if (!r.activated && !r.noTemplates) return { ok: false, error: r.docs ? "文件還沒簽完，簽完會自動開通" : "尚未符合開通條件" };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 行政確認欄（2026/10/28）：身分、報名前說明方式、補簽原報名日——合約要印、申請人不該自己填的。 */
export async function saveEnrollmentAdminAction(coachId: string, input: unknown): Promise<ActionResult> {
  try {
    await guard();
    const r = await saveEnrollmentAdmin(coachId, input);
    if (!r.ok) return { ok: false, error: r.error ?? "儲存失敗" };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 退回之後重新受理：案件回待審，再走正常流程。 */
export async function reopenTrainingAction(coachId: string): Promise<ActionResult> {
  try {
    await guard();
    const r = await reopenEnrollment(coachId);
    if (!r.ok) return { ok: false, error: r.error ?? "失敗" };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 審核者逐項打勾（勾了才放行）。存的是時間戳：誰在什麼時候確認過這一項。 */
export async function saveReviewChecksAction(
  id: string,
  checked: string[],
  note: string,
): Promise<ActionResult> {
  try {
    const me = await guard();
    await saveReviewChecks(id, checked ?? [], me.id, note ?? "");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 報聘的全平台設定（核准預設值＋檢核表）。 */
export async function saveApplySettingsAction(input: ApplySettings): Promise<ActionResult> {
  try {
    await guard();
    await saveApplySettings(input);
    revalidatePath("/admin");
    revalidatePath("/admin/apply");
    revalidatePath("/dashboard/apply");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function suspendCoach(id: string) {
  return setStatus(id, "suspended");
}

export async function resetCoach(id: string) {
  return setStatus(id, "pending");
}

// 把某位教練名下的客戶整批轉給接手教練（移除帳號前的必要步驟）。
export async function transferClientsAction(
  fromId: string,
  toId: string,
): Promise<ActionResult & { moved?: number }> {
  try {
    await guard();
    const r = await transferClients(fromId, toId);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    return { ok: true, moved: r.moved };
  } catch (e) {
    return fail(e);
  }
}

// 移除教練帳號。名下有客戶或有分潤案件都會被擋（正常離職請用停權）。
export async function removeCoachAction(id: string): Promise<ActionResult> {
  try {
    const me = await guard();
    const r = await removeCoach(id, me.id);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// 上傳／替換全組織品牌 Logo（logoUrl＝橫式、iconUrl＝方形），寫到 owner 那一列。
export async function saveBrandLogo(formData: FormData) {
  const me = await guard();
  const logoUrl = validPng(formData.get("logoUrl"));
  const iconUrl = validPng(formData.get("iconUrl"));
  if (!logoUrl || !iconUrl) throw new Error("missing-logo");
  await saveBrand(me.id, { logoUrl, iconUrl });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

// 移除品牌 Logo，還原成嵐途預設標記。
export async function removeBrandLogo() {
  const me = await guard();
  await saveBrand(me.id, { logoUrl: null, iconUrl: null });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/** 測試帳號（2026/09/29 Ray）：勾了的帳號帳務事件一律不記；其他帳號照算。 */
export async function setCoachTestAction(id: string, isTest: boolean): Promise<ActionResult> {
  try {
    await guard();
    await db.update(coaches).set({ isTest }).where(eq(coaches.id, id));
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// 服務角色（2026/10/28 案件進度 ③）：客戶關係／行政財法。
export async function setServiceRoles(id: string, roles: string[]): Promise<ActionResult> {
  try {
    await guard();
    const { SERVICE_ROLES } = await import("@/lib/caseScope");
    const clean = SERVICE_ROLES.filter((r) => roles.includes(r));
    const { db } = await import("@/Shared/db");
    const { coaches } = await import("@/Shared/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(coaches).set({ serviceRoles: clean }).where(eq(coaches.id, id));
    revalidatePath("/admin");
    revalidatePath("/dashboard/cases");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}
