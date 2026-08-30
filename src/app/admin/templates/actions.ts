"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  addTemplatePlan,
  createTemplate,
  purgeTemplate,
  setTemplateArchived,
  reorderTemplates,
  updateTemplate,
  updateTemplatePlan,
  type TemplateInput,
} from "@/lib/templates";

// 後台「示範範本」的 server actions。
//
// ⚠️ 授權檢查有兩層，而且**兩層都要留著**：
//    真正的底線在 lib/templates.ts 每一支函式裡的 assertAdmin()——那是不管誰、
//    從哪個入口呼叫都跑得到的一道，理由寫在那個檔案上方（授權只放在 action 層，
//    加第二個入口時必然漏掉一個，而漏掉的那一個就是「任何教練都改得動全公司的展示素材」）。
//    這裡的 guard() 是同一件事再擋一次：/admin 底下每一支 actions 都看得到自己的閘，
//    是 lib/guard.drift.test.ts 逐檔在掃的規矩。重複的是「拒絕」，不是「放行」，
//    所以多一道只會更嚴，不會更鬆。
//
// 這一層另外負責：把例外翻成看得懂的中文，以及 revalidate。

export type ActionResult = { ok: true } | { ok: false; error: string };

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
}

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "template-not-found": "找不到這份範本（可能已經下架了）",
  "bad-plan-data": "這份規劃內容的格式不對，沒有存進去",
  "no-name": "請填範本名稱",
};

function fail(e: unknown): { ok: false; error: string } {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

function touch() {
  revalidatePath("/admin/templates");
  // 教練端的範本區塊也要跟著更新——後台剛下架的範本不該還留在別人的清單上。
  revalidatePath("/dashboard/clients");
}

export async function createTemplateAction(
  input: TemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await guard();
    const name = (input.name ?? "").trim();
    if (!name) throw new Error("no-name");
    const id = await createTemplate({ ...input, name });
    touch();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTemplateAction(
  id: string,
  patch: Partial<TemplateInput>,
): Promise<ActionResult> {
  try {
    await guard();
    // 空字串的名稱會讓清單上出現一列沒有標題的東西，誰都認不出那是什麼。
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("no-name");
    await updateTemplate(id, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 上架／下架。下架只是隱藏，內容一個字都不會少（見 lib/templates.ts）。 */
export async function setTemplateArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  try {
    await guard();
    await setTemplateArchived(id, archived);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 永久刪除。⚠️ 資料層只准刪「已下架」的那一列，所以按到這顆的人一定先經過下架那一步。
 */
export async function purgeTemplateAction(id: string): Promise<ActionResult> {
  try {
    await guard();
    await purgeTemplate(id);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reorderTemplatesAction(ids: string[]): Promise<ActionResult> {
  try {
    await guard();
    await reorderTemplates(ids);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addTemplatePlanAction(
  templateId: string,
  year: number,
  label?: string | null,
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  try {
    await guard();
    const y = Math.trunc(Number(year));
    // 年度用來組唯一鍵（client_id + year + track），不是自由文字。
    if (!(y >= 1900 && y <= 2200)) throw new Error("年度請填 1900–2200 之間的西元年");
    const planId = await addTemplatePlan(templateId, y, label ?? null);
    touch();
    revalidatePath(`/admin/templates/${templateId}`);
    return { ok: true, planId };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 範本內容自動存檔（編輯器每次 save 都會打這支）。
 *
 * ⚠️ 這支的節流在前端（components/TemplateFrame 的 700ms debounce）。
 *    這裡**不 revalidate 內容頁**——打字時整頁重新渲染會把 iframe 重掛，
 *    使用者的游標會跳掉。只在離開頁面時由清單頁自己重讀快照。
 */
export async function saveTemplatePlanAction(planId: string, data: unknown): Promise<ActionResult> {
  try {
    await guard();
    await updateTemplatePlan(planId, data);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
