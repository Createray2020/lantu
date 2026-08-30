"use server";

import { revalidatePath } from "next/cache";
import { requireWritableCoach } from "@/lib/guard";
import { copyTemplateToCoach, type CopyTemplateOutcome } from "@/lib/templates";

/**
 * 「複製一份給自己」：把共用範本落成我名下的一位正常客戶。
 *
 * ⚠️ 這裡一定要 requireWritableCoach()，不能只靠 copyTemplateToCoach()。
 *    那支只驗 `status === 'active'`，**不驗使用期限**——少了這一行，使用期限
 *    已經到期、全站唯讀的教練還是能從範本長出新客戶來，唯讀鎖就破了一個洞。
 *    （額度則由 copyTemplateToCoach() 內部的 requireClientQuota() 負責，
 *      它排在發號之前，所以額度滿的時候一個客戶編號都不會被吃掉。）
 */
export async function copyTemplateAction(templateId: string): Promise<CopyTemplateOutcome> {
  try {
    const me = await requireWritableCoach();
    const r = await copyTemplateToCoach(me.id, templateId);
    if (r.ok) revalidatePath("/dashboard/clients");
    return r;
  } catch (e) {
    // 期限到期／非 active：訊息是寫給人看的，原樣回傳（同 dashboard/actions.ts 的作法）。
    const msg = e instanceof Error && e.name !== "Error" && e.message ? e.message : "複製失敗，請重試。";
    return { ok: false, error: msg };
  }
}
