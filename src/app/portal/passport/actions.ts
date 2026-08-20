"use server";

// 教練端的 action 都有 revalidatePath，客戶端這幾支原本完全沒有——
// 目前只是靠 Next 的 staleTimes.dynamic 預設 0 才沒出事（PassportWizard 的「硬導頁比 router.push 穩」
// 註解就是這個缺失的症狀補丁）。補齊，別留這種隱性依賴。
import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { savePassport } from "@/lib/clientPlan";
import type { PassportInputs } from "@/lib/passport";

// 存人生護照 → 生成客戶自己的基礎方案（plan）。
// 一律回傳明確成敗（不丟例外），避免未捕捉錯誤讓 Vercel 回 503、前端乾等。
// overwrite：已有護照份時，第一次呼叫會回 needsConfirm，使用者確認後才帶 true 再送一次。
export async function savePassportAction(inputs: PassportInputs, opts?: { overwrite?: boolean }) {
  try {
    const user = await ensureClientUser();
    if (!user) return { ok: false as const, error: "未登入，請重新登入後再試", needsAuth: true as const };
    const outcome = await savePassport(user, inputs, opts);
    if (outcome.status === "needs-confirm") {
      return { ok: false as const, needsConfirm: true as const, existingUpdatedAt: outcome.existingUpdatedAt };
    }
    const result = outcome.result;
    revalidatePath("/portal");
    revalidatePath("/portal/passport");
    revalidatePath("/portal/setup");
    revalidatePath("/portal/plan");
    return { ok: true as const, result };
  } catch (e) {
    console.error("[savePassportAction] 存檔失敗", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "儲存發生未知錯誤" };
  }
}
