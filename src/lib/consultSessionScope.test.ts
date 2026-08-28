import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 諮詢場次三支**讀取** API 的租戶條件。
 *
 * ⚠️⚠️ openSession / listSessions / pendingDraft 原本的 where 只有
 * `eq(consult_sessions.client_id, clientId)` —— 一個租戶條件都沒有。
 * 同一支檔案裡的 startSession / endSession / saveSessionRecord / discardDraft
 * 全都有 assertOwned()，只有這三支漏掉，而漏掉的正好是三支「讀」。
 *
 * 呼叫端（app/dashboard/actions.ts）只做 requireWritableCoach()＝「你是不是一位有效教練」，
 * 完全不驗「這位客戶是不是你的」，而 clientId 直接來自參數。所以任何一位登入中的教練
 * 換一個 clientId 就讀得到別人客戶的：
 *   draftSummary（整段諮詢摘要）、metricsBefore/After（總缺口、淨值）、closingNote、註記內文。
 *
 * 這支測試盯著兩件事：每一支都 join 回 clients，而且每一支都把 ownedClient(me) 併進 where。
 */
const h = vi.hoisted(() => ({
  state: {
    rows: [] as unknown[],
    joins: 0,
    conds: [] as unknown[],
    ownedCalls: [] as string[],
  },
}));

vi.mock("@/Shared/db/schema", () => {
  const tbl = (n: string) =>
    new Proxy({}, { get: (_t, k) => (k === "_n" ? n : typeof k === "string" ? `${n}.${k}` : {}) });
  return {
    consultSessions: tbl("consult_sessions"), clients: tbl("clients"), clientNotes: tbl("client_notes"),
    planRevisions: tbl("plan_revisions"), plans: tbl("plans"), reviews: tbl("reviews"), actionItems: tbl("action_items"),
  };
});
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...xs: unknown[]) => ({ and: xs }),
  isNull: (a: unknown) => ({ isNull: a }),
  desc: () => ({}),
  lt: () => ({}),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));
vi.mock("./clientScope", () => ({
  ownedClient: (id: string) => {
    h.state.ownedCalls.push(id);
    return { ownedClient: id };
  },
}));
vi.mock("./snapshot", () => ({ sessionMetrics: () => null }));
vi.mock("./notes", () => ({ notesOfSession: async () => [] }));
vi.mock("./reviews", () => ({ assertPlanOfClient: async () => {} }));
vi.mock("@/Shared/db", () => ({
  db: {
    select: () => {
      const o: Record<string, unknown> = {};
      o.from = () => o;
      o.innerJoin = () => { h.state.joins++; return o; };
      o.where = (c: unknown) => { h.state.conds.push(c); return o; };
      o.orderBy = () => o;
      o.limit = () => Promise.resolve(h.state.rows);
      o.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(h.state.rows).then(res, rej);
      return o;
    },
  },
}));

const Session = await import("./consultSession");

/** 把巢狀的 and(...) 攤平，找出這一趟查詢實際帶了哪些條件。 */
function flat(cond: unknown, out: unknown[] = []): unknown[] {
  if (!cond || typeof cond !== "object") return out;
  const o = cond as { and?: unknown[] };
  if (o.and) { for (const x of o.and) flat(x, out); return out; }
  out.push(cond);
  return out;
}

const hasOwned = (me: string) =>
  h.state.conds.some((c) => flat(c).some((x) => (x as { ownedClient?: string }).ownedClient === me));

beforeEach(() => {
  h.state.rows = [];
  h.state.joins = 0;
  h.state.conds = [];
  h.state.ownedCalls = [];
});

describe("三支讀取 API 都吃 coachId 並併上 ownedClient()", () => {
  const CASES: [string, (me: string, cid: string) => Promise<unknown>][] = [
    ["openSession", (me, cid) => Session.openSession(me, cid)],
    ["listSessions", (me, cid) => Session.listSessions(me, cid)],
    ["pendingDraft", (me, cid) => Session.pendingDraft(me, cid)],
  ];

  it.each(CASES)("%s 的 where 帶著 ownedClient(me)", async (_name, run) => {
    await run("u1", "someone-elses-client");
    expect(h.state.ownedCalls, "ownedClient() 根本沒被呼叫＝這一支沒有租戶條件").toContain("u1");
    expect(hasOwned("u1"), "ownedClient(me) 沒有併進 where").toBe(true);
  });

  it.each(CASES)("%s 會 join 回 clients（租戶欄位在 clients 上，不 join 就無從比對）", async (_name, run) => {
    await run("u1", "c1");
    expect(h.state.joins).toBeGreaterThanOrEqual(1);
  });

  it.each(CASES)("%s 仍然帶著 clientId 條件（不能為了加租戶條件就把原本的拿掉）", async (_name, run) => {
    await run("u1", "c1");
    const all = h.state.conds.flatMap((c) => flat(c));
    expect(all).toContainEqual({ eq: ["consult_sessions.clientId", "c1"] });
  });

  it("讀不到別人的客戶時回的是空，不是丟例外（畫面要能安靜地什麼都不顯示）", async () => {
    h.state.rows = [];
    expect(await Session.openSession("u1", "c9")).toBe(null);
    expect(await Session.listSessions("u1", "c9")).toEqual([]);
    expect(await Session.pendingDraft("u1", "c9")).toBe(null);
  });
});
