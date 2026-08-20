"use server";

import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan } from "@/lib/clientPlan";
import { isClientTrack, restoreRevision } from "@/lib/revisions";

// 客戶只能回復自己那一軌（track='client'）。
// 沒有這道限制，客戶就能把教練花數小時做的年度版回復成任意舊版——
// 雙軌如果沒有邊界，等於沒有雙軌。
export async function restoreClientRevisionAction(planId: string, revisionId: string) {
  try {
    const user = await ensureClientUser();
    if (!user) return { ok: false as const, error: "請重新登入" };
    const own = await getClientOwnPlan(user.id);
    if (!own) return { ok: false as const, error: "找不到你的規劃" };
    if (!(await isClientTrack(planId, own.clientId))) {
      return { ok: false as const, error: "這是教練的規劃版本，只有教練能回復" };
    }

    const res = await restoreRevision(planId, revisionId, { type: "client", id: user.id, name: user.name });
    if (!res.ok) return { ok: false as const, error: res.error };
    revalidatePath("/portal");
    revalidatePath("/portal/history");
    revalidatePath("/portal/passport");
    revalidatePath("/portal/plan");
    return { ok: true as const };
  } catch (e) {
    console.error("[restoreClientRevisionAction]", e);
    return { ok: false as const, error: e instanceof Error ? e.message : "回復失敗" };
  }
}
