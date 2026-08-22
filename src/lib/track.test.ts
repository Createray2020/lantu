/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 雙軌邊界（plans.track）。
 *
 * 同一位客戶名下有兩條並行的 plan：教練做的年度版（track='coach'）與客戶自己的
 * 人生護照（track='client'）。此前兩者是靠 label='人生護照' 這個顯示用文字分辨的，
 * 而教練端所有「撈這位客戶的 plans」的查詢都沒有任何 track/label 條件——
 * 一旦同年兩軌並存（改了唯一鍵之後這是常態），護照就會混進教練視角：
 * 出現在「年度版本」清單裡並掛著刪除鈕（刪掉會連 plan_revisions 一起 CASCADE）、
 * 頂掉客戶列表的財務階段與淨值、在版本比較裡變成第二個同年欄位。
 *
 * 這支測試刻意讓 mock 的 where 真的執行過濾（其他測試檔的 mock 是 no-op），
 * 因為這裡要守的正是「查詢有沒有帶 track 條件」，no-op 的 mock 一律會通過。
 */

const h = vi.hoisted(() => {
  const store: any = { plans: [], clients: [], reviews: [], action_items: [] };

  // drizzle 的 column.name 是 DB 欄位名（snake_case），假資料用的是 JS 屬性名（camelCase）——
  // 兩邊都試才對得上。
  const get = (row: any, col: string) =>
    row[col] !== undefined ? row[col] : row[col.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase())];

  // --- 條件樹：mock drizzle-orm 的比較函式，讓它們變成可求值的描述物件 ---
  const evalCond = (c: any, row: any): boolean => {
    if (!c) return true;
    switch (c.__op) {
      case "and": return c.parts.every((p: any) => evalCond(p, row));
      case "eq": return get(row, c.col) === c.val;
      case "ne": return get(row, c.col) !== c.val;
      case "inArray": return c.val.includes(get(row, c.col));
      default: return true;
    }
  };

  const tableOf = (t: any) => {
    const n = t?.[Symbol.for("drizzle:Name")] ?? t?._n;
    return n;
  };

  const makeChain = (t: any) => {
    let cond: any = null;
    const rows = () => (store[tableOf(t)] ?? []).filter((r: any) => evalCond(cond, r));
    const c: any = {
      where: (x: any) => { cond = x; return c; },
      orderBy: () => c,
      limit: (n: number) => Promise.resolve(rows().slice(0, n)),
      innerJoin: () => c,
      then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
    };
    return c;
  };

  const db = {
    select: (proj?: any) => ({
      from: (t: any) => {
        const chain = makeChain(t);
        // 投影：模擬 select({...}) 只回指定欄位，並支援 innerJoin 後的 { plan: plans } 形狀
        const wrap = (rowsP: Promise<any[]>) =>
          rowsP.then((rs) =>
            rs.map((r) => {
              if (!proj) return r;
              const out: any = {};
              for (const [k, v] of Object.entries<any>(proj)) {
                if (v && typeof v === "object" && !("name" in v) && !("__sql" in v)) out[k] = r; // { plan: plans }
                else if (v?.__sql) out[k] = r.__count ?? 0;
                else out[k] = get(r, v?.name ?? k);
              }
              return out;
            }),
          );
        const c: any = {
          where: (x: any) => { chain.where(x); return c; },
          orderBy: () => c,
          innerJoin: () => c,
          limit: (n: number) => wrap(chain.limit(n)),
          then: (res: any, rej: any) => wrap(Promise.resolve(chain)).then(res, rej),
        };
        return c;
      },
    }),
    delete: (t: any) => ({ where: (x: any) => { store.__deleted = { table: tableOf(t), cond: x }; return Promise.resolve(); } }),
    update: (t: any) => ({ set: (v: any) => ({ where: (x: any) => { store.__updated = { table: tableOf(t), values: v, cond: x }; return Promise.resolve(); } }) }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "new" }]) }) }),
  };
  return { store, db, evalCond };
});

vi.mock("drizzle-orm", () => ({
  and: (...parts: any[]) => ({ __op: "and", parts: parts.filter(Boolean) }),
  eq: (col: any, val: any) => ({ __op: "eq", col: col?.name, val }),
  ne: (col: any, val: any) => ({ __op: "ne", col: col?.name, val }),
  inArray: (col: any, val: any) => ({ __op: "inArray", col: col?.name, val }),
  desc: (c: any) => c,
  asc: (c: any) => c,
  count: () => ({ __sql: true }),
  sql: Object.assign(() => ({ __sql: true }), { raw: () => ({ __sql: true }) }),
}));

vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("./snapshot", () => ({
  planSnapshot: () => ({ healthGrade: "B", netWorth: 0 }),
  planMetrics: () => ({ netWorth: 0, healthGrade: "B", monthlySaving: 0 }),
  newCaseData: () => ({}),
}));
vi.mock("./coachProfile", () => ({ listPublicCoaches: async () => [{ specialties: ["退休"] }] }));

const COACH = "coach-1";
const CLIENT_ID = "client-1";

function seed() {
  h.store.clients = [{ id: CLIENT_ID, coachId: COACH, name: "測試客戶" }];
  // mock 不模擬 innerJoin，所以把 join 後才會有的 coachId 直接掛在 plan 列上，
  // 讓 ownedPlan 的 eq(clients.coachId, …) 條件求得到值。
  h.store.plans = [
    { id: "p-coach-2026", coachId: COACH, clientId: CLIENT_ID, year: 2026, track: "coach", label: "2026 初版", status: "active", data: {}, healthGrade: "B", netWorth: 5_000_000, createdAt: new Date("2026-03-01"), updatedAt: new Date("2026-03-01"), basedOnDate: null },
    { id: "p-client-2026", coachId: COACH, clientId: CLIENT_ID, year: 2026, track: "client", label: "人生護照", status: "draft", data: {}, healthGrade: "D", netWorth: 120_000, createdAt: new Date("2026-08-01"), updatedAt: new Date("2026-08-01"), basedOnDate: null },
  ];
  h.store.reviews = [];
  h.store.action_items = [];
  delete h.store.__deleted;
  delete h.store.__updated;
}

beforeEach(() => { vi.resetModules(); seed(); });

describe("plans.ts：教練那一軌以外的東西，教練碰不到", () => {
  it("deletePlan 不能刪掉客戶的人生護照", async () => {
    const { deletePlan } = await import("./plans");
    // 這是最要命的一條：護照被刪 → plan_revisions CASCADE → 客戶整條版本歷史消失、不可復原。
    await expect(deletePlan(COACH, "p-client-2026")).rejects.toThrow("forbidden");
    expect(h.store.__deleted).toBeUndefined();
  });

  it("deletePlan 仍然刪得掉自己的年度版", async () => {
    const { deletePlan } = await import("./plans");
    await deletePlan(COACH, "p-coach-2026");
    expect(h.store.__deleted?.table).toBe("plans");
  });

  it("updatePlanData 不能覆寫客戶的人生護照", async () => {
    const { updatePlanData } = await import("./plans");
    // PlanEditor 是 700ms debounce 自動存檔——只要教練點得進去，滑鼠碰一下就整份蓋掉。
    await expect(updatePlanData(COACH, "p-client-2026", { x: 1 })).rejects.toThrow("forbidden");
    expect(h.store.__updated).toBeUndefined();
  });

  it("updatePlanMeta 不能改客戶護照的 label／狀態／年度", async () => {
    const { updatePlanMeta } = await import("./plans");
    await expect(updatePlanMeta(COACH, "p-client-2026", { label: "改掉" })).rejects.toThrow("forbidden");
  });

  it("getPlan 讀不到客戶的護照", async () => {
    const { getPlan } = await import("./plans");
    expect(await getPlan(COACH, "p-client-2026")).toBeNull();
    expect(await getPlan(COACH, "p-coach-2026")).not.toBeNull();
  });

  it("comparePlans 只比教練那一軌", async () => {
    const { comparePlans } = await import("./plans");
    const rows = await comparePlans(COACH, CLIENT_ID);
    expect(rows.map((r) => r.id)).toEqual(["p-coach-2026"]);
    // 否則同年會出現兩個「2026」欄位，而護照只有五面向推估、沒有完整現況，跨年趨勢直接失真。
  });
});

describe("clients.ts：兩軌分開回，護照不進年度版清單", () => {
  it("getClientDetail 的 plans 只有教練軌，護照另外單獨回", async () => {
    const { getClientDetail } = await import("./clients");
    const d = await getClientDetail(COACH, CLIENT_ID);
    expect(d!.plans.map((p) => p.id)).toEqual(["p-coach-2026"]);
    expect(d!.passportPlan?.id).toBe("p-client-2026");
  });

  it("沒做過護照的客戶，passportPlan 是 null", async () => {
    h.store.plans = h.store.plans.filter((p: any) => p.track === "coach");
    const { getClientDetail } = await import("./clients");
    const d = await getClientDetail(COACH, CLIENT_ID);
    expect(d!.passportPlan).toBeNull();
    expect(d!.plans).toHaveLength(1);
  });

  it("listClientsForCoach 的最新版本不會被護照頂掉", async () => {
    const { listClientsForCoach } = await import("./clients");
    const rows = await listClientsForCoach(COACH);
    // 護照的 createdAt 比較新（客戶後來才註冊試算），沒有 track 條件的話它會變成 latestPlan，
    // 讓列表顯示 D 級與 12 萬淨值——那是護照骨架的數字，不是這位客戶的真實狀況。
    expect(rows[0].latestPlan?.healthGrade).toBe("B");
    expect(rows[0].latestPlan?.netWorth).toBe(5_000_000);
  });
});

describe("landing.ts：官網信任數字", () => {
  it("只算教練做的、已交付的規劃", async () => {
    h.store.plans = [
      { id: "a", track: "coach", status: "active" },
      { id: "b", track: "coach", status: "delivered" },
      { id: "c", track: "coach", status: "draft" },   // 建檔時自動產生的空白初版
      { id: "d", track: "client", status: "draft" },  // 客戶的人生護照
    ].map((p) => ({ ...p, __count: 0 }));
    const { getLandingStats } = await import("./landing");
    const stats = await getLandingStats(new Date("2026-08-21"));
    // count 走 sql`count(*)` 在 mock 裡拿不到真值，這裡確認的是「條件有生效、沒把 4 筆全算進去」。
    expect(stats.asOf).toBe("2026/08");
    expect(stats.coaches).toBe(1);
  });
});
