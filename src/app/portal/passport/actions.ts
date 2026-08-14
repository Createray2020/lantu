"use server";

import { ensureClientUser } from "@/lib/clientUser";
import { savePassport } from "@/lib/clientPlan";
import type { PassportInputs } from "@/lib/passport";

// 存人生護照 → 生成客戶自己的基礎方案（plan）。
export async function savePassportAction(inputs: PassportInputs) {
  const user = await ensureClientUser();
  if (!user) return { ok: false as const, error: "未登入或非客戶帳號" };
  const monthly = await savePassport(user, inputs);
  return { ok: true as const, monthly };
}
