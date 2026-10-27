// 案件進度的「完成訊號」：既有事件發生時順手勾清單、必要時推進階段。
// 原則（定案企劃 ②）：能自動的先自動、沒訊號的才讓教練按「本階段完成」。全部冪等、全部 try/catch——案件進度永遠不擋原本的業務。
//   · 諮詢紀錄存檔（type）→ 初次／深度 → 階段 5 的「首次深度會談」；提案／報告書 → 階段 7 的「報告書會談」；
//     定期檢視類（review/quarter/half/annual/adhoc）→ 階段 8 的「本季追蹤」並視為一個週期完成。
//   · 諮詢紀錄有下次預約 → 階段 4「已排定首次會談日期」。
//   · 風險問卷送出 → 階段 5「風險屬性問卷已完成」。
//   · 報告書版本標「初稿」→ 階段 6「初稿已完成」；標「最終版」→ 階段 7「最終版已交付」。
//   · 合約完成／收款確認／客戶綁帳號 → serviceStore.recheckCommission（三個都到齊自動推到階段 5）。
import { getCaseByClient, autoCheck, completeStage, SYSTEM } from "./caseStore";

const INTERVIEW_TYPES = new Set(["intro", "deep"]);
const REPORT_TYPES = new Set(["proposal", "report"]);
const TRACKING_TYPES = new Set(["review", "quarter", "half", "annual", "adhoc"]);

export async function onReviewSaved(clientId: string, type: string | null | undefined, nextAppt: string | null | undefined): Promise<void> {
  try {
    const b = await getCaseByClient(clientId);
    if (!b || b.case.status === "closed") return;
    const t = type ?? "review";
    if (nextAppt && b.case.stage === "commission") await autoCheck(b.case.id, "commission", "next");
    if (INTERVIEW_TYPES.has(t)) await autoCheck(b.case.id, "interview", "meet");
    if (REPORT_TYPES.has(t)) {
      await autoCheck(b.case.id, "report", "meet");
      if (nextAppt) await autoCheck(b.case.id, "report", "actions");
    }
    if (TRACKING_TYPES.has(t) && b.case.stage === "tracking") {
      await autoCheck(b.case.id, "tracking", "review");
      await completeStage(b.case.id, "tracking", SYSTEM, { auto: true, reason: "已存定期追蹤的諮詢紀錄" });
    }
  } catch { /* 不擋諮詢紀錄 */ }
}

export async function onQuizSubmitted(clientId: string): Promise<void> {
  try {
    const b = await getCaseByClient(clientId);
    if (!b || b.case.status === "closed") return;
    await autoCheck(b.case.id, "interview", "kyc");
  } catch { /* 不擋問卷 */ }
}

export async function onReportLabeled(clientId: string, label: string): Promise<void> {
  try {
    const b = await getCaseByClient(clientId);
    if (!b || b.case.status === "closed") return;
    if (label === "draft") await autoCheck(b.case.id, "planning", "draft");
    if (label === "final") await autoCheck(b.case.id, "report", "final");
  } catch { /* 不擋版本標籤 */ }
}
