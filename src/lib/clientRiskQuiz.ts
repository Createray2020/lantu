// 客戶自己填的投資風險屬性測驗（2026/09/01）。
//
// Ray：「投資屬性問卷勾選給客戶可以填，有『邀請客戶填寫』的按鈕然後送出，
//       客戶端用跳出浮動框。」
//
// ⚠️⚠️ 這條線刻意跟區塊註記同一個形狀：**客戶寫的東西住自己的表**，
//    教練看到之後決定要不要「套用到這份規劃」。客戶端對 plans 的 save() 永遠是 noop，
//    這是整個雙邊平台的地基，不要為了少一張表就讓客戶端直接寫 plans.data。
// ⚠️ 分數與等級一律由伺服器用 riskQuiz.ts 重算——客戶端送上來的只有選項索引。
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientRiskQuiz } from "@/Shared/db/schema";
import { normalizeAnswers, scoreAnswers, tierOf, RISK_QUESTIONS, type RiskAnswers } from "./riskQuiz";
import { quizWho, type QuizWho } from "./riskQuizTodo";

// 2026/10/27 B-2：一位客戶兩份——who='self' 本人／'spouse' 配偶（客戶替配偶填）。
// 所有函式多一個 who，預設 self，既有呼叫行為不變；PK 是 (client_id, who)。
export type ClientQuizRow = {
  clientId: string;
  who: QuizWho;
  answers: RiskAnswers;
  score: number | null;
  tier: string | null;
  invitedAt: string | null;
  submittedAt: string | null;
};

function toRow(r: typeof clientRiskQuiz.$inferSelect): ClientQuizRow {
  return {
    clientId: r.clientId,
    who: quizWho(r.who),
    answers: (r.answers ?? {}) as RiskAnswers,
    score: r.score,
    tier: r.tier,
    invitedAt: r.invitedAt ? r.invitedAt.toISOString() : null,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
  };
}

export async function getClientQuiz(clientId: string, who: QuizWho = "self"): Promise<ClientQuizRow | null> {
  const [row] = await db.select().from(clientRiskQuiz)
    .where(and(eq(clientRiskQuiz.clientId, clientId), eq(clientRiskQuiz.who, who))).limit(1);
  return row ? toRow(row) : null;
}

/** 兩份一次拿（教練端規劃器 lantu:init 用）。 */
export async function getClientQuizzes(clientId: string): Promise<{ self: ClientQuizRow | null; spouse: ClientQuizRow | null }> {
  const rows = await db.select().from(clientRiskQuiz).where(eq(clientRiskQuiz.clientId, clientId));
  const out: { self: ClientQuizRow | null; spouse: ClientQuizRow | null } = { self: null, spouse: null };
  for (const r of rows) out[quizWho(r.who)] = toRow(r);
  return out;
}

/**
 * 教練按「邀請客戶填寫」。
 *
 * ⚠️ 重新邀請＝同一列把 answers/score/tier/submittedAt 清掉重來，不留歷史——
 *    教練要的是「他現在的屬性」，不是一份作答歷程；留兩份反而會有「哪一份才算數」的問題。
 * ⚠️ 一位客戶只有一列（PK 就是 client_id），所以這一支是冪等的：重按只是把邀請時間往後推。
 */
export async function inviteClientQuiz(clientId: string, who: QuizWho = "self"): Promise<ClientQuizRow> {
  const now = new Date();
  const [row] = await db
    .insert(clientRiskQuiz)
    .values({ clientId, who, answers: {}, score: null, tier: null, invitedAt: now, submittedAt: null, updatedAt: now })
    .onConflictDoUpdate({
      target: [clientRiskQuiz.clientId, clientRiskQuiz.who],
      set: { answers: {}, score: null, tier: null, invitedAt: now, submittedAt: null, updatedAt: now },
    })
    .returning();
  return toRow(row);
}

/** 教練收掉邀請（客戶當面填完了、或決定不用問卷）。沒有列時什麼都不做。 */
export async function cancelClientQuizInvite(clientId: string, who: QuizWho = "self"): Promise<void> {
  await db
    .update(clientRiskQuiz)
    .set({ invitedAt: null, updatedAt: new Date() })
    .where(and(eq(clientRiskQuiz.clientId, clientId), eq(clientRiskQuiz.who, who), isNull(clientRiskQuiz.submittedAt)));
}

export type SubmitResult = { ok: true; row: ClientQuizRow } | { ok: false; error: string };

/**
 * 客戶送出作答。
 *
 * ⚠️ 一定要 12 題全部作答才算完成——沒答完就沒有等級（跟教練端 riskProfile() 同一條規則），
 *    存一份半成品進去只會讓教練以為客戶填過了。
 * ⚠️ 沒有被邀請過的客戶也允許送（他可能是從待辦清單點進來的），但一定要先有那一列，
 *    所以走 insert…on conflict 而不是 update。
 */
export async function submitClientQuiz(clientId: string, rawAnswers: unknown, who: QuizWho = "self"): Promise<SubmitResult> {
  const answers = normalizeAnswers(rawAnswers);
  const r = scoreAnswers(answers);
  if (r.answered < RISK_QUESTIONS.length) {
    return { ok: false, error: `還有 ${RISK_QUESTIONS.length - r.answered} 題沒有作答` };
  }
  const now = new Date();
  const tier = tierOf(r.score).name;
  const [row] = await db
    .insert(clientRiskQuiz)
    .values({ clientId, who, answers, score: r.score, tier, invitedAt: null, submittedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [clientRiskQuiz.clientId, clientRiskQuiz.who],
      // 送出＝邀請完成，invitedAt 收掉，客戶端的浮動框就不會再跳。
      set: { answers, score: r.score, tier, invitedAt: null, submittedAt: now, updatedAt: now },
    })
    .returning();
  if (who === "self") { const { onQuizSubmitted } = await import("./caseSignals"); await onQuizSubmitted(clientId); }
  return { ok: true, row: toRow(row) };
}

/** 客戶端首頁要不要跳浮動框：被邀請了、而且還沒送出。 */
export async function pendingInvite(clientId: string, who: QuizWho = "self"): Promise<boolean> {
  const [row] = await db
    .select({ id: clientRiskQuiz.clientId })
    .from(clientRiskQuiz)
    .where(and(eq(clientRiskQuiz.clientId, clientId), eq(clientRiskQuiz.who, who), isNotNull(clientRiskQuiz.invitedAt), isNull(clientRiskQuiz.submittedAt)))
    .limit(1);
  return !!row;
}

/** 兩份的待填狀態一次拿（/portal 首頁）。 */
export async function pendingInvites(clientId: string): Promise<{ self: boolean; spouse: boolean }> {
  const rows = await db
    .select({ who: clientRiskQuiz.who })
    .from(clientRiskQuiz)
    .where(and(eq(clientRiskQuiz.clientId, clientId), isNotNull(clientRiskQuiz.invitedAt), isNull(clientRiskQuiz.submittedAt)));
  const out = { self: false, spouse: false };
  for (const r of rows) out[quizWho(r.who)] = true;
  return out;
}
