"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach } from "@/lib/coach";
import { licenseState, LICENSE_LOCKED_MESSAGE } from "@/lib/license";
import { getPlan } from "@/lib/plans";
import { restoreRevision } from "@/lib/revisions";

// 教練只能回復自己那一軌（track='coach'）。
// 客戶的人生護照是客戶自己寫的東西，教練可以看、可以在年度版裡引用，但不能代為改寫歷史。
export async function restoreCoachRevisionAction(planId: string, revisionId: string) {
  try {
    const coach = await ensureCoach();
    if (!coach || coach.status !== "active") return { ok: false as const, error: "沒有權限" };
    if (licenseState(coach).expired) return { ok: false as const, error: LICENSE_LOCKED_MESSAGE };
    // getPlan 會驗這份 plan 屬於這位教練的客戶；少了它，帶別人的 planId 進來就能寫別人的規劃。
    const plan = await getPlan(coach.id, planId);
    if (!plan) return { ok: false as const, error: "找不到這份規劃" };
    if (plan.track !== "coach") return { ok: false as const, error: "客戶的人生護照只有客戶本人可以回復" };

    const res = await restoreRevision(planId, revisionId, { type: "coach", id: coach.id, name: coach.name ?? null });
    if (!res.ok) return { ok: false as const, error: res.error };
    revalidatePath(`/dashboard/plans/${planId}/history`);
    revalidatePath(`/dashboard/plans/${planId}/edit`);
    revalidatePath(`/dashboard/clients/${plan.clientId}`);
    return { ok: true as const };
  } catch (e) {
    console.error("[restoreCoachRevisionAction]", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "回復失敗" };
  }
}
