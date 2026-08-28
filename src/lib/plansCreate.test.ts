import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「新增版本」的預設年份與撞鍵處理。
 *
 * ⚠️ 舊版是 `year ?? new Date().getFullYear()`，而 createClient() 已經替每位新客戶
 * 建好一份「今年 + coach 軌」的初版 —— 所以「剛建好客戶、按一下新增版本」這個**最常見**的
 * 操作是必定撞上 plans_client_id_year_track_uidx 的。撞了之後 unique violation 一路往上丟，
 * Next 在正式環境會把訊息換成沒有意義的 digest，教練看到的是一串亂碼，
 * 完全不知道該做什麼（正確的動作其實只是「改年份」或「改用年度重製」）。
 *
 * 現在：預設年份＝該客戶 **coach 軌**現有最大年 +1（與 clonePlan 同一條規則），
 * 撞鍵回 { ok:false, error }，權限不足仍然 throw("forbidden")。
 */
const h = vi.hoisted(() => {
  const state = {
    ownedRows: [] as unknown[],
    yearRows: [] as { year: number }[],
    conds: [] as { table: string; cond: unknown }[],
    inserted: [] as Record<string, unknown>[],
    insertError: null as unknown,
  };
  return { state };
});

vi.mock("@/Shared/db/schema", () => {
  const tbl = (n: string) =>
    new Proxy({}, { get: (_t, k) => (k === "_n" ? n : typeof k === "string" ? `${n}.${k}` : {}) });
  return { plans: tbl("plans"), clients: tbl("clients") };
});
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...xs: unknown[]) => ({ and: xs }),
  asc: () => ({}),
  desc: () => ({}),
}));
vi.mock("./clientScope", () => ({
  ownedClient: (id: string) => ({ owned: id }),
  readableClient: (id: string) => ({ readable: id }),
}));
vi.mock("./snapshot", () => ({
  newCaseData: (name: string) => ({ profile: { name } }),
  planSnapshot: () => ({ healthGrade: "B", netWorth: 1234 }),
  planMetrics: () => ({}),
}));
vi.mock("@/Shared/db", () => {
  const rowsFor = (t: string): unknown[] =>
    t === "clients" ? h.state.ownedRows : h.state.yearRows;
  return {
    db: {
      select: () => {
        let table = "";
        const o: Record<string, unknown> = {};
        o.from = (t: { _n: string }) => { table = t._n; return o; };
        o.innerJoin = () => o;
        o.where = (c: unknown) => { h.state.conds.push({ table, cond: c }); return o; };
        o.orderBy = () => o;
        o.limit = () => Promise.resolve(rowsFor(table));
        o.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(rowsFor(table)).then(res, rej);
        return o;
      },
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          returning: () => {
            if (h.state.insertError) return Promise.reject(h.state.insertError);
            h.state.inserted.push(v);
            return Promise.resolve([{ id: "plan-new" }]);
          },
        }),
      }),
    },
  };
});

const { createPlan } = await import("./plans");

/** 把巢狀的 and(eq(...), eq(...)) 攤平成 [[欄位, 值], …]，用來確認 where 真的帶了哪些條件。 */
function pairs(cond: unknown, out: [unknown, unknown][] = []): [unknown, unknown][] {
  if (!cond || typeof cond !== "object") return out;
  const o = cond as { and?: unknown[]; eq?: [unknown, unknown] };
  if (o.eq) out.push(o.eq);
  if (o.and) for (const x of o.and) pairs(x, out);
  return out;
}

const OWNED = [{ id: "c1" }];

beforeEach(() => {
  h.state.ownedRows = OWNED;
  h.state.yearRows = [];
  h.state.conds = [];
  h.state.inserted = [];
  h.state.insertError = null;
});

describe("createPlan 的預設年份", () => {
  it("⚠️ 客戶已有今年的初版 → 新增版本給的是明年，不是今年（否則必撞唯一鍵）", async () => {
    h.state.yearRows = [{ year: 2026 }];
    const r = await createPlan("u1", "c1", "王小明");
    expect(r.ok).toBe(true);
    expect(h.state.inserted[0].year).toBe(2027);
    expect(h.state.inserted[0].label).toBe("2027 新版");
  });

  it("取的是最大年 +1，不是筆數 +1", async () => {
    h.state.yearRows = [{ year: 2024 }, { year: 2028 }, { year: 2026 }];
    await createPlan("u1", "c1", "王小明");
    expect(h.state.inserted[0].year).toBe(2029);
  });

  it("一份都還沒有（例如舊資料）→ 落回今年", async () => {
    h.state.yearRows = [];
    await createPlan("u1", "c1", "王小明");
    expect(h.state.inserted[0].year).toBe(new Date().getFullYear());
  });

  it("呼叫端指定年份時就用它，不去查最大年", async () => {
    h.state.yearRows = [{ year: 2030 }];
    await createPlan("u1", "c1", "王小明", 2019);
    expect(h.state.inserted[0].year).toBe(2019);
    // 指定年份時完全不需要那一趟查詢
    expect(h.state.conds.filter((c) => c.table === "plans")).toEqual([]);
  });

  it("⚠️ 只算 coach 軌：客戶的人生護照也掛在同一個 clientId 底下，算進去會讓年度憑空跳一格", async () => {
    h.state.yearRows = [{ year: 2026 }];
    await createPlan("u1", "c1", "王小明");
    const q = h.state.conds.find((c) => c.table === "plans");
    expect(q, "要有一趟查最大年的查詢").toBeTruthy();
    expect(pairs(q!.cond)).toContainEqual(["plans.track", "coach"]);
  });
});

describe("createPlan 撞唯一鍵時給得出可以行動的訊息", () => {
  it("unique violation → { ok:false }，訊息說得出年份與下一步", async () => {
    h.state.yearRows = [{ year: 2026 }];
    h.state.insertError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    const r = await createPlan("u1", "c1", "王小明");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("2027");
    expect(r.error).toContain("年度重製");
  });

  it("包了一層的錯誤（neon-http 會包 cause）也認得出來", async () => {
    h.state.insertError = Object.assign(new Error("db error"), { cause: { code: "23505" } });
    const r = await createPlan("u1", "c1", "王小明");
    expect(r.ok).toBe(false);
  });

  it("其他錯誤照樣往上丟——不可以被當成「這一年已經有了」吞掉", async () => {
    h.state.insertError = new Error("connection reset");
    await expect(createPlan("u1", "c1", "王小明")).rejects.toThrow("connection reset");
  });

  it("不是主責教練仍然 throw forbidden（與其他寫入路徑一致）", async () => {
    h.state.ownedRows = [];
    await expect(createPlan("nobody", "c1", "王小明")).rejects.toThrow("forbidden");
    expect(h.state.inserted).toEqual([]);
  });
});
