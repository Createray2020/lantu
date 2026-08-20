"use server";

import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { requestCoachLink } from "@/lib/coachLink";
import { getPublicCoach } from "@/lib/coachProfile";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * 客戶在公開教練頁直接選教練。
 * 仍走既有的雙向確認（requestCoachLink）——這裡只是換一個入口，
 * 「教練接受才掛上」的規則沒有變。
 */
export async function pickCoachAction(coachId: string): Promise<ActionResult> {
  const me = await ensureClientUser();
  if (!me) return { ok: false, error: "請先登入或註冊客戶帳號" };

  // 只認得公開列表上的教練：擋掉用 id 指定未上架或已停權對象的可能。
  const target = await getPublicCoach(coachId);
  if (!target) return { ok: false, error: "找不到這位教練" };

  const r = await requestCoachLink(me, coachId);
  if (!r.ok) return { ok: false, error: r.error ?? "送出失敗" };

  revalidatePath("/coaches");
  revalidatePath("/portal");
  revalidatePath("/portal/setup");
  return { ok: true };
}
