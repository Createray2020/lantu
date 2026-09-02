import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 「填了卻沒進計算」的四條同步。
 *
 * Ray 2026/09/01 資料勾稽盤點之後：「我不想要有一堆數據，做了半天的，根本沒有算進去。」
 *   ① 本人月薪      → 收入表
 *   ② 保單現金價值  → 資產表
 *   ③ 婚姻預算      → 目標表
 *   ④ 勞保／勞退概算 → 已準備退休金
 *
 * ⚠️⚠️ 這一組最危險的失敗不是「沒接上」，是「接了兩次」——教練若已經手打過同一筆錢，
 *    自動列一加就變兩份，而且不會噴任何錯。所以每一條都有擋重複，測試也逐條守著。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
});

/** 一個乾淨的空案子：只填來源欄位，下游各表都空著。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fresh(): any {
  const c = w.migrateCase(w.newCase());
  c.profile.age = 40;
  c.profile.retireAge = 65;
  c.profile.lifeExp = 85;
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.role = "coach";
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const autoIn = (arr: any[], key: string) => (arr || []).filter((x) => x && x[key]);

describe("① 本人月薪 → 收入表", () => {
  it("收入表空著時，月薪變成一列年化的工作收入", () => {
    const c = fresh();
    c.profile.monthlySalary = 80_000;
    w.migrateCase(c);
    const rows = autoIn(c.incomes, "salaryAuto");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(960_000);
    expect(rows[0].type).toBe("工作");
    expect(rows[0].start).toBe(40);
    expect(rows[0].end).toBe(65);
    expect(w.metrics(c).incTotal).toBe(960_000);
  });

  it("⚠️ 收入表已經有手打的工作收入 → 不自動加，改在畫面上講出來", () => {
    const c = fresh();
    c.profile.monthlySalary = 80_000;
    c.incomes = [{ name: "薪資", owner: "本人", type: "工作", period: "年", amount: 1_000_000, start: 40, end: 65 }];
    w.migrateCase(c);
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(0);
    expect(c.incomes).toHaveLength(1);
    expect(w.autoBlockedHTML(c, "salary")).toContain("本人月薪");
  });

  it("理財類收入不算衝突（那不是薪水）", () => {
    const c = fresh();
    c.profile.monthlySalary = 80_000;
    c.incomes = [{ name: "股利", owner: "本人", type: "理財", period: "年", amount: 200_000, start: 40, end: 85 }];
    w.migrateCase(c);
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(1);
  });
});

describe("② 保單現金價值 → 資產表", () => {
  it("有效保單的現金價值合計成一列資產", () => {
    const c = fresh();
    c.policies = [
      { pid: "p1", name: "終身壽險", status: "有效", subtype: "終身壽險", premium: 60_000, cashValue: 800_000 },
      { pid: "p2", name: "儲蓄險", status: "有效", subtype: "終身壽險", premium: 40_000, cashValue: 200_000 },
    ];
    w.migrateCase(c);
    const rows = autoIn(c.assets, "polAuto");
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(1_000_000);
    expect(w.metrics(c).net).toBe(1_000_000);
  });

  it("失效保單不計入", () => {
    const c = fresh();
    c.policies = [{ pid: "p1", name: "x", status: "失效", subtype: "終身壽險", cashValue: 800_000 }];
    w.migrateCase(c);
    expect(autoIn(c.assets, "polAuto")).toHaveLength(0);
  });

  it("⚠️ 資產表已經有名稱含保單／儲蓄險的列 → 不自動加", () => {
    const c = fresh();
    c.policies = [{ pid: "p1", name: "x", status: "有效", subtype: "終身壽險", cashValue: 800_000 }];
    c.assets = [{ name: "儲蓄險解約金", owner: "本人", mainCat: "可投資資產", type: "其他", value: 700_000, fxRate: 1 }];
    w.migrateCase(c);
    expect(autoIn(c.assets, "polAuto")).toHaveLength(0);
    expect(w.autoBlockedHTML(c, "policyAsset")).toContain("保單現金價值");
  });
});

describe("③ 婚姻預算 → 目標表", () => {
  it("打算結婚且有預算與年齡時長出一列婚姻目標", () => {
    const c = fresh();
    c.marriage = { plan: "是", age: 42, budget: 800_000, minBudget: 400_000, importance: 4 };
    w.migrateCase(c);
    const rows = autoIn(c.goals, "marriageAuto");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("婚姻");
    expect(rows[0].present).toBe(800_000);
    expect(rows[0].minPresent).toBe(400_000);
    expect(rows[0].start).toBe(42);
  });

  it("⚠️ 已經展開婚禮費用明細時不生成——那張表才是逐項的真相，兩邊都算等於算兩次", () => {
    const c = fresh();
    c.marriage = { plan: "是", age: 42, budget: 800_000, minBudget: 0, importance: 4 };
    c.goals = [{ on: true, tag: "wedding", name: "喜宴", type: "婚姻", present: 350_000,
      start: 42, end: 42, freq: 0, growth: "通膨", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 }];
    w.migrateCase(c);
    expect(autoIn(c.goals, "marriageAuto")).toHaveLength(0);
  });

  it("沒打算結婚、或沒填年齡就不生成", () => {
    const c = fresh();
    c.marriage = { plan: "否", age: 42, budget: 800_000 };
    w.migrateCase(c);
    expect(autoIn(c.goals, "marriageAuto")).toHaveLength(0);
    c.marriage = { plan: "是", age: "", budget: 800_000 };
    w.migrateCase(c);
    expect(autoIn(c.goals, "marriageAuto")).toHaveLength(0);
  });
});

describe("④ 勞保／勞退概算 → 已準備退休金", () => {
  it("填了投保薪資與年資，概算就自動計入已備（不用再按那顆按鈕）", () => {
    const c = fresh();
    c.members[0].insType = "勞保";
    c.members[0].insSalary = 45_800;
    c.members[0].worked = 15;
    w.migrateCase(c);
    const rows = autoIn(c.retire.prepared, "laborAuto");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r: { item: string }) => r.item).join()).toContain("勞保老年年金(概算)");
    expect(w.retireNeed(c).prepared).toBeGreaterThan(0);
  });

  it("⚠️ 已備裡已經有手打的勞保／勞退列 → 不自動帶入", () => {
    const c = fresh();
    c.members[0].insType = "勞保";
    c.members[0].insSalary = 45_800;
    c.members[0].worked = 15;
    c.retire.prepared = [{ item: "勞退", age: 65, amount: 3_000_000, method: "一次領" }];
    w.migrateCase(c);
    expect(autoIn(c.retire.prepared, "laborAuto")).toHaveLength(0);
    expect(w.autoBlockedHTML(c, "labor")).toContain("勞保／勞退概算");
  });

  it("舊版按鈕加的列會被接管成自動列，不會變兩份", () => {
    const c = fresh();
    c.members[0].insType = "勞保";
    c.members[0].insSalary = 45_800;
    c.members[0].worked = 15;
    c.retire.prepared = [{ item: "勞保老年年金(概算)", age: 65, amount: 1, method: "一次領" }];
    w.migrateCase(c);
    const lp = c.retire.prepared.filter((p: { item: string }) => p.item === "勞保老年年金(概算)");
    expect(lp).toHaveLength(1);
    expect(lp[0].laborAuto).toBe("lp");
    expect(lp[0].amount).toBeGreaterThan(1); // 已被重算，不是留著那個 1
  });
});

describe("共通：冪等、收得掉、關得掉", () => {
  it("⚠️ 跑幾次都只有一列（重填是更新不是複製）", () => {
    const c = fresh();
    c.profile.monthlySalary = 80_000;
    c.policies = [{ pid: "p1", name: "x", status: "有效", subtype: "終身壽險", cashValue: 500_000 }];
    c.marriage = { plan: "是", age: 42, budget: 800_000 };
    for (let i = 0; i < 4; i++) w.migrateCase(c);
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(1);
    expect(autoIn(c.assets, "polAuto")).toHaveLength(1);
    expect(autoIn(c.goals, "marriageAuto")).toHaveLength(1);
  });

  it("源頭清空，自動列自己收掉", () => {
    const c = fresh();
    c.profile.monthlySalary = 80_000;
    w.migrateCase(c);
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(1);
    c.profile.monthlySalary = 0;
    w.migrateCase(c);
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(0);
  });

  it("教練可以整條關掉", () => {
    const c = fresh();
    c.profile.monthlySalary = 80_000;
    w.migrateCase(c);
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(1);
    c.autoOff = { salary: true };
    w.migrateCase(c);
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(0);
  });

  it("自動列在表上鎖住不可手改，並標出來源", () => {
    const c = fresh();
    c.profile.monthlySalary = 80_000;
    c.policies = [{ pid: "p1", name: "x", status: "有效", subtype: "終身壽險", cashValue: 500_000 }];
    w.migrateCase(c);
    const inc = w.finIncTable(c) as string;
    expect(inc).toContain("來自月薪欄");
    expect(inc).toContain("autorow");
    const asset = w.assetsSec(c) as string;
    expect(asset).toContain("來自保單表");
  });
});

describe("⚠️ 示範案例的數字一位都不能動（四條的擋重複全部命中）", () => {
  it("示範案例不長出任何自動列，總數與改版前一致", () => {
    const c = w.migrateCase(w.sampleCase());
    w.app.cases = [c];
    w.app.activeId = c.id;
    expect(autoIn(c.incomes, "salaryAuto")).toHaveLength(0);   // 收入表已有工作收入
    expect(autoIn(c.assets, "polAuto")).toHaveLength(0);       // 保單沒填現金價值
    expect(autoIn(c.goals, "marriageAuto")).toHaveLength(0);   // 沒打算結婚
    expect(autoIn(c.retire.prepared, "laborAuto")).toHaveLength(0); // 已備已有手打的「勞退」
    expect(Math.round(w.metrics(c).net)).toBe(16_480_000);
    expect(Math.round(w.metrics(c).incTotal)).toBe(1_900_000);
    expect(Math.round(w.retireNeed(c).prepared)).toBe(3_000_000);
    expect(Math.round(w.retireNeed(c).gap)).toBe(14_943_403);
    expect(Math.round(w.projection(c).shortPV)).toBe(362_910);
  });
});
