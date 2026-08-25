"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { saveAnDefaults, resetAnDefaults } from "@/lib/anDefaults";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "module-list-mismatch": "模組清單對不上（畫面可能是舊版，請重新整理再存一次）",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? "存檔失敗，請稍後再試" };
}

// 後台是「排好整串再存」，所以只有整份覆寫這一支，沒有逐列存。
export async function saveAnDefaultsAction(order: string[], hidden: string[]): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!me || !(await isAdmin(me))) throw new Error("forbidden");
    await saveAnDefaults({ order, hidden });
    revalidatePath("/admin/analysis");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function resetAnDefaultsAction(): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!me || !(await isAdmin(me))) throw new Error("forbidden");
    await resetAnDefaults();
    revalidatePath("/admin/analysis");
    return { ok: true };
  } catch (e) { return fail(e); }
}
