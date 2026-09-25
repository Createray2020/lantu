"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { itemProblem, sanitizeNav, type NavItem } from "@/lib/siteNav";
import { resetSiteNav, saveSiteNav } from "@/lib/siteNavStore";

export type SaveResult = { ok: true; items: NavItem[] } | { ok: false; error: string };

// ⚠️ 只認後台權限（isAdmin）：官網頂欄是公司對外門面，與教練個人的使用期限無關
//    （同 /admin/modules、公司行事曆的理由）。
async function guard() {
  const me = await ensureCoach();
  if (!me || !(await isAdmin(me))) throw new Error("forbidden");
  return me;
}

function fail(e: unknown): { ok: false; error: string } {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: raw === "forbidden" ? "沒有後台權限" : "存檔失敗，請稍後再試" };
}

export async function saveSiteNavAction(items: NavItem[]): Promise<SaveResult> {
  try {
    const me = await guard();
    // 前端已擋過，這裡再擋一次：sanitize 會「丟掉」壞項目，但使用者按儲存時
    // 應該被告知哪一項沒填好，而不是存完發現少了一個。
    const bad = (Array.isArray(items) ? items : []).map((it) => ({ it, p: itemProblem(it) })).find((x) => x.p);
    if (bad) return { ok: false, error: `「${bad.it.text || "未命名"}」：${bad.p}` };
    const saved = await saveSiteNav(sanitizeNav(items), me.id);
    revalidatePath("/home");
    revalidatePath("/");
    return { ok: true, items: saved };
  } catch (e) { return fail(e); }
}

export async function resetSiteNavAction(): Promise<SaveResult> {
  try {
    await guard();
    await resetSiteNav();
    revalidatePath("/home");
    revalidatePath("/");
    return { ok: true, items: sanitizeNav(null) };
  } catch (e) { return fail(e); }
}
