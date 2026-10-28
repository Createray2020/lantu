"use server";

import { redirect } from "next/navigation";
import { applyAsCoach, ensureCoach } from "@/lib/coach";
import { getApplySettings, lookupCoachByCode, submitApplication } from "@/lib/coachApplyStore";
import { canSubmit, routeMeta, type ApplyDraft } from "@/lib/coachApply";
import { ensureEnrollment, reportTrainingPayment } from "@/lib/trainingStore";
import { saveSignerProfile } from "@/lib/docsStore";
import type { CaseFeeInput } from "@/lib/acctStore";
import { revalidatePath } from "next/cache";

// 明確申請成為教練。只有這支會建立 coaches 列（status=pending，待後台核准）。
//
// ⚠️ "use server" 檔案的每個 export 都必須是 async function（常數放 lib/）。
// ⚠️ 這支刻意不接使用期限的唯讀閘：呼叫的當下還不是教練，沒有期限可檢查
//    （guard.drift.test.ts 的 EXEMPT 就是為這件事開的）。
//
// 兩段寫入（coaches 列 → coach_applications 列）刻意不合併：建教練列走的是既有的唯一入口
// applyAsCoach()，申請表是新的一張表。就算中間斷掉，使用者也只是「送出了但後台看不到自述」，
// 不會變成沒有身分的孤兒，重送一次就補齊。
export async function applyAsCoachAction(draft: ApplyDraft) {
  const settings = await getApplySettings();
  // 前端已經擋過一次，這裡再擋一次 —— 只擋前端等於沒擋。
  if (!draft || !canSubmit(draft, settings)) return { ok: false as const, error: "資料未填完整" };

  // 2026/10/25 資安盤點 #14：只有「還沒申請過」或「仍在待審」才能送——
  // 已核准的教練重送會把自己的推薦人紀錄洗掉、停權者可以反覆製造待審紀錄。
  // 與 applyAsCoach() 的 applyFields 同一條件。
  const existing = await ensureCoach();
  if (existing && existing.status !== "pending") {
    return { ok: false as const, error: existing.status === "active" ? "你已經是教練了，不需要再申請" : "這個帳號目前無法送出申請" };
  }

  const needsIntro = routeMeta(draft.route).needsIntroducer;
  const introducer = needsIntro ? await lookupCoachByCode(draft.introducerCode) : null;

  const row = await applyAsCoach({
    name: draft.name,
    phone: draft.phone,
    currentJob: draft.currentJob,
    sponsorCode: needsIntro ? draft.introducerCode : "",
    route: draft.route,
  });
  if (!row) redirect("/login?redirect_url=/dashboard/apply");

  await submitApplication(row.id, draft, introducer?.id ?? null);
  // 簽約資料（有填才存；失敗不擋申請，儀表板補得回來）
  if (draft.profile && Object.values(draft.profile).some((v) => typeof v === "string" && v.trim())) {
    try {
      await saveSignerProfile({ kind: "coach", id: row.id }, { ...draft.profile, email: draft.profile.email || row.email || "", phone: draft.profile.phone || draft.phone });
    } catch (e) {
      console.error("[docs] saveSignerProfile at apply failed", e);
    }
  }
  // 2026/10/28：報聘＝培訓報名。後台設了培訓方案就建案（應收＝方案價格）；沒設就跳過（舊流程）。
  // 建案失敗不擋申請——申請已經送出了，案件後台補得回來。
  try {
    await ensureEnrollment(row.id);
  } catch (e) {
    console.error("[training] ensureEnrollment failed", e);
  }
  redirect("/dashboard");
}

/** 申請人提報培訓費付款：寫一筆待查帳的收款，公司確認後才算。 */
export async function reportTrainingPaymentAction(input: Omit<CaseFeeInput, "payer"> & { last5?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await ensureCoach();
  if (!me) return { ok: false, error: "請先登入" };
  if (me.status !== "pending") return { ok: false, error: "這個帳號不在報名階段" };
  const r = await reportTrainingPayment(me.id, { ...input, payer: me.name });
  if (!r.ok) return r;
  return { ok: true };
}

/** 申請表單即時驗推薦人編號：填對了當場把名字顯示出來，不用送出才知道打錯。 */
export async function lookupIntroducerAction(code: string) {
  const found = await lookupCoachByCode(code);
  if (!found || found.status !== "active") return { ok: false as const };
  return { ok: true as const, name: found.name ?? "（未命名）" };
}

/** 簽約資料（本人）：任何已登入的教練／申請人都能改；已發出的文件不受影響（快照已凍結）。 */
export async function saveMyProfileAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await ensureCoach();
  if (!me) return { ok: false, error: "請先登入" };
  try {
    await saveSignerProfile({ kind: "coach", id: me.id }, input);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/docs");
    return { ok: true };
  } catch {
    return { ok: false, error: "儲存失敗，請再試一次" };
  }
}
