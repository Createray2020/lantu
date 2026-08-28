// 一場諮詢：把「這次談了什麼」變成諮詢過程的副產品，而不是事後回想補寫的作業。
//
// 三件事同時由它解決：
//   1. 摘要的範圍不用猜——這一場裡寫的，就是這一場的。
//   2. 開場那一刻釘住一版 → 「回到上次諮詢開始時的狀態」（現有的還原功能
//      叫「第 37 版」，諮詢當下沒有人想得起來去點它）。
//   3. metricsBefore/After → 摘要開頭那句「這次改善了多少」。
//
// ⚠️ 開場／結束一律只有主責教練（ownedClient）。協作教練能寫註記，但不能開場。
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientNotes, clients, consultSessions, planRevisions, plans } from "@/Shared/db/schema";
import { ownedClient } from "./clientScope";
import { sessionMetrics, type SessionMetrics } from "./snapshot";
import { createActionItem, createReview } from "./reviews";
import { notesOfSession } from "./notes";

export type SessionRow = {
  id: string;
  clientId: string;
  coachId: string;
  planId: string | null;
  revisionId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  closeReason: string | null;
  reviewId: string | null;
  metricsBefore: unknown;
  metricsAfter: unknown;
  closingNote: string | null;
  draftSummary: string | null;
};

const COLS = {
  id: consultSessions.id,
  clientId: consultSessions.clientId,
  coachId: consultSessions.coachId,
  planId: consultSessions.planId,
  revisionId: consultSessions.revisionId,
  startedAt: consultSessions.startedAt,
  endedAt: consultSessions.endedAt,
  closeReason: consultSessions.closeReason,
  reviewId: consultSessions.reviewId,
  metricsBefore: consultSessions.metricsBefore,
  metricsAfter: consultSessions.metricsAfter,
  closingNote: consultSessions.closingNote,
  draftSummary: consultSessions.draftSummary,
};

async function assertOwned(coachId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), ownedClient(coachId)))
    .limit(1);
  return !!row;
}

/** 目前這位客戶有沒有一場開著的諮詢。 */
export async function openSession(clientId: string): Promise<SessionRow | null> {
  const [row] = await db
    .select(COLS)
    .from(consultSessions)
    .where(and(eq(consultSessions.clientId, clientId), isNull(consultSessions.endedAt)))
    .limit(1);
  return row ?? null;
}

export async function listSessions(clientId: string, limit = 40): Promise<SessionRow[]> {
  return db
    .select(COLS)
    .from(consultSessions)
    .where(eq(consultSessions.clientId, clientId))
    .orderBy(desc(consultSessions.startedAt))
    .limit(limit);
}

/** 開場當下的最新一版，就是這一場的還原點。 */
async function latestRevision(planId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: planRevisions.id })
    .from(planRevisions)
    .where(eq(planRevisions.planId, planId))
    .orderBy(desc(planRevisions.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export type StartOutcome = { ok: true; session: SessionRow; adopted: number } | { ok: false; error: string };

/**
 * 開始一場諮詢。
 *
 * @param adoptLoose 把「日常維護」的註記帶進這一場當議程
 *                   （諮詢前一天自己先看資料寫下的問題，開場時一鍵變成議程）。
 */
export async function startSession(
  coachId: string,
  clientId: string,
  planId: string | null,
  adoptLoose: boolean,
): Promise<StartOutcome> {
  if (!(await assertOwned(coachId, clientId))) return { ok: false, error: "只有主責教練能開始諮詢" };

  // 忘記按結束是必然會發生的：開新的一場就自動封掉上一場，
  // 而不是丟一個「你還有一場沒結束」的錯誤把人擋在門外。
  await db
    .update(consultSessions)
    .set({ endedAt: new Date(), closeReason: "superseded" })
    .where(and(eq(consultSessions.clientId, clientId), isNull(consultSessions.endedAt)));

  let before: SessionMetrics | null = null;
  let revisionId: string | null = null;
  if (planId) {
    const [p] = await db.select({ data: plans.data }).from(plans).where(eq(plans.id, planId)).limit(1);
    if (p) before = sessionMetrics(p.data);
    revisionId = await latestRevision(planId);
  }

  const [row] = await db
    .insert(consultSessions)
    .values({ clientId, coachId, planId, revisionId, metricsBefore: before })
    .returning(COLS);

  let adopted = 0;
  if (adoptLoose) {
    const res = await db
      .update(clientNotes)
      .set({ sessionId: row.id, updatedAt: new Date() })
      .where(and(eq(clientNotes.clientId, clientId), isNull(clientNotes.sessionId)))
      .returning({ id: clientNotes.id });
    adopted = res.length;
  }
  return { ok: true, session: row, adopted };
}

export type EndInput = {
  /** 這一場的「決定」裡，哪幾則要給客戶看（批次勾選的結果）。 */
  visibleNoteIds?: string[];
  /** 收尾時教練自己寫的一整段（訪談問卷的最後一題）。 */
  closingNote?: string | null;
};

export type EndOutcome =
  | { ok: true; session: SessionRow; draft: string; todos: string[] }
  | { ok: false; error: string };

/** 一份還沒存成正式紀錄的草稿（按了結束但沒存檔就把視窗關掉）。 */
export type PendingDraft = {
  sessionId: string;
  planId: string | null;
  endedAt: Date | null;
  draft: string;
  todos: string[];
};

/**
 * 結束諮詢，產出**草稿**並封場。
 *
 * ⚠️⚠️ 2026/08/28 起這裡不再直接寫 review。原因（教練回饋）：
 * 「結束並摘要」產出的內容跟教練實際談的幾乎無關、而且只有一句話——因為 buildSummary()
 * 只讀得到「教練在區塊上留的註記」，系統沒有任何談話內容可讀（沒錄音、沒逐字稿）。
 * 教練的心智模型是「AI 幫我摘要這場談話」，跟系統實際能做的事對不起來。
 * 而他真正的用法是**事後把 AI 整理好的一大段貼進來**，日期還是過去的某一天，
 * 但這條路的 review 日期是寫死 new Date() 的今天。
 *
 * 所以拆成兩段：這裡定案可見性、算後指標、產草稿、封場；
 * 教練在表單裡改完（可改日期、類型、貼全文）按存檔才走 saveSessionRecord()。
 *
 * ⚠️ 草稿一定要落地（draft_summary）：場次已封而紀錄還沒生出來的空窗，
 * 中間把視窗關掉就是資料損失——違反「忘記按結束絕不能造成資料損失」那條原則。
 *
 * 順序仍然有意義：先把「客戶可見」定案 → 再產摘要文字。反過來的話，
 * 摘要會用到還沒定案的可見性，印出去的內容跟教練勾的不一樣。
 * ⚠️ 合規：批次勾「客戶可見」刻意留在按下結束的這一刻，不搬進表單——
 * 那是教練正在決定要跟客戶講什麼的時間點。
 */
export async function endSession(coachId: string, sessionId: string, input: EndInput): Promise<EndOutcome> {
  const [s] = await db.select(COLS).from(consultSessions).where(eq(consultSessions.id, sessionId)).limit(1);
  if (!s) return { ok: false, error: "找不到這一場諮詢" };
  if (!(await assertOwned(coachId, s.clientId))) return { ok: false, error: "只有主責教練能結束諮詢" };
  if (s.endedAt) return { ok: false, error: "這一場已經結束了" };

  // 1) 定案「客戶可見」。⚠️ 只動主責自己寫的列：協作教練與客戶寫的永遠不對客戶公開。
  const wanted = new Set(input.visibleNoteIds ?? []);
  const all = await notesOfSession(sessionId);
  for (const nrow of all) {
    if (nrow.authorAccess !== "owner" || nrow.kind !== "decision") continue;
    const want = wanted.has(nrow.id);
    if (nrow.visible !== want) {
      await db.update(clientNotes).set({ visible: want, updatedAt: new Date() }).where(eq(clientNotes.id, nrow.id));
    }
  }

  // 2) 後指標
  let after: SessionMetrics | null = null;
  if (s.planId) {
    const [p] = await db.select({ data: plans.data }).from(plans).where(eq(plans.id, s.planId)).limit(1);
    if (p) after = sessionMetrics(p.data);
  }

  // 3) 摘要草稿（還不是正式紀錄）
  const fresh = await notesOfSession(sessionId);
  const draft = buildSummary(fresh, s.metricsBefore as SessionMetrics | null, after, input.closingNote ?? null);
  const todos = fresh.filter((n) => n.kind === "todo").map((n) => n.body.slice(0, 200));

  // 4) 封場＋草稿落地。⚠️ 這裡**不**產 review、也**不**產 action_items——
  //    那兩件事等教練在表單按存檔（saveSessionRecord）才做。
  const [row] = await db
    .update(consultSessions)
    .set({
      endedAt: new Date(),
      closeReason: "manual",
      metricsAfter: after,
      closingNote: input.closingNote ?? null,
      draftSummary: draft,
    })
    .where(eq(consultSessions.id, sessionId))
    .returning(COLS);

  return { ok: true, session: row, draft, todos };
}

/**
 * 把草稿存成正式的諮詢紀錄。
 *
 * 這是「一場諮詢」與「手動補記」合併之後的唯一出口：不論當場結束還是事後補寫，
 * 都是同一個表單、同一條路。教練可以改日期（補記過去的諮詢）、改類型、貼一整段全文。
 */
export type SaveRecordInput = {
  date: string;
  type: string;
  planId?: string | null;
  attendees?: string | null;
  summary?: string | null;
  nextAppt?: string | null;
};
export type SaveRecordOutcome =
  | { ok: true; reviewId: string; todos: number }
  | { ok: false; error: string };

export async function saveSessionRecord(
  coachId: string,
  sessionId: string,
  input: SaveRecordInput,
): Promise<SaveRecordOutcome> {
  const [s] = await db.select(COLS).from(consultSessions).where(eq(consultSessions.id, sessionId)).limit(1);
  if (!s) return { ok: false, error: "找不到這一場諮詢" };
  if (!(await assertOwned(coachId, s.clientId))) return { ok: false, error: "只有主責教練能存這一場的紀錄" };
  if (s.reviewId) return { ok: false, error: "這一場的紀錄已經存過了" };

  const reviewId = await createReview(coachId, s.clientId, {
    date: input.date,
    type: input.type,
    planId: input.planId !== undefined ? input.planId : s.planId,
    attendees: input.attendees ?? null,
    summary: input.summary ?? null,
    nextAppt: input.nextAppt ?? null,
  });

  // 待辦 → action_items（這個功能一出生就有下游）。放在存檔這一步，
  // 才不會「按了結束就先冒出一堆待辦、但紀錄根本還沒存」。
  const fresh = await notesOfSession(sessionId);
  let todos = 0;
  for (const nrow of fresh) {
    if (nrow.kind !== "todo") continue;
    await createActionItem(coachId, s.clientId, { title: nrow.body.slice(0, 200), reviewId });
    todos++;
  }

  await db
    .update(consultSessions)
    .set({ reviewId, draftSummary: null })
    .where(eq(consultSessions.id, sessionId));

  return { ok: true, reviewId, todos };
}

/**
 * 這位客戶有沒有「按了結束但沒存」的草稿。
 *
 * ⚠️ 只認手動結束的（closeReason='manual'）：自動封場刻意不產草稿，
 * 沒人整理過的東西不該變成待處理的提醒，不然每次忘記按結束都會冒一條。
 */
export async function pendingDraft(clientId: string): Promise<PendingDraft | null> {
  const [row] = await db
    .select(COLS)
    .from(consultSessions)
    .where(
      and(
        eq(consultSessions.clientId, clientId),
        isNull(consultSessions.reviewId),
        sql`${consultSessions.draftSummary} is not null`,
      ),
    )
    .orderBy(desc(consultSessions.endedAt))
    .limit(1);
  if (!row) return null;
  const fresh = await notesOfSession(row.id);
  return {
    sessionId: row.id,
    planId: row.planId,
    endedAt: row.endedAt,
    draft: row.draftSummary ?? "",
    todos: fresh.filter((n) => n.kind === "todo").map((n) => n.body.slice(0, 200)),
  };
}

/** 教練決定這一場不留紀錄：丟掉草稿（場次本身保留，還原點還在）。 */
export async function discardDraft(coachId: string, sessionId: string): Promise<boolean> {
  const [s] = await db.select(COLS).from(consultSessions).where(eq(consultSessions.id, sessionId)).limit(1);
  if (!s) return false;
  if (!(await assertOwned(coachId, s.clientId))) return false;
  await db.update(consultSessions).set({ draftSummary: null }).where(eq(consultSessions.id, sessionId));
  return true;
}

/** 摘要文字。開頭那句是「改善了多少」——評判標準是比原本更優化，不是補平。 */
export function buildSummary(
  notes: { kind: string; body: string; visible: boolean; authorName: string | null }[],
  before: SessionMetrics | null,
  after: SessionMetrics | null,
  closingNote?: string | null,
): string {
  const lines: string[] = [];
  // 教練自己寫的那一段排在最前面——它是「這場談了什麼」的人話版本，
  // 底下逐條列的決定與依據是它的佐證，不是反過來。
  const closing = (closingNote ?? "").trim();
  if (closing) lines.push(closing, "");
  const b = before?.shortPV ?? null;
  const a = after?.shortPV ?? null;
  if (b != null && a != null && b !== a) {
    const d = b - a;
    const w = (x: number) => Math.round(x / 10000).toLocaleString("en-US");
    lines.push(d > 0 ? `本次總缺口由 ${w(b)} 萬元降至 ${w(a)} 萬元，改善 ${w(d)} 萬元。` : `本次總缺口由 ${w(b)} 萬元變為 ${w(a)} 萬元。`);
  } else if (a != null) {
    lines.push(a > 0 ? `目前總缺口 ${Math.round(a / 10000).toLocaleString("en-US")} 萬元。` : "目前無現值缺口。");
  }
  const grp = (kind: string, title: string) => {
    const xs = notes.filter((x) => x.kind === kind);
    if (!xs.length) return;
    lines.push("", title);
    xs.forEach((x, i) => lines.push(`${i + 1}. ${x.body}${x.authorName ? `（${x.authorName}）` : ""}`));
  };
  grp("decision", "◆ 這次的決定");
  grp("basis", "◆ 依據");
  grp("todo", "◆ 接下來要做的");
  return lines.join("\n").trim();
}

/**
 * 隔天自動封場。忘記按結束**絕不能造成資料損失**——最多只是摘要沒被人工整理過，
 * 所以這裡只把場次關掉、存後指標，不產 review（沒有人整理過的東西不該變成正式紀錄）。
 */
export async function autoCloseStaleSessions(olderThanHours = 20): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
  const stale = await db
    .select({ id: consultSessions.id, planId: consultSessions.planId })
    .from(consultSessions)
    .where(and(isNull(consultSessions.endedAt), lt(consultSessions.startedAt, cutoff)));
  for (const s of stale) {
    let after: SessionMetrics | null = null;
    if (s.planId) {
      const [p] = await db.select({ data: plans.data }).from(plans).where(eq(plans.id, s.planId)).limit(1);
      if (p) after = sessionMetrics(p.data);
    }
    await db
      .update(consultSessions)
      .set({ endedAt: new Date(), closeReason: "auto", metricsAfter: after })
      .where(eq(consultSessions.id, s.id));
  }
  return stale.length;
}

/** 台北時區的 YYYY-MM-DD（reviews.date 是 date 欄位，用 UTC 會在半夜差一天）。 */
export function ymdTaipei(d: Date): string {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

export { sql };
