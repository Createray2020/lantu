"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { saveModule } from "@/lib/platformModules";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: raw === "forbidden" ? "沒有後台權限" : "存檔失敗，請稍後再試" };
}

// ⚠️ 這支是「全公司看得到什麼」的開關，只認後台權限（isAdmin），
//    不走 requireWritableCoach()——使用期限是個人的事，不該連帶決定平台模組開不開。
export async function setModuleAction(
  key: string,
  enabled: boolean,
  notice: string | null,
): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!me || !(await isAdmin(me))) throw new Error("forbidden");
    await saveModule(key, enabled, notice, me.id);
    revalidatePath("/admin/modules");
    revalidatePath("/dashboard/learn");
    return { ok: true };
  } catch (e) { return fail(e); }
}
