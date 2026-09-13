import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 2026/09/13 的四項修補裡，落在資料層的三支：
 *
 *   adoptNotes()            場中補收議程（自動開場刻意不吸註記，能力靠這支補回來）
 *   cancelSession()         「這不是諮詢」——註記解綁、場次整列刪掉
 *   draftForClosedSession() 補整理一場自動封場的諮詢（原本那一場沒有任何出口）
 *
 * 外加 startSession() 的 adopt 從布林改成「可以是一組 id」。
 *
 * ⚠️ 這裡守的是三條會安靜出事的線：
 *   1. 收議程的條件永遠要含 clientId + sessionId is null，而且 id 要過 UUID 格式篩——
 *      iframe 的樂觀更新會產生 'tmp_xxx' 這種假 id，丟進 uuid 欄位的 in (...) 會讓
 *      整句 SQL 炸在型別轉換，連開場都跟著失敗。
 *   2. 取消是**刪整列**。留一列取消掉的場次，「回到上次諮詢開始時」就會指到一場
 *      根本沒發生過的諮詢。已存成紀錄的一律不准取消。
 *   3. 補整理是冪等的：已經有草稿就原樣回傳，不重算也不覆蓋（教練可能改到一半）。
 */
type Row = Record<string, unknown>;
type Stmt = Record<string, unknown> & { _run: () => Row[] };

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  updates: [] as { table: string; set: Record<string, unknown> }[],
  inserts: [] as { table: string; values: Record<string, unknown>[] }[],
  deletes: [] as string[],
  /** 每一次 inArray(col, ids) 收到的 ids。 */
  inArrays: [] as string[][],
  notes: [] as { kind: string; body: string; visible: boolean; authorAccess: string; id: string; authorName: string | null }[],
}));

vi.mock("@/Shared/db", () => {
  const nameOf = (t: unknown) => String((t as { _n?: string })?._n ?? "?");
  const chain = (run: () => Row[]): Stmt => {
    const c = { _run: run } as Stmt;
    for (const k of ["where", "returning", "orderBy", "innerJoin"]) c[k] = () => c;
    c.limit = () => Promise.resolve(run());
    c.then = (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return c;
  };
  return {
    db: {
      select: () => {
        const o: Record<string, unknown> = {};
        for (const k of ["from", "where", "orderBy", "innerJoin"]) o[k] = () => o;
        o.limit = () => Promise.resolve(state.rows.shift() ?? []);
        return o;
      },
      update: (t: unknown) => ({
        set: (v: Record<string, unknown>) => {
          state.updates.push({ table: nameOf(t), set: v });
          return chain(() => [{ id: "x1" }]);
        },
      }),
      insert: (t: unknown) => ({
        values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          state.inserts.push({ table: nameOf(t), values: Array.isArray(v) ? v : [v] });
          return chain(() => [{ id: "s-new", clientId: "c1", planId: "p1" }]);
        },
      }),
      delete: (t: unknown) => {
        state.deletes.push(nameOf(t));
        return chain(() => []);
      },
      batch: (items: Stmt[]) => Promise.resolve(items.map((i) => i._run())),
    },
  };
});
vi.mock("@/Shared/db/schema", () => {
  const tbl = (n: string) => new Proxy({}, { get: (_t, k) => (k === "_n" ? n : {}) });
  return {
    consultSessions: tbl("consult_sessions"), clients: tbl("clients"), clientNotes: tbl("client_notes"),
    planRevisions: tbl("plan_revisions"), plans: tbl("plans"), reviews: tbl("reviews"), actionItems: tbl("action_items"),
  };
});
vi.mock("drizzle-orm", () => {
  const f = () => ({});
  return {
    and: f, desc: f, eq: f, isNull: f, lt: f, sql: Object.assign(f, { raw: f }),
    inArray: (_c: unknown, ids: string[]) => { state.inArrays.push(ids); return {}; },
  };
});
vi.mock("./clientScope", () => ({ ownedClient: () => ({}) }));
vi.mock("./snapshot", () => ({ sessionMetrics: () => ({ shortPV: 3_240_000, net: 0, gap: null }) }));
vi.mock("./notes", () => ({ notesOfSession: async () => state.notes }));
vi.mock("./reviews", () => ({ assertPlanOfClient: async () => {} }));

const Session = await import("./consultSession");

const U1 = "11111111-2222-4333-8444-555555555555";
const U2 = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const N = (kind: string, body: string) =>
  ({ id: "n" + state.notes.length, kind, body, visible: false, authorAccess: "owner", authorName: null });

const closedRow = {
  id: "s1", clientId: "c1", coachId: "u1", planId: "p1", revisionId: "r1",
  startedAt: new Date("2026-09-11T02:30:00Z"),           // 台北時間 9/11 10:30
  endedAt: new Date("2026-09-11T20:00:00Z"), closeReason: "auto", reviewId: null,
  metricsBefore: { shortPV: 4_860_000, net: 0, gap: null }, metricsAfter: null,
  closingNote: null, draftSummary: null,
};
const noteUpdates = () => state.updates.filter((u) => u.table === "client_notes");

beforeEach(() => {
  state.rows = []; state.updates = []; state.inserts = []; state.deletes = []; state.inArrays = []; state.notes = [];
});

describe("startSession：adopt 可以是一組 id", () => {
  const prime = () => { state.rows = [[{ id: "c1" }], [{ data: {} }], [{ id: "r9" }]]; };

  it("⚠️ 假 id（iframe 樂觀更新的 tmp_）不會被送進 uuid 欄位的 in (...)", async () => {
    prime();
    const r = await Session.startSession("u1", "c1", "p1", [U1, "tmp_abc", U2]);
    expect(r.ok).toBe(true);
    expect(state.inArrays).toEqual([[U1, U2]]);
  });

  it("一則都沒勾＝一句都不打（自動開場走的就是這條）", async () => {
    prime();
    await Session.startSession("u1", "c1", "p1", []);
    expect(noteUpdates(), "沒有要收的註記就不該碰 client_notes").toEqual([]);
    expect(state.inArrays).toEqual([]);
  });

  it("true ＝全部收（舊語意保留，不加 id 條件）", async () => {
    prime();
    const r = await Session.startSession("u1", "c1", "p1", true);
    expect(r.ok && r.adopted).toBe(1);
    expect(state.inArrays, "全收就不該有 id 條件").toEqual([]);
    expect(noteUpdates()[0].set.sessionId).toBe("s-new");
  });
});

describe("adoptNotes：場中補收議程", () => {
  it("進行中的場次收得進來", async () => {
    state.rows = [[{ ...closedRow, endedAt: null, closeReason: null }], [{ id: "c1" }]];
    const r = await Session.adoptNotes("u1", "s1", [U1]);
    expect(r.ok && r.adopted).toBe(1);
    expect(state.inArrays).toEqual([[U1]]);
    expect(noteUpdates()[0].set.sessionId).toBe("s1");
  });

  it("已經結束的場次不收——那一場的範圍已經定案了", async () => {
    state.rows = [[closedRow], [{ id: "c1" }]];
    const r = await Session.adoptNotes("u1", "s1", [U1]);
    expect(r).toEqual({ ok: false, error: "這一場已經結束了" });
    expect(noteUpdates()).toEqual([]);
  });
});

describe("cancelSession：這不是諮詢", () => {
  it("註記先解綁回日常維護，場次整列刪掉", async () => {
    state.rows = [[{ ...closedRow, endedAt: null, closeReason: null }], [{ id: "c1" }]];
    const r = await Session.cancelSession("u1", "s1");
    expect(r.ok && r.released).toBe(1);
    expect(noteUpdates()[0].set.sessionId, "解綁＝寫回 null，不是刪註記").toBeNull();
    expect(state.deletes, "⚠️ 是刪整列，不是標一個 cancelled").toEqual(["consult_sessions"]);
  });

  it("⚠️ 已經存成諮詢紀錄的一律不准取消", async () => {
    state.rows = [[{ ...closedRow, reviewId: "rv1" }], [{ id: "c1" }]];
    const r = await Session.cancelSession("u1", "s1");
    expect(r.ok).toBe(false);
    expect(state.deletes).toEqual([]);
    expect(noteUpdates()).toEqual([]);
  });
});

describe("draftForClosedSession：補整理自動封場的那一場", () => {
  it("現產草稿、寫回 draft_summary，日期是**那一天**不是今天", async () => {
    state.notes = [N("decision", "先把循環利率那筆清掉"), N("todo", "查聯徵")];
    state.rows = [[{ ...closedRow, closingNote: "客戶今天很開放" }], [{ id: "c1" }], [{ data: {} }]];
    const r = await Session.draftForClosedSession("u1", "s1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.date).toBe("2026-09-11");
    expect(r.draft).toContain("客戶今天很開放");
    expect(r.draft).toContain("先把循環利率那筆清掉");
    expect(r.todos).toEqual(["查聯徵"]);
    const w = state.updates.find((u) => u.table === "consult_sessions");
    expect(typeof w?.set.draftSummary, "草稿要落地，否則關掉視窗又是一次資料損失").toBe("string");
  });

  it("⚠️ 冪等：已經有草稿就原樣回傳，不重算也不覆蓋", async () => {
    state.rows = [[{ ...closedRow, draftSummary: "教練改到一半的內容" }], [{ id: "c1" }]];
    const r = await Session.draftForClosedSession("u1", "s1");
    expect(r.ok && r.draft).toBe("教練改到一半的內容");
    expect(state.updates, "不該再寫任何東西").toEqual([]);
  });

  it("還在進行中的場次走的是「結束並產摘要」，不是這一支", async () => {
    state.rows = [[{ ...closedRow, endedAt: null }], [{ id: "c1" }]];
    const r = await Session.draftForClosedSession("u1", "s1");
    expect(r.ok).toBe(false);
    expect(state.updates).toEqual([]);
  });

  it("已經存成紀錄的不會再產第二份草稿", async () => {
    state.rows = [[{ ...closedRow, reviewId: "rv1" }], [{ id: "c1" }]];
    const r = await Session.draftForClosedSession("u1", "s1");
    expect(r).toEqual({ ok: false, error: "這一場的紀錄已經存過了" });
  });
});
