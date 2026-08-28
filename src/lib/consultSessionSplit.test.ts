import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「結束並摘要」拆成兩段（2026/08/28 教練回饋）。
 *
 * 教練回報：按了「結束並摘要」，產出的內容跟他實際談的幾乎完全無關，而且只有一句話。
 * 真因不是 bug——buildSummary() 只讀得到「教練在區塊上留的註記」與缺口前後差，
 * 系統沒有任何談話內容可讀。而他的實際用法是**事後把 AI 整理好的一大段貼進來**，
 * 日期還是過去的某一天，但舊版的 review 日期是寫死 new Date() 的今天。
 *
 * 所以拆成兩段：
 *   endSession()        定案客戶可見 → 算後指標 → 產草稿 → 封場（**不產 review**）
 *   saveSessionRecord() 教練改完（日期／類型／全文）按存檔 → 才產 review 與 action_items
 *
 * ⚠️ 這裡守的最重要一條：草稿一定要落地。場次已封而紀錄還沒生出來的空窗，
 * 中間把視窗關掉就是資料損失——違反「忘記按結束絕不能造成資料損失」那條原則。
 */
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],          // 每次 .limit() 依序取一組
  updates: [] as Record<string, unknown>[],
  reviews: [] as Record<string, unknown>[],
  items: [] as string[],
  notes: [] as { kind: string; body: string; visible: boolean; authorAccess: string; id: string; authorName: string | null }[],
}));

vi.mock("@/Shared/db", () => ({
  db: {
    select: () => {
      const o: Record<string, unknown> = {};
      for (const k of ["from", "where", "orderBy", "innerJoin"]) o[k] = () => o;
      o.limit = () => Promise.resolve(state.rows.shift() ?? []);
      return o;
    },
    update: () => ({
      set: (v: Record<string, unknown>) => {
        state.updates.push(v);
        const r: Record<string, unknown> = {};
        r.where = () => r;
        r.returning = () => Promise.resolve([{ id: "s1", clientId: "c1", planId: "p1", draftSummary: v.draftSummary ?? null }]);
        // 沒有 .returning() 的呼叫（例如清草稿）要能直接 await
        return Object.assign(Promise.resolve(), r);
      },
    }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "new" }]) }) }),
  },
}));
// 假 schema：每個欄位都是個空物件就夠了（真正的 where 條件由假 drizzle 吃掉）。
vi.mock("@/Shared/db/schema", () => {
  const tbl = () => new Proxy({}, { get: () => ({}) });
  return { consultSessions: tbl(), clients: tbl(), clientNotes: tbl(), planRevisions: tbl(), plans: tbl(), reviews: tbl(), actionItems: tbl() };
});
vi.mock("drizzle-orm", () => {
  const f = () => ({});
  return { and: f, desc: f, eq: f, isNull: f, lt: f, sql: Object.assign(f, { raw: f }) };
});
vi.mock("./clientScope", () => ({ ownedClient: () => ({}) }));
vi.mock("./snapshot", () => ({ sessionMetrics: () => ({ shortPV: 3_240_000, net: 0, gap: null }) }));
vi.mock("./notes", () => ({ notesOfSession: async () => state.notes }));
vi.mock("./reviews", () => ({
  createReview: async (_c: string, _cl: string, input: Record<string, unknown>) => {
    state.reviews.push(input);
    return "rev1";
  },
  createActionItem: async (_c: string, _cl: string, input: { title: string }) => {
    state.items.push(input.title);
    return "it1";
  },
}));

const Session = await import("./consultSession");

const N = (kind: string, body: string) =>
  ({ id: "n" + state.notes.length, kind, body, visible: false, authorAccess: "owner", authorName: null });

const openSessionRow = { id: "s1", clientId: "c1", coachId: "u1", planId: "p1", revisionId: "r1", startedAt: new Date(), endedAt: null, closeReason: null, reviewId: null, metricsBefore: { shortPV: 4_860_000, net: 0, gap: null }, metricsAfter: null, closingNote: null, draftSummary: null };

beforeEach(() => {
  state.rows = []; state.updates = []; state.reviews = []; state.items = []; state.notes = [];
});

describe("endSession：只產草稿，不產紀錄", () => {
  beforeEach(() => {
    state.notes = [N("decision", "先把循環利率那筆清掉"), N("todo", "查聯徵對貸款成數的算法")];
    state.rows = [
      [openSessionRow],           // 讀場次
      [{ id: "c1" }],             // assertOwned
      [{ data: {} }],             // 讀 plan 算後指標
    ];
  });

  it("⚠️ 不會寫任何 review 或 action_item——那是存檔那一步的事", async () => {
    const r = await Session.endSession("u1", "s1", { closingNote: "客戶今天很開放" });
    expect(r.ok).toBe(true);
    expect(state.reviews, "按結束的當下不該有正式紀錄").toEqual([]);
    expect(state.items, "待辦也要等存檔才進追蹤").toEqual([]);
  });

  it("⚠️⚠️ 草稿一定要落地（關掉視窗不能掉東西）", async () => {
    await Session.endSession("u1", "s1", { closingNote: "客戶今天很開放" });
    const close = state.updates.find((u) => u.closeReason === "manual");
    expect(close, "要封場").toBeTruthy();
    expect(typeof close!.draftSummary, "草稿必須寫進 DB").toBe("string");
    expect(String(close!.draftSummary)).toContain("客戶今天很開放");
    expect(String(close!.draftSummary)).toContain("先把循環利率那筆清掉");
  });

  it("回傳草稿與待辦清單，讓表單當預填", async () => {
    const r = await Session.endSession("u1", "s1", { closingNote: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft).toContain("改善");           // 缺口 486 萬 → 324 萬
    expect(r.todos).toEqual(["查聯徵對貸款成數的算法"]);
  });

  it("已經結束過的場次不能再結束一次", async () => {
    state.rows = [[{ ...openSessionRow, endedAt: new Date() }], [{ id: "c1" }]];
    const r = await Session.endSession("u1", "s1", {});
    expect(r.ok).toBe(false);
  });

  it("不是主責教練 → 擋下來，而且一個字都不寫", async () => {
    state.rows = [[openSessionRow], []];
    const r = await Session.endSession("nobody", "s1", {});
    expect(r.ok).toBe(false);
    expect(state.updates).toEqual([]);
  });
});

describe("saveSessionRecord：教練改完才變正式紀錄", () => {
  const closed = { ...openSessionRow, endedAt: new Date(), closeReason: "manual", draftSummary: "草稿內容" };

  beforeEach(() => {
    state.notes = [N("todo", "請個案提供三筆負債對帳單"), N("decision", "先清循環")];
    state.rows = [[closed], [{ id: "c1" }]];
  });

  it("⚠️ 日期用教練填的，不是今天——補記過去的諮詢就靠這條", async () => {
    const r = await Session.saveSessionRecord("u1", "s1", {
      date: "2026-08-05", type: "adhoc", summary: "貼進來的一整段", attendees: "本人、配偶", nextAppt: null,
    });
    expect(r.ok).toBe(true);
    expect(state.reviews.length).toBe(1);
    expect(state.reviews[0].date, "不可以被覆蓋成今天").toBe("2026-08-05");
    expect(state.reviews[0].type).toBe("adhoc");
    expect(state.reviews[0].summary).toBe("貼進來的一整段");
  });

  it("待辦這時候才進追蹤", async () => {
    await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(state.items).toEqual(["請個案提供三筆負債對帳單"]);
  });

  it("存完要把草稿清掉、掛上 reviewId（提醒才會消失）", async () => {
    await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    const done = state.updates.find((u) => "draftSummary" in u && u.draftSummary === null);
    expect(done, "草稿要清空").toBeTruthy();
    expect(done!.reviewId).toBe("rev1");
  });

  it("同一場不能存兩次紀錄", async () => {
    state.rows = [[{ ...closed, reviewId: "already" }], [{ id: "c1" }]];
    const r = await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(r.ok).toBe(false);
    expect(state.reviews).toEqual([]);
  });

  it("沒有 planId 傳進來時沿用場次自己的版本", async () => {
    await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(state.reviews[0].planId).toBe("p1");
  });
});

describe("discardDraft：這一場決定不留紀錄", () => {
  it("只丟草稿，場次與還原點都留著", async () => {
    state.rows = [[{ ...openSessionRow, endedAt: new Date(), draftSummary: "草稿" }], [{ id: "c1" }]];
    const ok = await Session.discardDraft("u1", "s1");
    expect(ok).toBe(true);
    expect(state.updates.length).toBe(1);
    expect(state.updates[0]).toEqual({ draftSummary: null });
  });

  it("不是主責就不給丟", async () => {
    state.rows = [[{ ...openSessionRow, endedAt: new Date() }], []];
    expect(await Session.discardDraft("nobody", "s1")).toBe(false);
    expect(state.updates).toEqual([]);
  });
});
