import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 退休需求的口徑：二選一，不是「基本＋額外」。
 *
 * Ray 2026/09/01 的資料勾稽盤點抓到：教練把「期望退休月生活費」從 55,000 改成
 * 165,000，退休總需求一位數都不動——因為只要退休期支出明細表有任何一列，那一格
 * 就完全不參與計算，而畫面上它還開著、看起來還能填。
 *
 * 修法不是改數字，是把隱式判斷換成明確的 retire.mode，並讓畫面講出「現在採用哪一套」。
 * ⚠️ 判定結果必須與改版前等價 —— 既有客戶的退休需求一位都不能動。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mount(): any {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.role = "coach";
  return c;
}

describe("口徑判定", () => {
  it("⚠️ 舊案沒有 mode 時依現況補判定，數字與改版前完全一樣", () => {
    const c = mount();
    const withMode = Math.round(w.retireNeed(c).total);

    const legacy = w.sampleCase();
    delete legacy.retire.mode;
    w.migrateCase(legacy);
    expect(legacy.retire.mode).toBe("detail"); // 示範案例有 4 列明細
    expect(Math.round(w.retireNeed(legacy).total)).toBe(withMode);
  });

  it("明細表是空的就判成簡易", () => {
    const c = w.sampleCase();
    c.retireExpenses = [];
    delete c.retire.mode;
    w.migrateCase(c);
    expect(c.retire.mode).toBe("simple");
    expect(w.retireAnnual(c, 70, 1)).toBe(w.n(c.retire.monthLiving) * 12);
  });

  it("⚠️ mode 是 detail 但明細表被清空 → 退回簡易，不會把退休需求算成 0", () => {
    const c = mount();
    c.retireExpenses = [];
    c.retire.mode = "detail";
    expect(w.retireMode(c)).toBe("simple");
    expect(w.retireAnnual(c, 70, 1)).toBe(w.n(c.retire.monthLiving) * 12);
    expect(w.retireNeed(c).total).toBeGreaterThan(0);
  });
});

describe("兩套口徑各自生效", () => {
  it("簡易口徑下，月生活費真的會改變退休需求（這就是原本壞掉的地方）", () => {
    const c = mount();
    c.retire.mode = "simple";
    const before = Math.round(w.retireNeed(c).total);
    c.retire.monthLiving = w.n(c.retire.monthLiving) * 3;
    expect(Math.round(w.retireNeed(c).total)).not.toBe(before);
  });

  it("逐項口徑下，明細表說了算，月生活費不參與", () => {
    const c = mount();
    expect(w.retireMode(c)).toBe("detail");
    const before = Math.round(w.retireNeed(c).total);
    c.retire.monthLiving = 165_000;
    expect(Math.round(w.retireNeed(c).total)).toBe(before);
    c.retireExpenses[0].amount = w.n(c.retireExpenses[0].amount) * 2;
    expect(Math.round(w.retireNeed(c).total)).not.toBe(before);
  });

  it("⚠️ retireNeed 的分子與逐年迴圈走同一個口徑（不能一個看表、一個看 mode）", () => {
    const c = mount();
    c.retire.mode = "simple";
    const ra = w.n(c.profile.retireAge);
    // 明細表還在，但口徑是簡易 → 分子必須來自 monthLiving
    expect(w.retireAnnual(c, ra, 1)).toBe(w.n(c.retire.monthLiving) * 12);
  });
});

describe("畫面把話講出來", () => {
  it("逐項口徑：月生活費那格改成唯讀並標「未採用」", () => {
    const c = mount();
    const h = w.retireSec(c) as string;
    expect(h).toContain("未採用");
    expect(h).toContain("romoney");
    // 那一格不再是可輸入的欄位
    expect(h).not.toContain("setRetire('monthLiving'");
  });

  it("簡易口徑：月生活費可以填，明細表收進摺疊區", () => {
    const c = mount();
    c.retire.mode = "simple";
    const h = w.retireSec(c) as string;
    expect(h).toContain("setRetire('monthLiving'");
    expect(h).toContain("退休期支出明細（目前未採用）");
  });

  it("切換框寫出目前採用哪一套、合計多少", () => {
    const c = mount();
    const tot = w.retireExpTotal(c);
    expect(tot).toBeGreaterThan(0);
    expect(w.retireModeBox(c)).toContain(w.fmt(tot));
    c.retire.mode = "simple";
    expect(w.retireModeBox(c)).toContain(w.fmt(w.n(c.retire.monthLiving) * 12));
  });

  it("「依工作期帶入」按下去會切到逐項——不用再多按一次", () => {
    const c = mount();
    c.retire.mode = "simple";
    c.retireExpenses = [];
    w.fillRetireFromWork();
    expect(w.app.cases[0].retire.mode).toBe("detail");
    expect(w.app.cases[0].retireExpenses.length).toBeGreaterThan(0);
  });
});

describe("投資型配置：講清楚它影響什麼", () => {
  it("⚠️ 表有列而開關沒勾時，直接說「目前不影響任何數字」", () => {
    const c = mount();
    c.plan = c.plan || {};
    c.plan.useAllocReturn = false;
    c.plan.invest = [{ name: "X", src: "新增投入", principal: 1_000_000, yearly: 200_000, years: 10, ret: 8 }];
    const h = w.allocInvestReachHTML(c) as string;
    expect(h).toContain("不影響任何數字");
    expect(h).toContain("本金與每年投入不會進現金流投影");
    expect(h).toContain("調整動作");
  });

  it("開關勾了就說加權報酬已被採用，但本金仍不進現金流", () => {
    const c = mount();
    c.plan = c.plan || {};
    c.plan.useAllocReturn = true;
    c.plan.invest = [{ name: "X", src: "新增投入", principal: 1_000_000, yearly: 200_000, years: 10, ret: 8 }];
    const h = w.allocInvestReachHTML(c) as string;
    expect(h).toContain("已被試算採用");
    expect(h).toContain("不會進現金流投影");
  });

  it("表是空的就不出現這段（不對還沒填的人囉嗦）", () => {
    const c = mount();
    c.plan = c.plan || {};
    c.plan.invest = [];
    expect(w.allocInvestReachHTML(c)).toBe("");
  });
});
