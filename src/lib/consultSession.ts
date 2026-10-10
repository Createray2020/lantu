// 一場諮詢：把「這次談了什麼」變成諮詢過程的副產品，而不是事後回想補寫的作業。
//
// 三件事同時由它解決：
//   1. 摘要的範圍不用猜——這一場裡寫的，就是這一場的。
//   2. 開場那一刻釘住一版 → 「回到上次諮詢開始時的狀態」（現有的還原功能
//      叫「第 37 版」，諮詢當下沒有人想得起來去點它）。
//   3. metricsBefore/After → 摘要開頭那句「這次改善了多少」。
//
// ⚠️ 開場／結束一律只有主責教練（ownedClient）。協作教練能寫註記，但不能開場。
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clientNotes, clients, consultSessions, planRevisions, plans, reviews } from "@/Shared/db/schema";
import { ownedClient } from "./clientScope";
import { sessionMetrics, type SessionMetrics } from "./snapshot";
import { assertPlanOfClient } from "./reviews";
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

/**
 * ⚠️⚠️ 讀取三支（openSession / listSessions / pendingDraft）也要吃 coachId。
 *
 * 這裡的租戶條件不是可有可無的裝飾：呼叫端（app/dashboard/actions.ts）只驗「你是不是一位
 * 有效的教練」，clientId 直接來自參數。少了 innerJoin(clients) + ownedClient()，
 * 任何一位登入中的教練換一個 clientId 就讀得到別人客戶的整段諮詢摘要（draft_summary）、
 * 總缺口與淨值（metrics_before / metrics_after）、收尾備註，連帶還原點也一併看光。
 *
 * 寫法比照 lib/plans.ts 的 ownedPlan()：條件守在資料層，不交給呼叫端補。
 */
export async function openSession(coachId: string, clientId: string): Promise<SessionRow | null> {
  const [row] = await db
    .select(COLS)
    .from(consultSessions)
    .innerJoin(clients, eq(clients.id, consultSessions.clientId))
    .where(and(eq(consultSessions.clientId, clientId), ownedClient(coachId), isNull(consultSessions.endedAt)))
    .limit(1);
  return row ?? null;
}

export async function listSessions(coachId: string, clientId: string, limit = 40): Promise<SessionRow[]> {
  return db
    .select(COLS)
    .from(consultSessions)
    .innerJoin(clients, eq(clients.id, consultSessions.clientId))
    .where(and(eq(consultSessions.clientId, clientId), ownedClient(coachId)))
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
 * 把「日常維護」的註記收進某一場當議程。
 *
 * adopt === true         全部收（本機模式與舊呼叫端的語意，保留不動）
 * adopt === string[]     只收指定的那幾則（教練在清單上勾出來的）
 *
 * ⚠️⚠️ 條件永遠要含 clientId + sessionId is null。少了它，一組別人客戶的 note id
 * 就能被搬進自己的場次——id 是呼叫端給的，不是這裡查出來的。
 * ⚠️ id 先過 UUID 格式篩：iframe 端樂觀更新會產生 'tmp_xxx' 這種假 id，
 *    直接丟進 uuid 欄位的 in (...) 會讓整句 SQL 炸在型別轉換上（開場跟著失敗）。
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function adoptLooseNotes(
  clientId: string,
  sessionId: string,
  adopt: boolean | string[],
): Promise<number> {
  const base = and(eq(clientNotes.clientId, clientId), isNull(clientNotes.sessionId));
  let where = base;
  if (adopt !== true) {
    const ids = (Array.isArray(adopt) ? adopt : []).filter((x) => UUID_RE.test(x)).slice(0, 500);
    if (!ids.length) return 0;
    where = and(base, inArray(clientNotes.id, ids));
  }
  const res = await db
    .update(clientNotes)
    .set({ sessionId, updatedAt: new Date() })
    .where(where)
    .returning({ id: clientNotes.id });
  return res.length;
}

/**
 * 開始一場諮詢。
 *
 * @param adopt 把「日常維護」的註記帶進這一場當議程（諮詢前一天自己先看資料寫下的
 *              問題，開場時變成議程）。true＝全部；字串陣列＝教練勾出來的那幾則；
 *              false／空陣列＝不帶（自動開場走的就是這條，要帶什麼該由人決定）。
 */
export async function startSession(
  coachId: string,
  clientId: string,
  planId: string | null,
  adopt: boolean | string[],
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

  const adopted = await adoptLooseNotes(clientId, row.id, adopt);
  return { ok: true, session: row, adopted };
}

export type AdoptOutcome = { ok: true; adopted: number } | { ok: false; error: string };

/**
 * 場中補收議程：把還在「日常維護」的註記收進**進行中**的這一場。
 *
 * 為什麼需要它：自動開場刻意不吸任何日常維護註記（那要人決定），
 * 沒有這一支的話，「開場時一鍵變議程」這個能力會被自動開場整個吃掉。
 */
export async function adoptNotes(
  coachId: string,
  sessionId: string,
  noteIds: string[],
): Promise<AdoptOutcome> {
  const [s] = await db.select(COLS).from(consultSessions).where(eq(consultSessions.id, sessionId)).limit(1);
  if (!s) return { ok: false, error: "找不到這一場諮詢" };
  if (!(await assertOwned(coachId, s.clientId))) return { ok: false, error: "只有主責教練能整理這一場" };
  if (s.endedAt) return { ok: false, error: "這一場已經結束了" };
  const adopted = await adoptLooseNotes(s.clientId, s.id, noteIds);
  return { ok: true, adopted };
}

/**
 * 「這不是諮詢」——把（多半是自動開場的）這一場取消掉。
 *
 * ⚠️⚠️ 刻意是**刪除整列**，不是標一個 closeReason='cancelled'。
 * 留著一列取消掉的場次，「回到上次諮詢開始時」就會指到一場根本沒發生過的諮詢——
 * 那是比沒有還原點更糟的還原點。
 *
 * ⚠️ 註記先解綁回「日常維護」再刪列。client_notes.session_id 的外鍵雖然是
 * on delete set null（刪場次不會連帶刪註記），但靠外鍵的副作用做事，
 * 下一個改 schema 的人看不出這裡依賴它。
 *
 * ⚠️ 已經存成正式紀錄（review_id 不為 null）的場次一律不准取消：
 * 那一列是 reviews 的外鍵來源，而且紀錄已經在客戶的時間軸上了。
 */
/**
 * 願景處理流程 Step 8：把這一場的回訪對帳結果落表。
 * ⚠️ 只有主責教練能寫；資料本身也記在 c.flow，這裡是為了跨客戶統計。冪等：重按就覆蓋。
 */
export type CheckinRecord = {
  grade: "done" | "partial" | "none";
  actual: number;
  planned: number | null;
  ratio: number | null;
  cnt: Record<string, number>;
  total: number;
  at: string;
};
const CHECKIN_GRADES = new Set(["done", "partial", "none"]);
export function normCheckin(raw: unknown): CheckinRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const grade = String(r.grade ?? "");
  if (!CHECKIN_GRADES.has(grade)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const cnt: Record<string, number> = {};
  if (r.cnt && typeof r.cnt === "object") for (const [k, v] of Object.entries(r.cnt as Record<string, unknown>)) cnt[k] = num(v) ?? 0;
  return { grade: grade as CheckinRecord["grade"], actual: num(r.actual) ?? 0, planned: num(r.planned), ratio: num(r.ratio), cnt, total: num(r.total) ?? 0, at: typeof r.at === "string" ? r.at : new Date().toISOString() };
}
export async function saveCheckin(coachId: string, sessionId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const checkin = normCheckin(raw);
  if (!checkin) return { ok: false, error: "對帳資料格式不對" };
  const [s] = await db.select(COLS).from(consultSessions).where(eq(consultSessions.id, sessionId)).limit(1);
  if (!s) return { ok: false, error: "找不到這一場諮詢" };
  if (!(await assertOwned(coachId, s.clientId))) return { ok: false, error: "只有主責教練能記回訪對帳" };
  await db.update(consultSessions).set({ checkin }).where(eq(consultSessions.id, sessionId));
  return { ok: true };
}
/** 教練首頁「回訪到位」：某段期間內有對帳的場次，依等級計數。 */
export async function checkinStats(coachId: string, since: Date, until?: Date): Promise<{ done: number; partial: number; none: number; total: number }> {
  // ⚠️ 除了 coach_id，還要 innerJoin(clients)＋ownedClient：客戶轉手之後舊教練不該再統計到那位客戶。
  const rows = await db
    .select({ checkin: consultSessions.checkin })
    .from(consultSessions)
    .innerJoin(clients, eq(clients.id, consultSessions.clientId))
    .where(and(eq(consultSessions.coachId, coachId), ownedClient(coachId), isNotNull(consultSessions.checkin), gte(consultSessions.startedAt, since), until ? lt(consultSessions.startedAt, until) : undefined));
  const out = { done: 0, partial: 0, none: 0, total: 0 };
  for (const r of rows) {
    const c = normCheckin(r.checkin);
    if (!c) continue;
    out[c.grade]++; out.total++;
  }
  return out;
}

export async function cancelSession(coachId: string, sessionId: string): Promise<{ ok: true; released: number } | { ok: false; error: string }> {
  const [s] = await db.select(COLS).from(consultSessions).where(eq(consultSessions.id, sessionId)).limit(1);
  if (!s) return { ok: false, error: "找不到這一場諮詢" };
  if (!(await assertOwned(coachId, s.clientId))) return { ok: false, error: "只有主責教練能取消這一場" };
  if (s.reviewId) return { ok: false, error: "這一場已經存成諮詢紀錄，不能取消" };
  const released = await db
    .update(clientNotes)
    .set({ sessionId: null, updatedAt: new Date() })
    .where(eq(clientNotes.sessionId, sessionId))
    .returning({ id: clientNotes.id });
  await db.delete(consultSessions).where(and(eq(consultSessions.id, sessionId), isNull(consultSessions.reviewId)));
  return { ok: true, released: released.length };
}

/**
 * 補整理一場**已經封場**的諮詢（多半是 cron 自動封場的那一種）。
 *
 * 為什麼需要它：autoCloseStaleSessions() 刻意只封場、不產 review——沒有人整理過的
 * 東西不該自動變成正式紀錄。但它同時也不產草稿，於是那一場就再也沒有任何出口：
 * 註記、前後指標、收尾全部沉底，教練連知道都不會知道。
 *
 * 這一支把那個出口補回來：現算一份草稿寫進 draft_summary，之後就跟「按了結束沒存」
 * 的草稿走同一條路（pendingDraft → 諮詢紀錄表單 → saveSessionRecord）。
 *
 * ⚠️ 冪等：已經有草稿就直接把那一份回傳，不重算也不覆蓋——
 *    教練可能已經在表單裡改到一半。
 */
export type ClosedDraftOutcome =
  | { ok: true; sessionId: string; draft: string; todos: string[]; date: string }
  | { ok: false; error: string };

export async function draftForClosedSession(coachId: string, sessionId: string): Promise<ClosedDraftOutcome> {
  const [s] = await db.select(COLS).from(consultSessions).where(eq(consultSessions.id, sessionId)).limit(1);
  if (!s) return { ok: false, error: "找不到這一場諮詢" };
  if (!(await assertOwned(coachId, s.clientId))) return { ok: false, error: "只有主責教練能整理這一場" };
  if (!s.endedAt) return { ok: false, error: "這一場還在進行中——請用「結束並產摘要」" };
  if (s.reviewId) return { ok: false, error: "這一場的紀錄已經存過了" };

  const fresh = await notesOfSession(sessionId);
  const todos = fresh.filter((n) => n.kind === "todo").map((n) => n.body.slice(0, 200));
  const date = ymdTaipei(s.startedAt);
  if (s.draftSummary) return { ok: true, sessionId: s.id, draft: s.draftSummary, todos, date };

  // 自動封場有存後指標，superseded 沒有——沒有就拿現在的規劃現算一份。
  let after = (s.metricsAfter as SessionMetrics | null) ?? null;
  if (!after && s.planId) {
    const [p] = await db.select({ data: plans.data }).from(plans).where(eq(plans.id, s.planId)).limit(1);
    if (p) after = sessionMetrics(p.data);
  }
  const draft = buildSummary(fresh, s.metricsBefore as SessionMetrics | null, after, s.closingNote);
  await db
    .update(consultSessions)
    .set({ metricsAfter: after, draftSummary: draft })
    .where(and(eq(consultSessions.id, sessionId), isNull(consultSessions.reviewId)));
  return { ok: true, sessionId: s.id, draft, todos, date };
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
  // 早退一步（省掉整批寫入）。真正的冪等鎖是底下那句 `where review_id is null`，不是這裡。
  if (s.reviewId) return { ok: false, error: "這一場的紀錄已經存過了" };

  const planId = input.planId !== undefined ? input.planId : s.planId;
  // createReview() 幫我們做的兩道檢查在這裡要自己補：主責由上面的 assertOwned 擋掉，
  // 「planId 屬於同一位客戶」用共用的那支。
  await assertPlanOfClient(planId, s.clientId);

  const fresh = await notesOfSession(sessionId);
  const todoRows = fresh
    .filter((n) => n.kind === "todo")
    .map((n) => ({ clientId: s.clientId, title: n.body.slice(0, 200) }));

  /**
   * ⚠️⚠️ 先占，而且三句寫在同一個 db.batch() 裡。
   *
   * 舊寫法是 ①createReview → ②逐筆 createActionItem → ③最後才 update review_id。
   * 冪等鎖 `if (s.reviewId) return` 讀的正是第③步才寫進去的欄位，所以整個 ①②
   * 都在鎖生效之前 —— 網路斷在中間、或教練連按兩次存檔，就會留下兩筆諮詢紀錄
   * 與兩份一模一樣的待辦，而場次上一個 review_id 都沒掛。
   *
   * 現在改成：
   *   句1 insert reviews（用預先產生的 uuid，不是等 DB 給）
   *   句2 insert action_items（掛在同一個 reviewId 底下）
   *   句3 update consult_sessions set review_id=<那個 uuid> where id=? and review_id is null returning
   * 第③句回 0 列＝別人已經存過，這一輪就整個不算數。
   *
   * 順序不能對調：consult_sessions.review_id 有外鍵指向 reviews.id，
   * 先占一個還不存在的 uuid 會當場違反外鍵。
   * neon-http 驅動沒有互動式交易（db.transaction() 會直接丟錯），但 db.batch()
   * 是單一交易 —— 三句要嘛都成立、要嘛都不成立。
   */
  const reviewId = randomUUID();
  const reviewStmt = db.insert(reviews).values({
    id: reviewId,
    clientId: s.clientId,
    date: input.date,
    type: input.type,
    planId: planId ?? null,
    attendees: input.attendees ?? null,
    summary: input.summary ?? null,
    nextAppt: input.nextAppt ?? null,
  });
  const claimStmt = db
    .update(consultSessions)
    .set({ reviewId, draftSummary: null })
    .where(and(eq(consultSessions.id, sessionId), isNull(consultSessions.reviewId)))
    .returning({ id: consultSessions.id });

  let claimed: { id: string }[];
  if (todoRows.length) {
    const itemsStmt = db.insert(actionItems).values(todoRows.map((t) => ({ ...t, reviewId })));
    claimed = (await db.batch([reviewStmt, itemsStmt, claimStmt]))[2];
  } else {
    claimed = (await db.batch([reviewStmt, claimStmt]))[1];
  }

  if (!claimed.length) {
    // 沒占到＝別人（另一個分頁／重試）已經存過。把剛剛寫進去的收回去，不留孤兒列：
    // action_items.review_id 是 ON DELETE CASCADE，刪掉 review 就一起帶走。
    await db.delete(reviews).where(eq(reviews.id, reviewId));
    return { ok: false, error: "這一場的紀錄已經存過了" };
  }
  return { ok: true, reviewId, todos: todoRows.length };
}

/**
 * 這位客戶有沒有「按了結束但沒存」的草稿。
 *
 * ⚠️ 只認手動結束的（closeReason='manual'）：自動封場刻意不產草稿，
 * 沒人整理過的東西不該變成待處理的提醒，不然每次忘記按結束都會冒一條。
 */
export async function pendingDraft(coachId: string, clientId: string): Promise<PendingDraft | null> {
  const [row] = await db
    .select(COLS)
    .from(consultSessions)
    .innerJoin(clients, eq(clients.id, consultSessions.clientId))
    .where(
      and(
        eq(consultSessions.clientId, clientId),
        ownedClient(coachId),
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
