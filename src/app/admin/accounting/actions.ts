"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { saveAcctItems, saveAcctParams, saveAcctGoal, saveAcctMonth, ensureAcctMonth, deleteAcctMonth, saveAcctTarget, deleteAcctTarget, saveAcctDraft, setAcctEntryVoid, backfillAcctMonth, saveAcctReceipt, deleteAcctReceipt, markAcctPayout } from "@/lib/acctStore";

export type ActionResult = { ok: true; info?: string } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "invalid-name": "每個營業項目都要有名稱",
  "invalid-id": "項目 id 重複",
  "invalid-ym": "月份格式要是 YYYY-MM",
  "invalid-date": "匯款日期要填",
  "invalid-item": "要選一個營業項目",
  "invalid-amount": "匯款金額要大於 0",
  "invalid-payee": "受款人不能空白",
};
function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}
async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
}
const refresh = () => revalidatePath("/admin/accounting");

export async function saveAcctItemsAction(items: unknown): Promise<ActionResult> {
  try { await guard(); await saveAcctItems(items); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function saveAcctParamsAction(params: unknown): Promise<ActionResult> {
  try { await guard(); await saveAcctParams(params); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function saveAcctGoalAction(goal: unknown): Promise<ActionResult> {
  try { await guard(); await saveAcctGoal(goal); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function saveAcctMonthAction(ym: string, month: unknown): Promise<ActionResult> {
  try { await guard(); await saveAcctMonth(ym, month); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function ensureAcctMonthAction(ym: string): Promise<ActionResult> {
  try { await guard(); await ensureAcctMonth(ym); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function deleteAcctMonthAction(ym: string): Promise<ActionResult> {
  try { await guard(); await deleteAcctMonth(ym); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function saveAcctTargetAction(ym: string, target: unknown): Promise<ActionResult> {
  try { await guard(); await saveAcctTarget(ym, target); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function deleteAcctTargetAction(ym: string): Promise<ActionResult> {
  try { await guard(); await deleteAcctTarget(ym); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function saveAcctDraftAction(draft: unknown): Promise<ActionResult> {
  try { await guard(); await saveAcctDraft(draft); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setAcctEntryVoidAction(id: string, v: boolean): Promise<ActionResult> {
  try { await guard(); await setAcctEntryVoid(id, v); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function backfillAcctMonthAction(ym: string): Promise<ActionResult> {
  try { await guard(); const r = await backfillAcctMonth(ym); refresh(); return { ok: true, info: `報聘 ${r.apply} 筆、培訓帳號 ${r.license} 筆` }; } catch (e) { return fail(e); }
}
export async function saveAcctReceiptAction(id: string | null, receipt: unknown): Promise<ActionResult> {
  try { await guard(); const rid = await saveAcctReceipt(id, receipt); refresh(); return { ok: true, info: rid }; } catch (e) { return fail(e); }
}
export async function deleteAcctReceiptAction(id: string): Promise<ActionResult> {
  try { await guard(); await deleteAcctReceipt(id); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function markAcctPayoutAction(ym: string, payee: string, mark: unknown): Promise<ActionResult> {
  try { await guard(); await markAcctPayout(ym, payee, mark); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
