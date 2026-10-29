"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { lookupClaimCode, redeemInvite } from "@/lib/coachLink";
import { JOIN_COOKIE, claimPath, isJoinCode } from "@/lib/joinFlow";

// 認領頁的動作（2026/10/29）。⚠️ "use server" 檔每個 export 都必須是 async function。

export type ClaimFormState = { error: string | null };

/** 手動輸入「客戶編號-開通碼」→ 找到就去確認頁（還沒綁）；錯了回訊息（有次數限制）。 */
export async function lookupClaimAction(_prev: ClaimFormState, form: FormData): Promise<ClaimFormState> {
  const user = await ensureClientUser();
  if (!user) return { error: "請先登入" };
  const r = await lookupClaimCode(user.id, String(form.get("claim") ?? ""));
  if (!r.ok) return { error: r.error };
  redirect(claimPath(r.code));
}

/** 確認接上：真正綁定。成功或失敗都清 cookie（不會一直被拉回認領頁）。 */
export async function confirmClaimAction(code: string): Promise<{ ok: false; error: string } | void> {
  const user = await ensureClientUser();
  if (!user) return { ok: false, error: "請先登入" };
  if (!isJoinCode(code)) return { ok: false, error: "連結不完整" };
  (await cookies()).delete(JOIN_COOKIE);
  const r = await redeemInvite(code, user).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error && e.message ? e.message : "連結時發生問題，請稍後再試一次。" }));
  if (!r.ok) return { ok: false, error: r.error || "這個連結目前無法使用，請向教練確認。" };
  revalidatePath("/portal");
  redirect("/portal?joined=1");
}

/** 「這不是我的」：只清 cookie、回首頁，什麼都不綁。 */
export async function dismissClaimAction(): Promise<void> {
  (await cookies()).delete(JOIN_COOKIE);
  redirect("/portal");
}
