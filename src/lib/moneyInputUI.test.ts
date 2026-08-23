import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 全站金額欄的千分位盤點（2026/08/23）。
 *
 * financeInputUI.test.ts 守的是「收支資債四合一面板」那一輪；
 * 這一支守的是這次補齊的其餘出口——工具箱、公司概況、稅賦、教育、成員卡、
 * 退休、規劃參數，以及 groupedTable 走的舊分頁。
 *
 * 測法刻意打在「產生器 + 欄位宣告」兩層，而不是抓整頁畫面：
 * 畫面會因為分頁狀態、有沒有公司資料、模組收合而長不一樣，
 * 但「money 型欄位一定要吐 moneyCell」與「這幾個欄位一定要宣告成 money」
 * 是不會變的。漏掉 amtRaw 的話 Number('1,200') = NaN → 靜默存成 0，畫面上完全看不出來。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
let HTML: string;

beforeAll(async () => {
  HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  if (!w.app.cases.length) w.app.cases = [w.sampleCase()];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

/** 一個金額輸入框該長的樣子：text + inputmode，且寫入前經過 amtRaw。 */
function expectMoneyBox(html: string, label: string) {
  expect(html, `${label}：不該是 type=number（規格上顯示不了逗號）`).not.toContain('type="number"');
  expect(html, `${label}：沒有走 moneyCell`).toContain('inputmode="numeric"');
  expect(html, `${label}：寫入前沒有 amtRaw，Number('1,200') 會是 NaN`).toContain("amtRaw(this.value)");
  expect(html, `${label}：沒掛 amtKey，打字時游標會被踢到最後面`).toContain("amtKey(this)");
}

describe("四支欄位產生器的 money 分支", () => {
  it("cellInput（groupedTable：資產／負債／收入／支出的分頁版）", () => {
    const c = w.activeCase();
    const box = w.cellInput("assets", 0, ["value", "現值(原幣)", "money"], { value: 1200000 }, c);
    expectMoneyBox(box, "cellInput");
    expect(box).toContain('value="1,200,000"');
    // 非金額欄仍是 number
    expect(w.cellInput("assets", 0, ["ret", "報酬率%", "num"], { ret: 5 }, c)).toContain('type="number"');
  });

  it("coF（公司概況）", () => {
    const box = w.coF({ annualRevenue: 78000000 }, "annualRevenue", "年營收", "money");
    expectMoneyBox(box, "coF");
    expect(box).toContain('value="78,000,000"');
    expect(w.coF({ sharePct: 100 }, "sharePct", "本人持股 %", "num")).toContain('type="number"');
  });

  it("ofld（傳承／職涯／理財模式這類物件欄位）", () => {
    const box = w.ofld("legacy", "perHeirCash", "每人現金傳承", "money");
    expectMoneyBox(box, "ofld");
  });

  it("toolF（工具箱）——預設就是金額，'num' 才是例外", () => {
    const money = w.toolF("loan", [["amt", "貸款總額"]]);
    expect(money).toContain('inputmode="numeric"');
    expect(money).toContain("amtKey(this)");
    expect(w.toolF("loan", [["years", "年期", "num"]])).toContain('type="number"');
  });

  it("tableSec / fFld 的 money 型（既有實作，一併守住）", () => {
    expectMoneyBox(w.fFld('onchange="x(this.value)"', "年繳保費", 36000, "money"), "fFld");
  });
});

describe("欄位宣告：這些欄位必須是 money，不能被改回 num", () => {
  const MUST_BE_MONEY = [
    // 資產 / 負債（groupedTable 舊分頁）
    "['cost','購入價(原幣)','money']",
    "['value','現值(原幣)','money']",
    "['income','被動現金流(原幣/年)','money']",
    "['balance','負債金額(原幣)','money']",
    "['pay','月繳款(原幣)','money']",
    // 退休 / 教育 / 真實追蹤
    "['monthLiving','期望退休月生活費(現值)','money']",
    "['annual','年費用(現值)','money']",
    "['net','實際淨資產','money']",
    // 公司概況
    "coF(co,'annualRevenue','年營收','money')",
    "coF(co,'netProfit','稅後淨利','money')",
    "coF(co,'totalAsset','總資產','money')",
    "coF(co,'totalDebt','總負債','money')",
    "coF(co,'equity','股東權益（選填）','money')",
    "coF(co,'valueManual','手動指定金額','money')",
    "coF(co,'cash','公司現金及約當現金','money')",
    "coF(co,'monthlyFixed','公司每月固定支出','money')",
    "coF(co,'retained','累積未分配盈餘','money')",
    "coF(co,'ar','應收帳款餘額','money')",
    "coF(co,'inventory','存貨餘額','money')",
    "coF(co,'insExpense','保險費用(年)','money')",
    // 規劃參數 / 傳承 / 職涯
    "fld('planInit','計劃儲蓄期初','money')",
    "fld('planYearly','計劃儲蓄年投入','money')",
    "ofld('legacy','perHeirCash','每人現金傳承','money')",
    "ofld('career','switchFund','轉換預備資金','money')",
    "ofld('career','startupBudget','創業預算','money')",
    "ofld('moneyStyle','emergencyAmt','預備金金額','money')",
  ];
  it.each(MUST_BE_MONEY)("%s", (decl) => {
    expect(HTML).toContain(decl);
  });

  it("稅賦四欄與成員卡三欄走 moneyCell", () => {
    for (const k of ["otherDeduction", "houseAssessed", "landAssessed", "carTax"]) {
      expect(HTML, k).toContain(`moneyCell('onchange="setTax(\\'${k}\\'`);
    }
    expect(HTML).toContain("moneyCell(mb('pensionBalance','num')");
    expect(HTML).toContain("moneyCell(salAttr,sal)");
    expect(HTML).toContain("moneyCell('onchange=\"set(\\'members:'+idx+'\\',\\'insSalary\\'");
  });

  it("年齡／年數／比率／天數不准被改成金額欄", () => {
    for (const decl of [
      "['rate','年利率%','num']",
      "['years','年期','num']",
      "['arDays','應收天數','num']",
      "['life','耐用年數','num']",
      "['fxRate','匯率','num']",
      "['startAge','起始年齡','num']",
    ]) {
      expect(HTML, decl).toContain(decl);
    }
  });
});

describe("寫入層：帶逗號的字串進來，存進資料的仍是數字", () => {
  it("setTool（工具箱）", () => {
    w.setTool("loan", "amt", w.amtRaw("12,000,000"));
    expect(w.app.tools.loan.amt).toBe(12000000);
  });

  it("setRetire（退休月生活費）", () => {
    const c = w.activeCase();
    w.setRetire("monthLiving", w.amtRaw("85,000"), "num");
    expect(c.retire.monthLiving).toBe(85000);
  });

  it("setTax（稅賦參數）", () => {
    const c = w.activeCase();
    w.setTax("houseAssessed", w.amtRaw("3,250,000"), "num");
    expect(c.taxParams.houseAssessed).toBe(3250000);
  });

  it("setCo（公司）", () => {
    const c = w.activeCase();
    if (!(c.companies || []).length) w.addRow("companies");
    const co = w.mainCompany(c);
    if (co) {
      w.setCo("annualRevenue", w.amtRaw("78,000,000"), "num");
      expect(co.annualRevenue).toBe(78000000);
    }
  });

  it("setMeta（規劃參數）", () => {
    const c = w.activeCase();
    w.setMeta("params", "planYearly", w.amtRaw("240,000"), "num");
    expect(c.params.planYearly).toBe(240000);
  });

  it("忘了 amtRaw 會發生什麼：Number('1,200,000') 是 NaN", () => {
    expect(Number("1,200,000")).toBeNaN();
    expect(w.n("1,200,000")).toBe(0); // n() 把 NaN 收成 0 → 靜默歸零
  });
});

describe("圖表的 Y 軸金額刻度", () => {
  it("蒙地卡羅扇形圖有金額軸（原本只有年齡 ticks）", () => {
    // 分析頁模組是收合的、內容由 anToggled 展開時才注入 —— 直接取產生器。
    w.app.activeTab = "analysis";
    w.render();
    const h = w.AN_VIEW.map.mc();
    expect(/萬<\/text>|億<\/text>|,\d{3}<\/text>/.test(h)).toBe(true);
  });

  it("報告書版的折線圖與扇形圖也有金額軸", () => {
    w.app.activeTab = "report";
    w.render();
    const h = w.document.querySelector("#app").innerHTML as string;
    expect(/萬<\/text>|億<\/text>|,\d{3}<\/text>/.test(h)).toBe(true);
  });

  it("rAxisY 產生的是 cfAxis 縮寫，不是原始長數字", () => {
    const ax = w.rAxisY(0, 12000000, 40, 740, 180);
    expect(ax).toContain("萬");
    expect(ax).not.toContain("12000000");
  });
});
