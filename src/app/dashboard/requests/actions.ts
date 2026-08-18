"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach } from "@/lib/coach";
import { respondToLinkRequest, createInvite } from "@/lib/coachLink";

// 教練接受/婉拒客戶連結申請。接受＝把客戶掛到自己名下。
export async function respondLinkAction(requestId: string, accept: boolean) {
  const coach = await ensureCoach();
  // 必須是 active。舊版只檢查「有沒有 coaches 列」，停權/待審核的教練可以直接對這個
  // server action 發 POST（Next-Action header）繞過頁面 redirect，照樣把客戶綁到自己名下。
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入或帳號未開通" };
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
