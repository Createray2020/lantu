"use server";

// 客戶專用登入連結（主責教練專用）。
//
// ⚠️ "use server" 檔案的每個 export 都必須是 async function。

import { revalidatePath } from "next/cache";
import { ensureCoach } from "@/lib/coach";
import { licenseState, LICENSE_LOCKED_MESSAGE } from "@/lib/license";
import { createClientInvite } from "@/lib/coachLink";

// 產生（或重新產生）這位客戶的專用登入連結；舊的未用碼同時作廢。
export async function createClientInviteAction(clientId: string) {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入或帳號未開通" };
  // 開通登入等於把規劃交到客戶手上，是寫入；期限到期就擋。
  if (licenseState(coach).expired) return { ok: false as const, error: LICENSE_LOCKED_MESSAGE };
  const r = await createClientInvite(coach.id, clientId);
  if (!r.ok) return r;
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true as const, code: r.code, claimCode: r.claimCode };
}
