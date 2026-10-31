"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getDocSeal, saveDocSeal, saveSet, saveTemplate, setTemplateEnabled, voidInstance, sanitizeTemplateInput, saveDocSettings, createDocTask, deleteTemplate } from "@/lib/docsStore";
import { renderTemplate, validateTemplate } from "@/lib/docs";
import { SAMPLE_VARS } from "@/lib/docsVars";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "invalid-png": "只接受 PNG 圖片（透明底），而且不能太大",
  "invalid-kind": "組合類型不正確",
  "missing-ref": "沒有指定方案",
};
const fail = (e: unknown): ActionResult => {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
};

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

const PATHS = ["/admin/docs"];
const bump = () => PATHS.forEach((p) => revalidatePath(p));

/** 存範本（沒 key＝新文件；有 key＝新版本）。 */
export async function saveTemplateAction(input: unknown): Promise<ActionResult & { id?: string; key?: string; version?: number }> {
  try {
    const me = await guard();
    const row = await saveTemplate(input, me.id);
    bump();
    return { ok: true, id: row.id, key: row.key, version: row.version };
  } catch (e) {
    return fail(e);
  }
}

export async function setTemplateEnabledAction(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    await guard();
    await setTemplateEnabled(id, enabled);
    bump();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSetAction(kind: string, ref: string, keys: string[]): Promise<ActionResult> {
  try {
    await guard();
    await saveSet(kind, ref, keys);
    bump();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSealAction(img: string | null): Promise<ActionResult> {
  try {
    const me = await guard();
    await saveDocSeal(img, me.id);
    bump();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function voidInstanceAction(id: string, reason: string): Promise<ActionResult> {
  try {
    await guard();
    const r = await voidInstance(id, reason);
    if (!r.ok) return { ok: false, error: r.error ?? "作廢失敗" };
    revalidatePath("/admin/docs/instances");
    revalidatePath("/admin/inbox");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 用示範變數渲染一次，給後台「預覽」看——不存任何東西。 */
export async function previewTemplateAction(input: unknown): Promise<{ ok: true; html: string; warnings: string[] } | { ok: false; error: string }> {
  try {
    await guard();
    const t = sanitizeTemplateInput(input);
    const errs = validateTemplate(t);
    const seal = (await getDocSeal()).img;
    const html = renderTemplate(t, SAMPLE_VARS, { seal });
    return { ok: true, html, warnings: errs };
  } catch (e) {
    const r = fail(e);
    return { ok: false, error: r.ok ? "" : r.error };
  }
}

/** 催簽天數等設定。 */
export async function saveDocSettingsAction(input: { nudgeDays: number }): Promise<ActionResult> {
  try {
    const me = await guard();
    await saveDocSettings(input, me.id);
    bump();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type DocTaskBatchLine = { templateKey: string; title: string; created: number; already: string[]; skipped: string[]; error: string | null };
/**
 * 建立補簽任務（LT04，2026/10/29）：多份範本 × 一批既有教練 × 共用期限與備註。
 * 每份範本各自一張任務、各自追蹤；同版本已待簽／已簽的人自動略過；某一份失敗不影響其他份，逐份回報。
 */
export async function createDocTaskAction(input: { templateKeys?: string[]; templateKey?: string; coachIds: string[]; deadline: string | null; note?: string }): Promise<ActionResult & { created?: number; skipped?: string[]; lines?: DocTaskBatchLine[] }> {
  try {
    const me = await guard();
    const keys = [...new Set([...(input.templateKeys ?? []), ...(input.templateKey ? [input.templateKey] : [])].filter(Boolean))];
    if (!keys.length) return { ok: false, error: "請選至少一份文件" };
    if (!input.coachIds.filter(Boolean).length) return { ok: false, error: "請選至少一位對象" };
    const lines: DocTaskBatchLine[] = [];
    for (const key of keys) {
      try {
        const r = await createDocTask({ templateKey: key, coachIds: input.coachIds, deadline: input.deadline, note: input.note }, me.id);
        if (!r.ok) { lines.push({ templateKey: key, title: key, created: 0, already: [], skipped: [], error: r.error }); continue; }
        lines.push({ templateKey: key, title: r.title, created: r.created, already: r.already, skipped: r.skipped, error: null });
      } catch (e) {
        lines.push({ templateKey: key, title: key, created: 0, already: [], skipped: [], error: e instanceof Error ? e.message : "建立失敗" });
      }
    }
    revalidatePath("/admin/docs/tasks");
    revalidatePath("/dashboard/docs");
    revalidatePath("/dashboard");
    return { ok: true, created: lines.reduce((a, l) => a + l.created, 0), skipped: lines.flatMap((l) => l.skipped), lines };
  } catch (e) {
    return fail(e);
  }
}

/** 刪除範本：沒用過真刪、用過封存（docsStore.deleteTemplate）。 */
export async function deleteTemplateAction(key: string): Promise<ActionResult & { mode?: "deleted" | "archived" }> {
  try {
    await guard();
    const r = await deleteTemplate(key);
    if (!r.ok) return r;
    bump();
    revalidatePath("/admin/docs/tasks");
    return { ok: true, mode: r.mode };
  } catch (e) {
    return fail(e);
  }
}
