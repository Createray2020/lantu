import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 收支資債四張表的欄位擴充（2026/08/26 教練回饋）。
 *
 * 六件事：一次性金流、資產到期、被動現金流的月/年與警語、每列備註、
 * 負債期數三連動、拖曳把手移到左側。
 *
 * ⚠️⚠️ 最重要的一條在「被動現金流」：教練回報「這欄好像不會跟收入連動」，
 * 但查下來**一直都有連動**（assetPassive 有填就吃它，同時進理財收入與逐年金流）。
 * 他打算的 workaround「去收入表再打一筆同名的」會讓同一筆錢算兩次——
 * 實測已經有客戶這樣了。所以這裡守的是「畫面上必須講清楚它已經算進去了」。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
});

const fresh = () => {
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.app.finOpen = { incomes: {}, expenses: {}, assets: {}, liabilities: {} };
  return w.app.cases[0];
};
const goFinance = () => { w.app.activeTab = "data"; w.app.dataTab = "finance"; w.render(); };
const rowsOf = (sel: string) => [...w.document.querySelectorAll(sel)];

beforeEach(() => { fresh(); });

describe("拖曳把手移到每列左側", () => {
  it("四張表的每一列，第一個欄位就是拖曳把手", () => {
    goFinance();
    const cells = rowsOf("#app td.dhcell");
    expect(cells.length, "四張表都要有").toBeGreaterThan(4);
    for (const td of cells) {
      expect((td as Element).previousElementSibling, "拖曳欄必須是該列的第一格").toBeNull();
    }
  });

  it("✕ 與展開鍵留在右側（教練說叉叉維持在最右沒問題）", () => {
    goFinance();
    const acts = rowsOf("#app td.acts");
    expect(acts.length).toBeGreaterThan(4);
    for (const td of acts) {
      expect((td as Element).nextElementSibling, "acts 必須是最後一格").toBeNull();
    }
  });
});

describe("一次性金流：贈與、一次性大額支出", () => {
  it("勾了一次性 → 訖被鎖成起（引擎本來就當那一年發生一次）", () => {
    const c = fresh();
    c.incomes.push({ name: "父母贈與", owner: "王大明", type: "其他", period: "年", amount: 2_000_000, growth: 0, start: 45, end: 65 });
    const i = c.incomes.length - 1;
    w.setOnce("incomes", i, true);
    const row = w.activeCase().incomes[i];
    expect(row.once).toBe(true);
    expect(row.end, "訖要跟著起").toBe(45);
  });

  it("一次性時改「起」，「訖」會一起走（不然又變成一段區間）", () => {
    const c = fresh();
    c.expenses.push({ name: "一次性醫療自付", cat: "生活", subCat: "醫療/健康", period: "年", amount: 300_000, infl: true, start: 50, end: 50, once: true });
    const i = c.expenses.length - 1;
    w.setOnceStart("expenses", i, 55);
    const row = w.activeCase().expenses[i];
    expect(row.start).toBe(55);
    expect(row.end).toBe(55);
  });

  it("取消一次性之後，訖就恢復成可以自己填", () => {
    const c = fresh();
    c.incomes.push({ name: "臨時收入", owner: "王大明", type: "其他", period: "年", amount: 100, growth: 0, start: 45, end: 45, once: true });
    const i = c.incomes.length - 1;
    w.setOnce("incomes", i, false);
    expect(w.activeCase().incomes[i].once).toBe(false);
    expect(w.isOnce(w.activeCase().incomes[i])).toBe(false);
  });

  it("⚠️ 不新增任何資料表、也不動引擎——一次性只是 start===end", () => {
    const c = fresh();
    c.incomes.push({ name: "贈與", owner: "王大明", type: "其他", period: "年", amount: 2_000_000, growth: 0, start: 45, end: 45, once: true });
    const m = w.metrics(w.activeCase());
    expect(m, "引擎照常算得出來").toBeTruthy();
    expect(Number.isFinite(m.incTotal)).toBe(true);
  });
});

describe("資產到期：債權還款、租約結束", () => {
  it("還沒到期 → 流動性維持原樣、被動流照算", () => {
    const c = fresh();
    c.profile.age = 39;
    c.assets = [{ name: "私人借款債權", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 6_000_000, income: 216_000, matureAge: 41 }];
    expect(w.aCls(c.assets[0], 39)).toBe("固定");
    expect(w.assetPassive(c)).toBe(216_000);
  });

  it("過了到期年齡 → 流動性轉流動、被動流停算", () => {
    const c = fresh();
    c.profile.age = 42;
    c.assets = [{ name: "私人借款債權", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 6_000_000, income: 216_000, matureAge: 41 }];
    expect(w.aCls(c.assets[0], 42)).toBe("流動");
    expect(w.assetPassive(c), "到期之後這筆資產不再生錢").toBe(0);
  });

  it("⚠️ 本金不動——它本來就在資產總額裡，換個科目淨值一毛都不會變", () => {
    const c = fresh();
    c.profile.age = 42;
    c.assets = [{ name: "債權", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 6_000_000, matureAge: 41 }];
    const before = w.metrics(c).assetTotal;
    c.assets[0].matureAge = 99;   // 還沒到期
    const after = w.metrics(w.activeCase()).assetTotal;
    expect(after).toBe(before);
  });

  it("沒填到期年齡的資產完全不受影響（絕大多數是這種）", () => {
    const c = fresh();
    const a = { cls: "固定" };
    expect(w.aCls(a, 80)).toBe("固定");
    expect(w.aLiquid(c, { cls: "流動" })).toBe(true);
  });
});

describe("被動現金流：已經連動了，畫面要講清楚", () => {
  it("月/年只是輸入層換算，資料一律存年額", () => {
    const c = fresh();
    c.assets = [{ name: "債權", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 6_000_000, income: 0, incomePeriod: "月" }];
    w.setAssetInc(0, 18_000);
    expect(w.activeCase().assets[0].income, "填月付 1.8 萬 → 存成年額 21.6 萬").toBe(216_000);
  });

  it("⚠️ 欄位旁邊必須寫「已計入理財收入、請勿重複輸入」", () => {
    const c = fresh();
    c.assets = [{ name: "債權", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 6_000_000, income: 216_000 }];
    w.app.finOpen.assets[0] = true;
    goFinance();
    const txt = w.document.querySelector("#app")?.textContent ?? "";
    expect(txt).toContain("已經計入理財收入");
    expect(txt).toContain("請勿在收入表重複輸入");
    expect(txt, "也要講清楚它沒有起訖").toContain("視為永久領到底");
  });

  it("被動流真的有進理財收入（這就是教練以為沒連動的那條）", () => {
    const c = fresh();
    c.assets = [{ name: "債權", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 6_000_000, income: 216_000 }];
    c.incomes = [];
    expect(w.metrics(w.activeCase()).incFinancial).toBe(216_000);
  });
});

describe("負債期數三連動", () => {
  const withDebt = () => {
    const c = fresh();
    c.liabilities = [{ name: "房貸", owner: "王大明", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 10_000_000, rate: 2, repay: "本息攤還", pay: 42_000, months: 0, grace: 0, startAge: 38 }];
    return c;
  };

  it("填總期數＋已繳 → 剩餘自己長出來", () => {
    withDebt();
    w.setTerm(0, "totalTerms", 360);
    w.setTerm(0, "paidTerms", 60);
    expect(w.activeCase().liabilities[0].months).toBe(300);
  });

  it("填總期數＋剩餘 → 已繳自己長出來", () => {
    withDebt();
    w.setTerm(0, "months", 300);
    w.setTerm(0, "totalTerms", 360);
    expect(w.activeCase().liabilities[0].paidTerms).toBe(60);
  });

  it("填已繳＋剩餘 → 總期數自己長出來", () => {
    withDebt();
    w.setTerm(0, "paidTerms", 60);
    w.setTerm(0, "months", 300);
    expect(w.activeCase().liabilities[0].totalTerms).toBe(360);
  });

  it("⚠️ months 的語意仍然是「剩餘月數」——引擎的攤還吃它，不可以被改成總期數", () => {
    withDebt();
    w.setTerm(0, "totalTerms", 360);
    w.setTerm(0, "paidTerms", 60);
    expect(w.activeCase().liabilities[0].months, "300 才是剩餘").toBe(300);
    expect(w.activeCase().liabilities[0].totalTerms).toBe(360);
  });

  it("已繳超過總期數不會算出負的剩餘", () => {
    withDebt();
    w.setTerm(0, "totalTerms", 100);
    w.setTerm(0, "paidTerms", 150);
    expect(w.activeCase().liabilities[0].months).toBe(0);
  });
});

describe("每列備註", () => {
  it("四張表的進階欄都有備註，而且存得進去", () => {
    const c = fresh();
    for (const arr of ["incomes", "expenses", "assets", "liabilities"]) {
      expect((c[arr] || []).length, `${arr} 要有資料才測得到`).toBeGreaterThan(0);
      w.set(`${arr}:0`, "note", "這筆在媽媽名下");
      expect(w.activeCase()[arr][0].note).toBe("這筆在媽媽名下");
    }
  });
});
