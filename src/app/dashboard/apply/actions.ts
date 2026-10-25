"use server";

import { redirect } from "next/navigation";
import { applyAsCoach, ensureCoach } from "@/lib/coach";
import { getApplySettings, lookupCoachByCode, submitApplication } from "@/lib/coachApplyStore";
import { canSubmit, routeMeta, type ApplyDraft } from "@/lib/coachApply";

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
  redirect("/dashboard");
}

/** 申請表單即時驗推薦人編號：填對了當場把名字顯示出來，不用送出才知道打錯。 */
export async function lookupIntroducerAction(code: string) {
  const found = await lookupCoachByCode(code);
  if (!found || found.status !== "active") return { ok: false as const };
  return { ok: true as const, name: found.name ?? "（未命名）" };
}
