"use server";

import { ensureClientUser } from "@/lib/clientUser";
import { saveClientSetup, type ClientBasics } from "@/lib/clientPlan";
import { requestCoachLink } from "@/lib/coachLink";
import type { CrossInputs } from "@/lib/passport";

// 存基本資料＋財務現況十字表。
export async function saveSetupAction(basics: ClientBasics, cross: CrossInputs) {
  try {
    const user = await ensureClientUser();
    if (!user) return { ok: false as const, error: "未登入，請重新登入" };
    await saveClientSetup(user, basics, cross);
    return { ok: true as const };
  } catch (e) {
    console.error("[saveSetupAction]", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "儲存失敗，請重試" };
  }
}

// 送出連結教練申請（雙向確認：教練接受才掛上）。
export async function requestCoachAction(coachId: string, note?: string) {
  try {
    const user = await ensureClientUser();
    if (!user) return { ok: false as const, error: "未登入，請重新登入" };
    const r = await requestCoachLink(user, coachId, note);
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  } catch (e) {
    console.error("[requestCoachAction]", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "送出失敗，請重試" };
  }
}
