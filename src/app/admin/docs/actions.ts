"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getDocSeal, saveDocSeal, saveSet, saveTemplate, setTemplateEnabled, voidInstance, sanitizeTemplateInput } from "@/lib/docsStore";
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
    await voidInstance(id, reason);
    revalidatePath("/admin/docs/instances");
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
