"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin, setCoachStatus, setCoachOrg } from "@/lib/coach";
import { saveBrand } from "@/lib/brand";

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

// dataURL(PNG) 白名單驗證：只收 image/png dataURL，容量上限 ~3MB（base64）。
function validPng(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^data:image\/png;base64,/.test(s)) throw new Error("invalid-logo-format");
  if (s.length > 3_500_000) throw new Error("logo-too-large");
  return s;
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

// 上傳／替換全組織品牌 Logo（logoUrl＝橫式、iconUrl＝方形），寫到 owner 那一列。
export async function saveBrandLogo(formData: FormData) {
  const me = await guard();
  const logoUrl = validPng(formData.get("logoUrl"));
  const iconUrl = validPng(formData.get("iconUrl"));
  if (!logoUrl || !iconUrl) throw new Error("missing-logo");
  await saveBrand(me.id, { logoUrl, iconUrl });
  revalidatePath("/admin");
}

// 移除品牌 Logo，還原成嵐途預設標記。
export async function removeBrandLogo() {
  const me = await guard();
  await saveBrand(me.id, { logoUrl: null, iconUrl: null });
  revalidatePath("/admin");
}
