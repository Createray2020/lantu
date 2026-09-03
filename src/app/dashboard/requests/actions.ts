"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach } from "@/lib/coach";
import { licenseState, LICENSE_LOCKED_MESSAGE } from "@/lib/license";
import { respondToLinkRequest, createInvite } from "@/lib/coachLink";
import { respondToCollabInvite } from "@/lib/clientCollab";
import { actOnIntroduction } from "@/lib/coachApplyStore";

// 教練接受/婉拒客戶連結申請。接受＝把客戶掛到自己名下。
export async function respondLinkAction(requestId: string, accept: boolean) {
  const coach = await ensureCoach();
  // 必須是 active。舊版只檢查「有沒有 coaches 列」，停權/待審核的教練可以直接對這個
  // server action 發 POST（Next-Action header）繞過頁面 redirect，照樣把客戶綁到自己名下。
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入或帳號未開通" };
  // 接受連結＝把客戶掛到自己名下，是寫入；期限到期就擋（否則到期帳號還能持續進客戶）。
  if (licenseState(coach).expired) return { ok: false as const, error: LICENSE_LOCKED_MESSAGE };
  const r = await respondToLinkRequest(requestId, coach.id, accept);
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/clients");
  return r;
}

// 教練產生反向邀請連結（客戶開啟即掛到本教練）。
export async function createInviteAction() {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入" };
  if (licenseState(coach).expired) return { ok: false as const, error: LICENSE_LOCKED_MESSAGE };
  const { code } = await createInvite(coach.id);
  return { ok: true as const, code };
}

// 教練接受／婉拒「共同執案」邀請。
//
// 刻意**不擋使用期限**：接受到手的只有唯讀可見權，而到期鎖定的語意是「能看不能改」——
// 到期的教練照樣看得到自己的客戶，沒有理由連被邀來幫看都不行。
export async function respondCollabInviteAction(inviteId: string, accept: boolean) {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入或帳號未開通" };
  const r = await respondToCollabInvite(inviteId, coach.id, accept);
  if (!r.ok) return { ok: false as const, error: r.error ?? "處理失敗" };
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/clients");
  return { ok: true as const };
}

// 推薦人確認／婉拒一件報聘申請。
//
// 刻意**不擋使用期限**：確認推薦寫的不是自己的規劃資料，而是「這個人我認得」這件事實；
// 到期鎖定的語意是「能看不能改自己的案子」，沒有理由連替公司確認一位新人都不行
// （與共同執案邀請同一條判斷）。租戶條件在資料層：where 一定同時帶 introducerId。
export async function respondIntroductionAction(
  applicantId: string,
  action: "confirm" | "decline",
  note: string,
) {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") return { ok: false as const, error: "未登入或帳號未開通" };
  const r = await actOnIntroduction(coach.id, applicantId, action, note ?? "");
  if (!r.ok) return { ok: false as const, error: "這件申請已經處理過了，重新整理看看。" };
  revalidatePath("/dashboard/requests");
  revalidatePath("/admin");
  return { ok: true as const };
}
