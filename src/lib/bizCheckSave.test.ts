import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /bizcheck 存檔：把十題答案寫進客戶自己那份規劃，並打開企業主體。
 *
 * 這裡守的是兩件會安靜出錯的事：
 *   1. 只能寫 bizGate 與 intent.entities——這十題問的是「有沒有做到」，不是財務數字。
 *      拿它去碰 incomes/assets 會覆蓋掉客戶或教練已經填好的資料，而且不會有任何錯誤訊息。
 *   2. 還沒有護照份的人不能寫。沒有這道守門，一個從官網進來、還沒建過規劃的訪客
 *      會拿到一個看起來成功、其實什麼都沒存的結果。
 */
const state = vi.hoisted(() => ({
  clientRows: [] as unknown[],
  planRows: [] as unknown[],
  written: null as Record<string, unknown> | null,
}));

vi.mock("@/Shared/db", () => {
  let calls = 0;
  return {
    db: {
      select: () => {
        calls++;
        const o: Record<string, unknown> = {};
        for (const k of ["from", "where", "orderBy", "innerJoin"]) o[k] = () => o;
        o.limit = () => Promise.resolve(calls === 1 ? state.clientRows : state.planRows);
        return o;
      },
      update: () => ({
        set: (v: Record<string, unknown>) => ({ where: () => { state.written = v; return Promise.resolve(); } }),
      }),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "x" }]) }) }),
    },
  };
});
vi.mock("./revisions", () => ({ logRevision: async () => {} }));

const { saveBizCheck } = await import("./clientPlan");

// 一份「已經填得差不多」的規劃：存檔後這些欄位一個都不能被動到
const richCase = () => ({
  profile: { name: "陳老闆", age: 48, retireAge: 65 },
  params: { inflation: 1.5, salaryGrowth: 2, invReturn: 5, tuitionGrowth: 3, emergencyMonths: 6, horizon: 85 },
  retire: { monthLiving: 0, retireReturn: 4, retireInflation: 1.5, prepared: [] },
  incomes: [{ name: "薪資", owner: "陳老闆", type: "工作", amount: 1200000 }],
  assets: [{ name: "現金", owner: "陳老闆", mainCat: "可投資資產", type: "現金", cls: "流動", value: 3000000, movable: true }],
  liabilities: [{ name: "房貸", owner: "陳老闆", mainCat: "房貸", balance: 5000000 }],
  intent: { purposes: ["想進行儲蓄，替未來準備"], targets: ["退休生活規劃"], mustHave: ["退休生活規劃"], entities: {} },
  members: [{ name: "陳老闆", role: "本人", age: 48, depRatio: 100, expRatio: 100 }],
});

const allYes = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, "是"]));

beforeEach(() => { state.clientRows = []; state.planRows = []; state.written = null; });

describe("saveBizCheck", () => {
  it("還沒有規劃的人 → no-passport，而且一個字都不寫", async () => {
    await expect(saveBizCheck("u1", allYes)).rejects.toThrow("no-passport");
    expect(state.written).toBeNull();
  });

  it("有 client 但還沒有護照份 → 一樣不寫", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [];
    await expect(saveBizCheck("u1", allYes)).rejects.toThrow("no-passport");
    expect(state.written).toBeNull();
  });

  it("空答案不寫（避免一個看起來成功、其實什麼都沒存的結果）", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [{ id: "p1", data: richCase(), updatedAt: new Date() }];
    await expect(saveBizCheck("u1", {})).rejects.toThrow("empty-answers");
    expect(state.written).toBeNull();
  });

  it("存進 bizGate 並打開企業主體（客戶端沒有開關，這是唯一路徑）", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [{ id: "p1", data: richCase(), updatedAt: new Date() }];
    await saveBizCheck("u1", { 0: "否", 1: "是", 3: "否" });
    const d = state.written?.data as Record<string, never>;
    expect((d.bizGate as { ans: Record<number, string> }).ans).toEqual({ 0: "否", 1: "是", 3: "否" });
    expect((d.intent as { entities: { company?: boolean } }).entities.company).toBe(true);
  });

  it("⚠️ 只碰 bizGate 與 intent：既有的收入／資產／負債／成員一個都不動", async () => {
    state.clientRows = [{ id: "c1" }];
    const before = richCase();
    state.planRows = [{ id: "p1", data: before, updatedAt: new Date() }];
    await saveBizCheck("u1", allYes);
    const d = state.written?.data as Record<string, unknown>;
    expect(d.incomes).toEqual(before.incomes);
    expect(d.assets).toEqual(before.assets);
    expect(d.liabilities).toEqual(before.liabilities);
    expect(d.members).toEqual(before.members);
    expect((d.profile as { name: string }).name).toBe("陳老闆");
  });

  it("既有的關注議題與必達目標保留，只是多了 entities", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [{ id: "p1", data: richCase(), updatedAt: new Date() }];
    await saveBizCheck("u1", allYes);
    const intent = (state.written?.data as { intent: { purposes: string[]; mustHave: string[] } }).intent;
    expect(intent.purposes).toEqual(["想進行儲蓄，替未來準備"]);
    expect(intent.mustHave).toEqual(["退休生活規劃"]);
  });

  it("塞進超出範圍或不合法的答案會被濾掉，不會寫進 DB", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [{ id: "p1", data: richCase(), updatedAt: new Date() }];
    await saveBizCheck("u1", { 0: "是", 99: "否", 3: "亂填", "-1": "是" } as Record<number, string>);
    const ans = (state.written?.data as { bizGate: { ans: Record<string, string> } }).bizGate.ans;
    expect(ans).toEqual({ 0: "是" });
  });

  it("會一併重算快照（否則教練列表的階段/淨值會停在舊值）", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [{ id: "p1", data: richCase(), updatedAt: new Date() }];
    await saveBizCheck("u1", allYes);
    expect(state.written).toHaveProperty("healthGrade");
    expect(state.written).toHaveProperty("netWorth");
  });
});
