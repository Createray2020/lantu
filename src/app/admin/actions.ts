"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin, setCoachStatus, setCoachOrg } from "@/lib/coach";

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
}

// 設定組織樹：職級（member/manager/owner）＋上線。
export async function updateOrg(id: string, formData: FormData) {
  await guard();
  const orgRank = String(formData.get("orgRank") || "member");
  const upline = String(formData.get("uplineId") || "");
  await setCoachOrg(id, orgRank, upline && upline !== id ? upline : null);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function approveCoach(id: string) {
  await guard();
  await setCoachStatus(id, "active");
  revalidatePath("/admin");
}

export async function suspendCoach(id: string) {
  await guard();
  await setCoachStatus(id, "suspended");
  revalidatePath("/admin");
}

export async function resetCoach(id: string) {
  await guard();
  await setCoachStatus(id, "pending");
  revalidatePath("/admin");
}
