import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 永久刪除一位客戶（2026/09/13）。
 *
 * 封存與刪除是兩件不同的事：封存只改一個 status 欄位（換到的是額度，資料全留）；
 * 刪除是整列消失，plans / reviews / action_items / client_notes / consult_sessions /
 * client_risk_quiz / coach_link_requests / client_collaborators 全部 CASCADE 跟著走。
 *
 * ⚠️ 這裡守的是三道門檻，而且守的重點是「它們在 **server 端**」：
 *   1. 只准刪已封存的（比照 templates.ts 的 purgeTemplate：先封存 → 確認 → 再刪）
 *   2. 姓名要打對——⚠️ 只擋在 UI 的話門檻等於沒有，繞過畫面直接呼叫 action 就穿了
 *   3. 有分潤案件（comp_cases）一律擋——那是財務紀錄，client_id 是 set null，
 *      刪了客戶案件會留著卻指不到人
 * 外加：真正那句 DELETE 的 WHERE 要**重帶** status='archived'，不能只靠前面的預檢——
 * 兩次查詢之間另一個分頁把它解除封存了，這一句必須什麼都不做。
 */
type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  deletes: [] as string[],
  updates: [] as { table: string; set: Record<string, unknown> }[],
  /** 每一次 eq(col, value)：記成 [欄名, 值]。 */
  eqs: [] as [string | undefined, unknown][],
}));

vi.mock("@/Shared/db", () => {
  const nameOf = (t: unknown) => String((t as { _n?: string })?._n ?? "?");
  const pull = () => (state.rows.shift() ?? []) as Row[];
  return {
    db: {
      select: () => {
        const o: Record<string, unknown> = {};
        for (const k of ["from", "where", "orderBy", "innerJoin", "leftJoin", "groupBy"]) o[k] = () => o;
        o.limit = () => Promise.resolve(pull());
        // compCaseCount() 直接 await 這條鏈（沒有 .limit()）。
        o.then = (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(pull()).then(res, rej);
        return o;
      },
      update: (t: unknown) => ({
        set: (v: Record<string, unknown>) => {
          state.updates.push({ table: nameOf(t), set: v });
          const c: Record<string, unknown> = {};
          c.where = () => Promise.resolve([]);
          return c;
        },
      }),
      delete: (t: unknown) => {
        state.deletes.push(nameOf(t));
        return { where: () => Promise.resolve([]) };
      },
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "new" }]) }) }),
    },
  };
});
vi.mock("@/Shared/db/schema", () => {
  const tbl = (n: string) => new Proxy({}, { get: (_t, k) => (k === "_n" ? n : { _t: n, _c: String(k) }) });
  return {
    clients: tbl("clients"), plans: tbl("plans"), reviews: tbl("reviews"), actionItems: tbl("action_items"),
    clientCollaborators: tbl("client_collaborators"), coaches: tbl("coaches"), compCases: tbl("comp_cases"),
    coachDisplayName: () => ({}),
  };
});
vi.mock("drizzle-orm", () => {
  const f = () => ({});
  return {
    and: f, asc: f, desc: f, inArray: f, count: f, sql: Object.assign(f, { raw: f }),
    eq: (c: { _c?: string } | undefined, v: unknown) => { state.eqs.push([c?._c, v]); return {}; },
  };
});
vi.mock("./clientScope", () => ({
  ownedClient: () => ({}), readableClient: () => ({}), COLLAB_ACCEPTED: "accepted",
}));
vi.mock("./snapshot", () => ({ newCaseData: () => ({}), planSnapshot: () => ({}) }));
vi.mock("./codeAlloc", () => ({ allocCode: async () => "2609001" }));

const Clients = await import("./clients");

const CID = "coach-1";
const ID = "client-1";
const archived = { id: ID, coachId: CID, name: "王小明", status: "archived", isTemplate: false, clientUserId: null };

beforeEach(() => { state.rows = []; state.deletes = []; state.updates = []; state.eqs = []; });

describe("三道門檻（每一道都在 server 端）", () => {
  it("⚠️ 還沒封存的不能刪", async () => {
    state.rows = [[{ ...archived, status: "active" }]];
    const r = await Clients.deleteClient(CID, ID, "王小明");
    expect(r).toEqual({ ok: false, reason: "not-archived" });
    expect(state.deletes, "一列都不該刪").toEqual([]);
  });

  it("⚠️⚠️ 姓名打錯就什麼都不刪——這道驗證不能只留在 UI", async () => {
    state.rows = [[archived], [{ n: 0 }]];
    const r = await Clients.deleteClient(CID, ID, "王小名");
    expect(r).toEqual({ ok: false, reason: "name-mismatch" });
    expect(state.deletes).toEqual([]);
  });

  it("前後空白可以忽略，錯字不行", async () => {
    state.rows = [[archived], [{ n: 0 }]];
    expect((await Clients.deleteClient(CID, ID, "  王小明 ")).ok).toBe(true);
  });

  it("⚠️ 有分潤案件的一律擋——那是財務紀錄", async () => {
    state.rows = [[archived], [{ n: 3 }]];
    const r = await Clients.deleteClient(CID, ID, "王小明");
    expect(r).toEqual({ ok: false, reason: "has-comp" });
    expect(state.deletes).toEqual([]);
  });

  it("範本不走這條（它有自己的 purgeTemplate）", async () => {
    state.rows = [[{ ...archived, isTemplate: true }]];
    expect(await Clients.deleteClient(CID, ID, "王小明")).toEqual({ ok: false, reason: "template" });
    expect(state.deletes).toEqual([]);
  });

  it("不是自己的客戶＝找不到（ownedClient 擋在資料層）", async () => {
    state.rows = [[]];
    expect(await Clients.deleteClient(CID, ID, "王小明")).toEqual({ ok: false, reason: "not-found" });
    expect(state.deletes).toEqual([]);
  });
});

describe("真的刪的時候", () => {
  beforeEach(() => { state.rows = [[archived], [{ n: 0 }]]; });

  it("刪的是 clients 那一列（其餘靠 CASCADE）", async () => {
    const r = await Clients.deleteClient(CID, ID, "王小明");
    expect(r.ok).toBe(true);
    expect(state.deletes).toEqual(["clients"]);
  });

  it("⚠️⚠️ DELETE 的 WHERE 要重帶 status='archived' 與 is_template=false", async () => {
    state.eqs = [];
    await Clients.deleteClient(CID, ID, "王小明");
    // 預檢之後、DELETE 之前，狀態可能已經被另一個分頁改掉；條件不重帶的話
    // 這一句就會刪掉一位剛剛被解除封存的活客戶。
    expect(state.eqs).toContainEqual(["status", "archived"]);
    expect(state.eqs).toContainEqual(["isTemplate", false]);
  });
});

describe("預檢：按下去之前就講得出理由", () => {
  it("可以刪時回傳姓名與「有沒有登入帳號」（確認框要用它多講一句）", async () => {
    state.rows = [[{ ...archived, clientUserId: "user-9" }], [{ n: 0 }]];
    expect(await Clients.clientDeletable(CID, ID)).toEqual({ ok: true, name: "王小明", hasLogin: true });
  });

  it("不能刪時回傳原因與案件數", async () => {
    state.rows = [[archived], [{ n: 2 }]];
    expect(await Clients.clientDeletable(CID, ID)).toEqual({ ok: false, reason: "has-comp", compCases: 2 });
  });
});

describe("解除封存", () => {
  it("寫回 active（原本只有寫進 archived 的那一支，封存是單向的）", async () => {
    state.rows = [[archived]];
    await Clients.setClientStatus(CID, ID, "active");
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].table).toBe("clients");
    expect(state.updates[0].set.status).toBe("active");
  });
});
