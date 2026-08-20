"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  createBatch, createCase, markBatchPaid, recalcCase, refundCase, updateCase,
  type CaseInput,
} from "@/lib/comp/caseRepo";
import { submitSurvey } from "@/lib/comp/survey";
import { listAdvisors } from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { validateImport, type ImportRow } from "@/lib/comp/importCases";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "case-not-found": "找不到案件",
  "batch-paid": "該月批次已發放，不能再收案",
  "no-executor": "請選擇執案顧問",
  "no-client": "請填客戶姓名",
  "bad-fee": "顧問費要大於 0",
  "case-closed-invalid": "已退費或作廢的案件不能填問卷",
  "empty-answers": "請至少回答一題",
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
  revalidatePath("/portal");
  revalidatePath("/portal/survey");
}

/**
 * 顧問代填問卷（客戶不方便自己填、或案件沒掛 CRM 客戶時）。
 * 一律標記 submittedBy=coach —— 代填與客戶自填在稽核上不是同一件事。
 */
export async function submitSurveyByCoachAction(input: {
  caseId: string;
  questions: string[];
  answers: string[];
  marketingOptIn: boolean;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    const me = await guard();
    const answers = input.answers.map((a) => (a ?? "").trim());
    if (!answers.some(Boolean)) throw new Error("empty-answers");
    await submitSurvey({
      caseId: input.caseId,
      questions: input.questions,
      answers,
      marketingOptIn: !!input.marketingOptIn,
      submittedBy: "coach",
      submitterId: me.id,
      note: input.note ?? "顧問代填",
    });
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
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


export type ImportPreview = {
  missingHeaders: string[];
  rows: {
    line: number;
    ok: boolean;
    errors: string[];
    display: ImportRow["display"];
  }[];
};

/**
 * 匯入預覽：只驗證、不寫入。
 * 錯一列就整批退回太粗暴，默默跳過又會讓人以為全進來了，
 * 所以先讓人看到「哪幾列有問題、其餘幾筆會進來」再決定。
 */
export async function previewImportAction(csv: string): Promise<
  { ok: true; data: ImportPreview } | { ok: false; error: string }
> {
  try {
    await guard();
    const version = await ensureActiveVersion();
    const [params, peers] = await Promise.all([loadParams(version.id), listAdvisors()]);
    const { rows, missingHeaders } = validateImport(
      csv,
      peers.map((p) => ({ id: p.id, email: p.email, name: p.name, status: p.status })),
      params.modules ?? [],
    );
    return {
      ok: true,
      data: {
        missingHeaders,
        rows: rows.map((r) => ({
          line: r.line, ok: !!r.input, errors: r.errors, display: r.display,
        })),
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, error: MSG[raw] ?? raw };
  }
}

/** 確認匯入：只寫入通過驗證的列，逐筆建立並計算分潤。 */
export async function confirmImportAction(csv: string): Promise<
  { ok: true; note: string } | { ok: false; error: string }
> {
  try {
    await guard();
    const version = await ensureActiveVersion();
    const [params, peers] = await Promise.all([loadParams(version.id), listAdvisors()]);
    const { rows, missingHeaders } = validateImport(
      csv,
      peers.map((p) => ({ id: p.id, email: p.email, name: p.name, status: p.status })),
      params.modules ?? [],
    );
    if (missingHeaders.length) {
      return { ok: false, error: `缺少欄位：${missingHeaders.join("、")}` };
    }
    const valid = rows.filter((r) => r.input);
    for (const r of valid) await createCase(r.input!);
    const skipped = rows.length - valid.length;
    return {
      ok: true,
      note: `已匯入 ${valid.length} 筆${skipped ? `，略過 ${skipped} 筆有問題的列` : ""}`,
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, error: MSG[raw] ?? raw };
  }
}
