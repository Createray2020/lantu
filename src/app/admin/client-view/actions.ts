"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { saveClientDashPrefs, resetClientDashPrefs } from "@/lib/clientDashStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: raw === "forbidden" ? "沒有後台權限" : "存檔失敗，請稍後再試" };
}

// 後台是「勾好整份再存」，所以只有整份覆寫這一支。
export async function saveClientDashAction(hidden: string[]): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!me || !(await isAdmin(me))) throw new Error("forbidden");
    await saveClientDashPrefs(hidden);
    revalidatePath("/admin/client-view");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function resetClientDashAction(): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!me || !(await isAdmin(me))) throw new Error("forbidden");
    await resetClientDashPrefs();
    revalidatePath("/admin/client-view");
    return { ok: true };
  } catch (e) { return fail(e); }
}
