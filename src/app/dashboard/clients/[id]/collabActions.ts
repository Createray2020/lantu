"use server";

// 共同執案的管理動作（主責教練專用）。
//
// ⚠️ "use server" 檔案的每個 export 都必須是 async function ——
//    放一個常數進來會讓整個模組變成「no exports at all」，而且只有 next build 抓得到。

import { revalidatePath } from "next/cache";
import { ensureCoach } from "@/lib/coach";
import { licenseState, LICENSE_LOCKED_MESSAGE } from "@/lib/license";
import { inviteCollaborator, revokeCollaborator } from "@/lib/clientCollab";

// 以教練編號邀請一位教練共同執案（對方接受後可唯讀看這位客戶的全部資料）。
export async function inviteCollaboratorAction(clientId: string, code: string) {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入或帳號未開通" };
  // 邀請是寫入（會多一個人看得到客戶資料），期限到期就擋。
  if (licenseState(coach).expired) return { ok: false as const, error: LICENSE_LOCKED_MESSAGE };
  const r = await inviteCollaborator(coach.id, clientId, code);
  if (!r.ok) return r;
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true as const, coachName: r.coachName };
}

// 主責移除協作教練（對方立刻失去可見權）。
export async function revokeCollaboratorAction(clientId: string, collabId: string) {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入或帳號未開通" };
  // 移除是「收回權限」——期限到期也必須做得到，不然出了狀況反而卡住。
  const r = await revokeCollaborator(coach.id, clientId, collabId);
  if (!r.ok) return { ok: false as const, error: r.error ?? "移除失敗" };
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true as const };
}
