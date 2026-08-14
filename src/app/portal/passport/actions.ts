"use server";

import { ensureClientUser } from "@/lib/clientUser";
import { savePassport } from "@/lib/clientPlan";
import type { PassportInputs } from "@/lib/passport";

// 存人生護照 → 生成客戶自己的基礎方案（plan）。
// 一律回傳明確成敗（不丟例外），避免未捕捉錯誤讓 Vercel 回 503、前端乾等。
export async function savePassportAction(inputs: PassportInputs) {
  try {
    const user = await ensureClientUser();
    if (!user) return { ok: false as const, error: "未登入，請重新登入後再試" };
    const result = await savePassport(user, inputs);
    return { ok: true as const, result };
  } catch (e) {
    console.error("[savePassportAction] 存檔失敗", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "儲存發生未知錯誤" };
  }
}
