// 文件全部簽完之後要觸發的業務後續（由簽署 action 在 completed 時呼叫）。
// 引擎（docsStore）不認得業務；業務（培訓開通、顧問服務合約完成）在這裡接。
// ⚠️ 必須冪等：重送、重複回報、同一份被按兩次都不能再開通一次或重設期限。
import type { DocCaseType } from "./docs";

export async function onDocCompleted(caseType: DocCaseType, caseId: string): Promise<void> {
  if (caseType === "training") {
    const { tryActivateEnrollment } = await import("./trainingStore");
    await tryActivateEnrollment(caseId, "docs");
  }
  if (caseType === "client_service") {
    const { onCaseDocsCompleted } = await import("./serviceStore");
    await onCaseDocsCompleted(caseId);
  }
}
