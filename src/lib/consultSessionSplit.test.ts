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
 * ⚠️ 這裡守的最重要兩條：
 *   1. 草稿一定要落地。場次已封而紀錄還沒生出來的空窗，中間把視窗關掉就是資料損失。
 *   2. saveSessionRecord() 是**先占**的。舊版的冪等鎖讀的是最後一步才寫進去的 review_id，
 *      所以整段 createReview + createActionItem 都在鎖生效之前跑 —— 連按兩次存檔
 *      就是兩筆諮詢紀錄加兩份一樣的待辦，而場次上一個 review_id 都沒掛。
 */
type Row = Record<string, unknown>;
type Stmt = Record<string, unknown> & { _run: () => Row[] };

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],                                    // 每次 .limit() 依序取一組
  updates: [] as Record<string, unknown>[],                   // 每一次 update().set(v) 的 v
  inserts: [] as { table: string; values: Record<string, unknown>[] }[],
  deletes: [] as string[],                                    // delete from <table>
  /** 先占那一句 `where review_id is null ... returning` 回幾列。[] ＝別人已經存過。 */
  claim: [{ id: "s1" }] as Record<string, unknown>[],
  notes: [] as { kind: string; body: string; visible: boolean; authorAccess: string; id: string; authorName: string | null }[],
}));

vi.mock("@/Shared/db", () => {
  const chain = (run: () => Row[]): Stmt => {
    const c = { _run: run } as Stmt;
    for (const k of ["where", "returning", "orderBy", "innerJoin", "onConflictDoNothing"]) c[k] = () => c;
    c.limit = () => Promise.resolve(run());
    // batch 拿到的是還沒被 await 的語句物件；直接 await 時才「執行」。
    c.then = (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return c;
  };
  const nameOf = (t: unknown) => String((t as { _n?: string })?._n ?? "?");
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
          state.updates.push(v);
          // 先占那一句（唯一一句會 set reviewId 的 update）回 state.claim；
          // 其餘（封場、改註記可見性）回一列假的場次。
          const isClaim = nameOf(t) === "consult_sessions" && "reviewId" in v;
          return chain(() =>
            isClaim
              ? state.claim
              : [{ id: "s1", clientId: "c1", planId: "p1", draftSummary: v.draftSummary ?? null }],
          );
        },
      }),
      insert: (t: unknown) => ({
        values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          state.inserts.push({ table: nameOf(t), values: Array.isArray(v) ? v : [v] });
          return chain(() => [{ id: "new" }]);
        },
      }),
      delete: (t: unknown) => {
        state.deletes.push(nameOf(t));
        return chain(() => []);
      },
      // neon-http 的 db.batch()：一次交易送多句，依序回每一句的結果。
      batch: (items: Stmt[]) => Promise.resolve(items.map((i) => i._run())),
    },
  };
});
// 假 schema：欄位給空物件就夠（真正的 where 條件由假 drizzle 吃掉），
// 但表要認得出自己是誰 —— 先占／回滾都要分辨寫的是哪一張表。
vi.mock("@/Shared/db/schema", () => {
  const tbl = (n: string) => new Proxy({}, { get: (_t, k) => (k === "_n" ? n : {}) });
  return {
    consultSessions: tbl("consult_sessions"), clients: tbl("clients"), clientNotes: tbl("client_notes"),
    planRevisions: tbl("plan_revisions"), plans: tbl("plans"), reviews: tbl("reviews"), actionItems: tbl("action_items"),
  };
});
vi.mock("drizzle-orm", () => {
  const f = () => ({});
  return { and: f, desc: f, eq: f, isNull: f, lt: f, sql: Object.assign(f, { raw: f }) };
});
vi.mock("./clientScope", () => ({ ownedClient: () => ({}) }));
vi.mock("./snapshot", () => ({ sessionMetrics: () => ({ shortPV: 3_240_000, net: 0, gap: null }) }));
vi.mock("./notes", () => ({ notesOfSession: async () => state.notes }));
vi.mock("./reviews", () => ({ assertPlanOfClient: async () => {} }));

const Session = await import("./consultSession");

const N = (kind: string, body: string) =>
  ({ id: "n" + state.notes.length, kind, body, visible: false, authorAccess: "owner", authorName: null });

const openSessionRow = { id: "s1", clientId: "c1", coachId: "u1", planId: "p1", revisionId: "r1", startedAt: new Date(), endedAt: null, closeReason: null, reviewId: null, metricsBefore: { shortPV: 4_860_000, net: 0, gap: null }, metricsAfter: null, closingNote: null, draftSummary: null };

const inserted = (table: string) => state.inserts.filter((i) => i.table === table).flatMap((i) => i.values);

beforeEach(() => {
  state.rows = []; state.updates = []; state.inserts = []; state.deletes = [];
  state.claim = [{ id: "s1" }]; state.notes = [];
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
    expect(inserted("reviews"), "按結束的當下不該有正式紀錄").toEqual([]);
    expect(inserted("action_items"), "待辦也要等存檔才進追蹤").toEqual([]);
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
    const revs = inserted("reviews");
    expect(revs.length).toBe(1);
    expect(revs[0].date, "不可以被覆蓋成今天").toBe("2026-08-05");
    expect(revs[0].type).toBe("adhoc");
    expect(revs[0].summary).toBe("貼進來的一整段");
  });

  it("待辦這時候才進追蹤", async () => {
    await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(inserted("action_items").map((i) => i.title)).toEqual(["請個案提供三筆負債對帳單"]);
  });

  it("存完要把草稿清掉、掛上 reviewId（提醒才會消失）", async () => {
    const r = await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(r.ok).toBe(true);
    const done = state.updates.find((u) => "reviewId" in u);
    expect(done, "要占位並掛上 reviewId").toBeTruthy();
    expect(done!.draftSummary, "草稿要一起清空").toBe(null);
    // 掛上去的就是預先產生的那一組 uuid，跟寫進 reviews 的那一列同一個。
    if (!r.ok) return;
    expect(done!.reviewId).toBe(r.reviewId);
    expect(inserted("reviews")[0].id).toBe(r.reviewId);
  });

  it("同一場不能存兩次紀錄（快取到的舊列就已經有 reviewId）", async () => {
    state.rows = [[{ ...closed, reviewId: "already" }], [{ id: "c1" }]];
    const r = await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(r.ok).toBe(false);
    expect(inserted("reviews")).toEqual([]);
  });

  it("沒有 planId 傳進來時沿用場次自己的版本", async () => {
    await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(inserted("reviews")[0].planId).toBe("p1");
  });

  it("⚠️⚠️ 先占：id 是自己產的，而且 review 要在占位之前寫（外鍵指向它）", async () => {
    await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    const order = state.inserts.map((i) => i.table);
    expect(order[0], "reviews 必須第一句：consult_sessions.review_id 的外鍵指向它").toBe("reviews");
    expect(order).toContain("action_items");
    expect(inserted("reviews")[0].id, "id 由 Node 先產，不是等 DB 給").toMatch(/^[0-9a-f-]{36}$/);
    expect(inserted("action_items")[0].reviewId).toBe(inserted("reviews")[0].id);
  });

  it("⚠️⚠️ 沒占到（別人同時存過）→ 回失敗，而且把剛剛寫進去的 review 收回去", async () => {
    state.claim = []; // where review_id is null 回 0 列
    const r = await Session.saveSessionRecord("u1", "s1", { date: "2026-08-05", type: "review" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("存過");
    expect(state.deletes, "孤兒 review 要刪掉（action_items 是 CASCADE，會一起走）").toEqual(["reviews"]);
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
