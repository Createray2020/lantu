"use server";
// 後台「客戶服務」設定：各階段預設期限與檢查清單、假日表、聯絡客服面板、服務回饋問卷。
import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { isStage } from "@/lib/caseEngine";
import { saveStageParam } from "@/lib/caseStore";
import { saveSupportContact } from "@/lib/supportContact";
import { saveFeedbackSettings } from "@/lib/serviceFeedback";
import { db } from "@/Shared/db";
import { orgHolidays } from "@/Shared/db/schema";
import { eq } from "drizzle-orm";

type R = { ok: true } | { ok: false; error: string };
async function guard() { const me = await ensureCoach(); if (!(await isAdmin(me))) throw new Error("forbidden"); return me!; }
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "failed" });
const bump = () => { revalidatePath("/admin/service"); revalidatePath("/portal"); revalidatePath("/dashboard/cases"); };

export async function saveStageParamAction(stage: string, days: number, checklist: { k: string; label: string }[]): Promise<R> {
  try { await guard(); if (!isStage(stage)) return { ok: false, error: "階段不對" }; await saveStageParam(stage, days, checklist); bump(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function saveSupportAction(input: unknown): Promise<R> {
  try { const me = await guard(); await saveSupportContact(input, me.id); bump(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function saveFeedbackSettingsAction(input: unknown): Promise<R> {
  try { const me = await guard(); await saveFeedbackSettings(input, me.id); bump(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function addHolidayAction(day: string, label: string): Promise<R> {
  try {
    await guard();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "日期格式不對" };
    await db.insert(orgHolidays).values({ day, label: label.trim().slice(0, 40) }).onConflictDoUpdate({ target: orgHolidays.day, set: { label: label.trim().slice(0, 40) } });
    bump(); return { ok: true };
  } catch (e) { return fail(e); }
}
export async function removeHolidayAction(day: string): Promise<R> {
  try { await guard(); await db.delete(orgHolidays).where(eq(orgHolidays.day, day)); bump(); return { ok: true }; } catch (e) { return fail(e); }
}
