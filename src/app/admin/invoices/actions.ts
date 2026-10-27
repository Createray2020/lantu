"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { upsertInvoice, type InvoiceInput } from "@/lib/serviceStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveInvoiceAction(caseType: "client_service" | "training", caseId: string, input: InvoiceInput): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!(await isAdmin(me))) return { ok: false, error: "沒有後台權限" };
    if (caseType !== "client_service" && caseType !== "training") return { ok: false, error: "案件類型不正確" };
    await upsertInvoice(caseType, caseId, input, me!.id);
    revalidatePath("/admin/invoices");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
