// 回饋問卷（辦法第二十一條）。
//
// 制度上問卷是「結案要件」：沒回收就不計晉升指標。所以這一層做兩件事——
// 提交問卷，以及把案件推進到結案狀態。兩者必須綁在一起，
// 不然會出現「問卷收了但案件還開著」這種對不上的狀態。

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, compCases, compSurveys } from "@/Shared/db/schema";
import type { CompSettings } from "./types";

export type SurveyRecord = typeof compSurveys.$inferSelect;

/** 制度設定的問卷題目；沒設定就退回辦法第二十一條的三題。 */
export const DEFAULT_QUESTIONS = [
  "諮詢前的困擾與期待",
  "諮詢過程中印象最深的環節",
  "諮詢後的具體改變或決定",
];

export function questionsOf(s: CompSettings): string[] {
  const q = s.surveyQuestions;
  return Array.isArray(q) && q.length ? q : DEFAULT_QUESTIONS;
}

export async function getSurvey(caseId: string): Promise<SurveyRecord | null> {
  const r = await db.select().from(compSurveys).where(eq(compSurveys.caseId, caseId)).limit(1);
  return r[0] ?? null;
}

export async function listSurveys(caseIds: string[]): Promise<SurveyRecord[]> {
  if (!caseIds.length) return [];
  return db.select().from(compSurveys).where(inArray(compSurveys.caseId, caseIds));
}

/**
 * 這位客戶端使用者有哪些待填／已填的問卷。
 * 案件是掛在 CRM 的 clients 上，客戶登入帳號是 client_users，
 * 兩者以 clients.clientUserId 相連——沒連上的案件（只有姓名的）客戶端看不到，由顧問代填。
 */
export async function listClientCases(clientUserId: string) {
  return db
    .select({
      id: compCases.id,
      clientName: compCases.clientName,
      moduleCode: compCases.moduleCode,
      fee: compCases.fee,
      signedAt: compCases.signedAt,
      surveyAt: compCases.surveyAt,
      status: compCases.status,
    })
    .from(compCases)
    .innerJoin(clients, eq(compCases.clientId, clients.id))
    .where(and(
      eq(clients.clientUserId, clientUserId),
      or(isNull(compCases.status), inArray(compCases.status, ["open", "closed", "paid"])),
    ))
    .orderBy(desc(compCases.createdAt));
}

/**
 * 提交問卷並結案。
 * 重複提交＝更新同一份（唯一鍵在 caseId），不會長出第二份。
 * 已退費／作廢的案件不受理，否則會把不該計入的案件推回結案狀態。
 */
export async function submitSurvey(input: {
  caseId: string;
  questions: string[];
  answers: string[];
  marketingOptIn: boolean;
  submittedBy: "client" | "coach";
  submitterId: string;
  note?: string | null;
}): Promise<{ closedAt: string }> {
  const c = (await db.select().from(compCases).where(eq(compCases.id, input.caseId)).limit(1))[0];
  if (!c) throw new Error("case-not-found");
  if (c.status === "refunded" || c.status === "void") throw new Error("case-closed-invalid");

  await db.insert(compSurveys).values({
    caseId: input.caseId,
    questions: input.questions,
    answers: input.answers,
    marketingOptIn: input.marketingOptIn,
    submittedBy: input.submittedBy,
    submitterId: input.submitterId,
    note: input.note ?? null,
  }).onConflictDoUpdate({
    target: compSurveys.caseId,
    set: {
      questions: input.questions,
      answers: input.answers,
      marketingOptIn: input.marketingOptIn,
      submittedBy: input.submittedBy,
      submitterId: input.submitterId,
      note: input.note ?? null,
    },
  });

  // 結案日只在第一次提交時寫入 —— 之後補答不該把結案日往後推，
  // 那會讓「哪一年的個案」跟著跳（§20 的年度歸屬看的是這個）。
  const closedAt = c.surveyAt ?? new Date().toISOString().slice(0, 10);
  if (!c.surveyAt) {
    await db.update(compCases)
      .set({
        surveyAt: closedAt,
        status: c.status === "paid" ? "paid" : "closed",
        updatedAt: new Date(),
      })
      .where(eq(compCases.id, input.caseId));
  }
  return { closedAt };
}

/** 已授權作為見證素材的問卷（行銷用）。 */
export async function listTestimonials() {
  return db
    .select({
      caseId: compSurveys.caseId,
      clientName: compCases.clientName,
      questions: compSurveys.questions,
      answers: compSurveys.answers,
      createdAt: compSurveys.createdAt,
    })
    .from(compSurveys)
    .innerJoin(compCases, eq(compSurveys.caseId, compCases.id))
    .where(eq(compSurveys.marketingOptIn, true))
    .orderBy(desc(compSurveys.createdAt));
}
