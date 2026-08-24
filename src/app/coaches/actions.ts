"use server";

import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { findCoachByCode, requestCoachLink } from "@/lib/coachLink";
import { getPublicCoach } from "@/lib/coachProfile";
// ⚠️ "use server" 檔案的每個 export 都必須是 async function。
//    在這裡 `export const PICK_BLOCKED_MESSAGE = "…"` 會讓整個模組變成「沒有任何 export」，
//    build 直接失敗（訊息是 "The module has no exports at all"）。常數一律放別處。
import { PICK_BLOCKED_MESSAGE } from "@/lib/license";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/coaches");
  revalidatePath("/portal");
  revalidatePath("/portal/setup");
}

/**
 * 客戶在公開教練頁「點卡片」選教練。
 * 仍走既有的雙向確認（requestCoachLink）——這裡只是換一個入口，
 * 「教練接受才掛上」的規則沒有變。
 */
export async function pickCoachAction(coachId: string): Promise<ActionResult> {
  const me = await ensureClientUser();
  if (!me) return { ok: false, error: "請先登入或註冊客戶帳號" };

  // 只認得公開列表上的教練：擋掉用 id 指定未上架或已停權對象的可能。
  const target = await getPublicCoach(coachId);
  if (!target) return { ok: false, error: "找不到這位教練" };

  // 派案閘（2026/08/24 Ray 拍板）：C 階不吃系統派案。
  // 前端已經把按鈕換掉了，這道是伺服器端的真正防線——按鈕不見不等於 server action 叫不動。
  if (!target.pickable) return { ok: false, error: PICK_BLOCKED_MESSAGE };

  const r = await requestCoachLink(me, coachId);
  if (!r.ok) return { ok: false, error: r.error ?? "送出失敗" };

  revalidate();
  return { ok: true };
}

/**
 * 用教練編號指定（C 階教練唯一的進場方式，S 階也能用）。
 *
 * 刻意不看職級、也不要求對方有公開檔案：能拿到完整編號本身就是「這位教練給你的」的證明。
 * 底線只有一條——帳號必須是 active（由 findCoachByCode 保證）。
 */
export async function pickCoachByCodeAction(
  rawCode: string,
): Promise<{ ok: true; coachName: string | null } | { ok: false; error: string }> {
  const me = await ensureClientUser();
  if (!me) return { ok: false, error: "請先登入或註冊客戶帳號" };

  const target = await findCoachByCode(rawCode);
  if (!target) return { ok: false, error: "查無此教練編號，請跟教練確認一次（格式如 FC2609002）" };

  const r = await requestCoachLink(me, target.id);
  if (!r.ok) return { ok: false, error: r.error ?? "送出失敗" };

  revalidate();
  return { ok: true, coachName: target.name };
}

/** 只查不送出：輸入編號後先把姓名秀出來讓客戶確認是不是同一個人，再按送出。 */
export async function lookupCoachByCodeAction(
  rawCode: string,
): Promise<{ ok: true; id: string; name: string | null; title: string | null; code: string } | { ok: false; error: string }> {
  const target = await findCoachByCode(rawCode);
  if (!target) return { ok: false, error: "查無此教練編號" };
  return { ok: true, ...target };
}
