import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 2026/09/27 Ray：「孝親的部分整個不對的模板，幫我重新設計；一般的孝親也有分每月給跟每年給，
 * 有紅包或是生活費之類的；要同步考慮贈與相關問題（孝親、教養的一次性準備金）；孝親不會用貸款成數。」
 *
 * 地基語意：孝親列住在**支出表**（cat 孝親）——引擎（壽險需求的父母奉養費、撫養壓力比、
 * 損益表撫育列）一直只讀那裡；goals 的 type＝孝親 從沒進任何計算，所以載入時自動搬過去。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  w.app.role = "coach";
  w.app.activeTab = "data";
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fresh(): any {
  const c = w.migrateCase(w.newCase());
  c.expenses = c.expenses.filter((e: { cat: string }) => e.cat !== "孝親");   // 示範資料自帶一筆孝親費
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.dataTab = "goals";
  w.GOAL_SEL = "care"; w.GOAL_SEL_ID = c.id;
  w.render();
  return c;
}
const C = () => w.activeCase();
const care = () => C().expenses.filter((e: { cat: string }) => e.cat === "孝親");
const text = () => w.document.querySelector("#app").textContent as string;

describe("孝親規劃頁＝支出表 cat 孝親 的專屬視圖", () => {
  it("欄位是 對象／項目／類別／給付／金額／從幾歲／到幾歲／隨通膨——沒有貸款成數、理想最低、最晚完成歲", () => {
    fresh();
    w.addCareRow();
    w.render();
    const ths = [...w.document.querySelectorAll(".caretbl th")].map((e: Element) => e.textContent);
    expect(ths).toEqual(["對象", "項目", "記在哪一類", "給付", "金額", "從幾歲", "到幾歲", "隨通膨", ""]);
    const sec = w.document.querySelector('[data-goalanchor-detail="care"]').textContent as string;
    expect(sec).not.toContain("貸款成數");
    expect(sec).not.toContain("最晚完成歲");
    expect(sec).not.toContain("金額(理想)");
  });

  it("帶入預設項目：每月孝親金 10,000 存年額 120,000；每年合計對得上，goals 一列都不長", () => {
    const c = fresh();
    const g0 = c.goals.length;
    w.addCarePresets();
    const rows = care();
    expect(rows.length).toBe(w.CARE_PRESETS.length);
    const monthly = rows.find((e: { name: string }) => e.name === "每月孝親金");
    expect(monthly.period).toBe("月");
    expect(monthly.amount).toBe(120_000);
    expect(monthly.tag).toBe("care");
    expect(w.careTotals(C()).year).toBe(120_000 + 12_000 + 6_000 + 24_000);
    expect(w.careTotals(C()).month).toBe(Math.round((120_000 + 12_000 + 6_000 + 24_000) / 12));
    expect(C().goals.length).toBe(g0);
    // 引擎那一側：父母奉養費就是這個數
    expect(w.familyAnnualParentSupport(C())).toBe(162_000);
    // 再按一次不重複
    w.addCarePresets();
    expect(care().length).toBe(w.CARE_PRESETS.length);
  });

  it("對象下拉帶家庭成員的父／母／長輩；選了對象，「到幾歲」＝對方 85 歲那一年本人幾歲", () => {
    const c = fresh();
    c.profile.age = 40;
    c.members.push({ name: "王爸", role: "父", age: 70 }, { name: "王媽", role: "母", age: 68 }, { name: "小明", role: "子女", age: 6 });
    w.addCareRow();
    w.render();
    const opts = [...w.document.querySelectorAll(".caretbl tr:nth-child(2) td:first-child option")].map((o: HTMLOptionElement) => o.value);
    expect(opts).toEqual(["", "王爸", "王媽"]);
    const i = C().expenses.indexOf(care()[0]);
    w.setCareWho(i, "王媽");
    expect(care()[0].who).toBe("王媽");
    expect(care()[0].end).toBe(40 + (85 - 68));
    // 新增列預設就帶第一位長輩
    expect(care()[0].start).toBe(40);
  });

  it("給付切「一次」：起訖同一歲，引擎當那一年的年支出；切回每月年額不動", () => {
    const c = fresh();
    c.profile.age = 40;
    w.addCareRow("換電梯宅", 3_000_000, "年");
    const i = C().expenses.indexOf(care()[0]);
    w.setCarePay(i, "一次");
    expect(care()[0].once).toBe(true);
    expect(care()[0].end).toBe(care()[0].start);
    w.setCareStart(i, 45);
    expect(care()[0].end).toBe(45);
    expect(w.inSpan(care()[0], 44)).toBe(false);
    expect(w.inSpan(care()[0], 45)).toBe(true);
    expect(w.inSpan(care()[0], 46)).toBe(false);
    w.setCarePay(i, "月");
    expect(care()[0].once).toBe(false);
    expect(care()[0].period).toBe("月");
    expect(care()[0].amount).toBe(3_000_000);
    expect(care()[0].end).toBeGreaterThan(care()[0].start);
  });

  it("舊目標表裡的孝親列自動搬到支出表：金額(理想)當年額、頻率只發生一次→一次性、成長依據固定→不隨通膨", () => {
    const c = fresh();
    c.profile.age = 44;
    c.goals.push(
      { on: true, name: "孝親", type: "孝親", present: 0, minPresent: 10_000, start: 44, end: 60, latest: 70, freq: 12, growth: "通膨", appreciation: 5, loanRatio: 0, imp: 3, prepared: 0 },
      { on: true, name: "幫爸媽換房", type: "孝親", present: 2_000_000, minPresent: 0, start: 50, end: 50, freq: 0, growth: "固定", appreciation: 0, loanRatio: 30, imp: 3, prepared: 0 },
      { on: false, name: "沒納入的", type: "孝親", present: 999, minPresent: 0, start: 50, end: 50, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0 },
    );
    const m = w.migrateCase(c);
    expect(m.goals.filter((g: { type: string }) => g.type === "孝親").length).toBe(0);
    const rows = m.expenses.filter((e: { cat: string }) => e.cat === "孝親");
    expect(rows.length).toBe(2);
    const a = rows.find((e: { name: string }) => e.name === "孝親");
    expect(a.amount).toBe(10_000);
    expect(a.once).toBe(false);
    expect(a.start).toBe(44); expect(a.end).toBe(60);
    expect(a.infl).toBe(true);
    expect(a.loanRatio).toBeUndefined();
    const b = rows.find((e: { name: string }) => e.name === "幫爸媽換房");
    expect(b.amount).toBe(2_000_000);
    expect(b.once).toBe(true);
    expect(b.end).toBe(50);
    expect(b.infl).toBe(false);
    // 再跑一次不會重複搬
    expect(w.migrateParentGoals(m)).toBe(0);
  });

  it("類型下拉再選到「孝親」→ set() 當場搬走，目標表不會留一列假的孝親", () => {
    const c = fresh();
    c.goals.push({ on: true, name: "X", type: "購車", present: 800_000, minPresent: 0, start: 45, end: 45, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0 });
    const i = c.goals.length - 1;
    w.set("goals:" + i, "type", "孝親");
    expect(C().goals.some((g: { type: string }) => g.type === "孝親")).toBe(false);
    expect(care().length).toBe(1);
    expect(care()[0].name).toBe("X");
  });

  it("需求中樞的孝親項目：有支出列才算「已填」；群卡顯示的是每年合計", () => {
    fresh();
    const parent = w.navStep("parent");
    expect(parent.has(C())).toBe(false);
    w.addCareRow("每月孝親金", 10_000, "月");
    expect(parent.has(C())).toBe(true);
    w.render();
    const card = w.document.querySelector('.goalnav .grp[data-g="care"] .vd').textContent as string;
    expect(card).toContain("1 列");
    expect(card).toContain("12萬");
  });
});

describe("贈與稅檢核：孝親一次性 ＋ 子女一次性準備金", () => {
  it("免稅額 244 萬／人／年；本人＋配偶 ×2；沒有一次性贈與時只有一句說明", () => {
    const c = fresh();
    expect(w.GIFT_EXEMPT).toBe(2_440_000);
    expect(w.giftDonors(c)).toBe(1);
    c.members.push({ name: "太太", role: "配偶", age: 38 });
    expect(w.giftDonors(c)).toBe(2);
    w.render();
    expect(text()).toContain("目前沒有一次性贈與");
  });

  it("級距：10%／超過 2,500 萬 15%／超過 5,000 萬 20%（累進）", () => {
    expect(w.giftTax(0)).toBe(0);
    expect(w.giftTax(1_000_000)).toBe(100_000);
    expect(w.giftTax(25_000_000)).toBe(2_500_000);
    expect(w.giftTax(30_000_000)).toBe(2_500_000 + 750_000);
    expect(w.giftTax(60_000_000)).toBe(2_500_000 + 3_750_000 + 2_000_000);
  });

  it("同一年的孝親一次性給付與子女基金合併看；超過的年份算稅、給「分幾年給」的處方", () => {
    const c = fresh();
    c.profile.age = 40;
    c.members.push({ name: "小明", role: "子女", age: 20 });
    w.addCareRow("幫爸媽換電梯宅", 3_000_000, "年", "孝親金", "", true);   // 40 歲一次
    // 子女買房基金：goals 的 childFundFor 列（type 其他、一次性）
    C().goals.push({ on: true, name: "小明的買房基金", type: "其他", present: 2_000_000, minPresent: 0, start: 40, end: 40, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0, childFundFor: "小明" });
    const ys = w.giftYears(C());
    expect(ys.length).toBe(1);
    expect(ys[0].age).toBe(40);
    expect(ys[0].total).toBe(5_000_000);
    expect(ys[0].exempt).toBe(2_440_000);
    expect(ys[0].over).toBe(2_560_000);
    expect(ys[0].tax).toBe(256_000);
    expect(ys[0].splitYears).toBe(3);
    w.render();
    const t = text();
    expect(t).toContain("1 個年份超過免稅額");
    expect(t).toContain("分 3 年給");
  });

  it("每月孝親金與學費屬扶養，不進檢核；子女結婚那一年每位父母再 +100 萬", () => {
    const c = fresh();
    c.profile.age = 40;
    c.members.push({ name: "太太", role: "配偶", age: 38 }, { name: "小明", role: "子女", age: 20 });
    w.addCareRow("每月孝親金", 200_000, "月");     // 年 240 萬，但是扶養
    expect(w.giftEvents(C()).length).toBe(0);
    C().goals.push({ on: true, name: "小明的結婚基金", type: "其他", present: 6_000_000, minPresent: 0, start: 45, end: 45, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0, childFundFor: "小明" });
    const ys = w.giftYears(C());
    expect(ys[0].exempt).toBe(2 * 2_440_000 + 2 * 1_000_000);
    expect(ys[0].over).toBe(6_000_000 - 6_880_000 < 0 ? 0 : 6_000_000 - 6_880_000);
    expect(ys[0].tax).toBe(0);
  });

  it("子女教育頁底下也掛同一張檢核", () => {
    const c = fresh();
    c.members.push({ name: "小明", role: "子女", age: 20 });
    w.toggleTarget("子女教養規劃");
    w.app.dataTab = "education";
    w.render();
    expect(text()).toContain("贈與稅檢核");
  });
});
