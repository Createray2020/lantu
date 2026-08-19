"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  createBatch, createCase, markBatchPaid, recalcCase, refundCase, updateCase,
  type CaseInput,
} from "@/lib/comp/caseRepo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "case-not-found": "找不到案件",
  "batch-paid": "該月批次已發放，不能再收案",
  "no-executor": "請選擇執案顧問",
  "no-client": "請填客戶姓名",
  "bad-fee": "顧問費要大於 0",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

function touch() {
  revalidatePath("/admin/cases");
  revalidatePath("/admin/advisors");
  revalidatePath("/dashboard/my-business");
}

export async function createCaseAction(input: CaseInput): Promise<ActionResult> {
  try {
    await guard();
    if (!input.executorId) throw new Error("no-executor");
    if (!input.clientName?.trim()) throw new Error("no-client");
    if (!(input.fee > 0)) throw new Error("bad-fee");
    await createCase({ ...input, clientName: input.clientName.trim() });
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCaseAction(
  id: string,
  patch: Partial<CaseInput> & { status?: string },
): Promise<ActionResult> {
  try {
    await guard();
    await updateCase(id, patch);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function recalcCaseAction(id: string): Promise<ActionResult> {
  try {
    await guard();
    await recalcCase(id);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function refundCaseAction(id: string, amount: number): Promise<ActionResult> {
  try {
    await guard();
    await refundCase(id, Math.max(0, amount || 0));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createBatchAction(period: string, payoutDate: string | null): Promise<ActionResult> {
  try {
    await guard();
    await createBatch(period, payoutDate || null);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markBatchPaidAction(batchId: string): Promise<ActionResult> {
  try {
    const me = await guard();
    await markBatchPaid(batchId, me.id);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
