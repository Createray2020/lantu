"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach } from "@/lib/coach";
import { respondToLinkRequest, createInvite } from "@/lib/coachLink";

// 教練接受/婉拒客戶連結申請。接受＝把客戶掛到自己名下。
export async function respondLinkAction(requestId: string, accept: boolean) {
  const coach = await ensureCoach();
  if (!coach) return { ok: false as const, error: "未登入" };
  const r = await respondToLinkRequest(requestId, coach.id, accept);
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/clients");
  return r;
}

// 教練產生反向邀請連結（客戶開啟即掛到本教練）。
export async function createInviteAction() {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入" };
  const { code } = await createInvite(coach.id);
  return { ok: true as const, code };
}
