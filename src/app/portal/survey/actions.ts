"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, compCases } from "@/Shared/db/schema";
import { ensureClientUser } from "@/lib/clientUser";
import { submitSurvey, questionsOf } from "@/lib/comp/survey";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  "not-signed-in": "請先登入",
  "not-your-case": "找不到這筆服務紀錄",
  "case-not-found": "找不到這筆服務紀錄",
  "case-closed-invalid": "這筆服務已退費或作廢，無法填寫",
  "empty-answers": "請至少回答一題",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

/**
 * 客戶自己送出問卷。
 * 案件歸屬一律在伺服器端重查一次（不信任前端傳來的 caseId）——
 * 少了這道，任何登入者都能靠改 id 讀寫別人的案件。
 *
 * ⚠️ 題目（questions）也一樣不收前端的：舊版把前端傳來的字串原樣存進 compSurveys，
 *    而勾了 marketingOptIn 的那筆會進見證素材 —— 等於任何客戶都能自訂
 *    「嵐途替我做了什麼」這句話的題幹，再讓它掛著公司名字對外展示。
 *    題目一律由伺服器從生效版制度設定取（跟 /portal/survey 頁面同一個來源）。
 */
export async function submitClientSurveyAction(input: {
  caseId: string;
  answers: string[];
  marketingOptIn: boolean;
}): Promise<ActionResult> {
  try {
    const me = await ensureClientUser();
    if (!me) throw new Error("not-signed-in");

    const rows = await db
      .select({ id: compCases.id })
      .from(compCases)
      .innerJoin(clients, eq(compCases.clientId, clients.id))
      .where(and(eq(compCases.id, input.caseId), eq(clients.clientUserId, me.id)))
      .limit(1);
    if (!rows[0]) throw new Error("not-your-case");

    const answers = input.answers.map((a) => (a ?? "").trim());
    if (!answers.some(Boolean)) throw new Error("empty-answers");

    const version = await ensureActiveVersion();
    const params = await loadParams(version.id);
    const questions = questionsOf(params.settings);

    await submitSurvey({
      caseId: input.caseId,
      questions,
      answers,
      marketingOptIn: !!input.marketingOptIn,
      submittedBy: "client",
      submitterId: me.id,
    });
    revalidatePath("/portal");
    revalidatePath("/portal/survey");
    revalidatePath("/admin/cases");
    revalidatePath("/dashboard/my-business");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
