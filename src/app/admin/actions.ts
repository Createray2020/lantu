"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin, setCoachStatus, setCoachOrg } from "@/lib/coach";
import { saveBrand } from "@/lib/brand";

// 後台動作的統一回傳型別：讓 client 端能顯示「已儲存 / 失敗原因」，
// 而不是丟出例外後在畫面上靜默失敗。
export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "invalid-rank": "職級不正確",
  "invalid-logo-format": "只接受 PNG 圖片",
  "logo-too-large": "圖片太大（上限約 3MB）",
  "missing-logo": "橫式 logo 與方形 icon 都要上傳",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

// isAdmin() 同時檢查 role==='admin' 與 status==='active'，
// 所以被停權的管理員在這裡就會被擋下（舊版只看 role，停權後 /admin 照樣能用）。
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

const RANKS = ["member", "manager", "owner"] as const;

// 設定組織樹：職級（member/manager/owner）＋上線。
export async function updateOrg(
  id: string,
  input: { orgRank: string; uplineId: string },
): Promise<ActionResult> {
  try {
    await guard();
    const orgRank = input.orgRank;
    if (!RANKS.includes(orgRank as (typeof RANKS)[number])) throw new Error("invalid-rank");
    const upline = String(input.uplineId || "");
    const r = await setCoachOrg(id, orgRank, upline && upline !== id ? upline : null);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function setStatus(
  id: string,
  status: "pending" | "active" | "suspended",
): Promise<ActionResult> {
  try {
    await guard();
    await setCoachStatus(id, status);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approveCoach(id: string) {
  return setStatus(id, "active");
}

export async function suspendCoach(id: string) {
  return setStatus(id, "suspended");
}

export async function resetCoach(id: string) {
  return setStatus(id, "pending");
}

// 上傳／替換全組織品牌 Logo（logoUrl＝橫式、iconUrl＝方形），寫到 owner 那一列。
export async function saveBrandLogo(formData: FormData) {
  const me = await guard();
  const logoUrl = validPng(formData.get("logoUrl"));
  const iconUrl = validPng(formData.get("iconUrl"));
  if (!logoUrl || !iconUrl) throw new Error("missing-logo");
  await saveBrand(me.id, { logoUrl, iconUrl });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

// 移除品牌 Logo，還原成嵐途預設標記。
export async function removeBrandLogo() {
  const me = await guard();
  await saveBrand(me.id, { logoUrl: null, iconUrl: null });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}
