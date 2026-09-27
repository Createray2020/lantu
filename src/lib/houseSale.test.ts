import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";
import { JSDOM } from "jsdom";

/**
 * 購屋④（2026/09/27 Ray）：現況房產＋換屋＋房租到交屋停。
 *   購屋目標可指定「賣掉哪一間」（g.sellAid）與「清償哪一筆房貸」（g.sellLid）；
 *   賣屋年＝交屋年；淨得＝現值×(1−賣屋費用%)−房貸餘額，一次進主池；
 *   之後那間房不在固定資產、那筆房貸不再攤還。
 *   ⚠️ 只有資產列勾「可變賣」才賣；沒指定的舊目標＝完全不動（既有客戶數字一位不動）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

function caseWith(goal: Record<string, unknown>, asset: Record<string, unknown> = {}, liab: Record<string, unknown> = {}) {
  const c = E.sampleCase();
  c.goals = [];
  c.assets = [{ name: "自住房", owner: "王大明", type: "不動產", currency: "台幣", fxRate: 1, value: 15_000_000, aid: "a1", sellable: true, ...asset }];
  c.liabilities = [{ name: "房貸", owner: "王大明", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 6_000_000, rate: 2, repay: "本息攤還",
    pay: 30_000, months: 240, grace: 0, startAge: c.profile.age, lid: "l1", ...liab }];
  c.goals.push({ on: true, name: "換屋", type: "購屋", present: 20_000_000, minPresent: 0, start: 50, end: 50, freq: 0, growth: "固定",
    appreciation: 0, loanRatio: 75, loanRate: 2.2, loanYears: 30, imp: 4, prepared: 0, condition: "新成屋", ...goal });
  return c;
}

describe("換屋：賣掉現況房產", () => {
  it("淨得＝現值×(1−2%)−該房貸餘額；賣屋年＝購置年（新成屋）", () => {
    const c = caseWith({ sellAid: "a1", sellLid: "l1" });
    const S = E.houseSales(c);
    expect(S.length).toBe(1);
    expect(S[0].age).toBe(50);
    expect(S[0].gross).toBe(15_000_000 * 0.98);
    expect(S[0].owed).toBeCloseTo(E.lRemain(c.liabilities[0], 50, c.profile.age), 6);
    expect(S[0].net).toBeCloseTo(S[0].gross - S[0].owed, 6);
    expect(S[0].fee).toBe(2);
  });
  it("預售：賣屋年＝交屋年（簽約＋工程年數）；賣屋費用可覆寫、不清償房貸時餘額＝0", () => {
    const S = E.houseSales(caseWith({ sellAid: "a1", condition: "預售", sellFee: 4 }));
    expect(S[0].age).toBe(53);
    expect(S[0].gross).toBe(15_000_000 * 0.96);
    expect(S[0].owed).toBe(0);
  });
  it("沒勾「可變賣」／沒指定／目標未納入／舊目標：完全不賣", () => {
    expect(E.houseSales(caseWith({ sellAid: "a1" }, { sellable: false })).length).toBe(0);
    expect(E.houseSales(caseWith({})).length).toBe(0);
    expect(E.houseSales(caseWith({ sellAid: "a1", on: false })).length).toBe(0);
    expect(E.houseSales(caseWith({ sellAid: "zzz" })).length).toBe(0);
  });
  it("投影：賣屋年結餘多出淨得、房子離開固定資產、那筆房貸之後不再攤還", () => {
    const sell = caseWith({ sellAid: "a1", sellLid: "l1" });
    const keep = caseWith({});
    const S = E.houseSales(sell)[0];
    const a = E.projection(sell).rows, b = E.projection(keep).rows;
    const at = (rows: { age: number }[], age: number) => rows.find((r) => r.age === age) as Record<string, number>;
    // 賣屋前一年：兩邊一模一樣
    expect(at(a, 49).bal).toBeCloseTo(at(b, 49).bal, 2);
    // 賣屋年：結餘差 ＝ 淨得 ＋ 當年少付的房貸本息
    const debtPay = E.debtPayAt(sell.liabilities[0], 50, sell.profile.age);
    expect(at(a, 50).bal - at(b, 50).bal).toBeCloseTo(S.net + debtPay, 0);
    // 賣屋後：每一年都少付房貸
    expect(at(a, 55).debt).toBeCloseTo(at(b, 55).debt - E.debtPayAt(sell.liabilities[0], 55, sell.profile.age), 0);
    expect(at(a, 55).debt).toBeLessThan(at(b, 55).debt);
  });
  it("engine.ts ↔ lantu-app.html：投影每一年結餘與淨值一致；函式逐字對拍", async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    const w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    for (const g of [{ sellAid: "a1", sellLid: "l1" }, { sellAid: "a1", condition: "預售", sellFee: 3 }, {}]) {
      const c = caseWith(g);
      const a = E.projection(c).rows, b = w.projection(JSON.parse(JSON.stringify(c))).rows;
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].bal, `第 ${i} 年結餘`).toBeCloseTo(a[i].bal, 2);
        expect(b[i].net, `第 ${i} 年淨值`).toBeCloseTo(a[i].net, 2);
      }
    }
    for (const lit of [
      "function houseSaleIn(S,age){var s=0;for(var i=0;i<S.length;i++)if(S[i].age===age)s+=S[i].net;return s;}",
      "function soldAsset(S,a,age){for(var i=0;i<S.length;i++)if(S[i].aid&&a&&a.aid===S[i].aid&&age>=S[i].age)return true;return false;}",
      "function soldLiab(S,l,age){for(var i=0;i<S.length;i++)if(S[i].lid&&l&&l.lid===S[i].lid&&age>=S[i].age)return true;return false;}",
      "  var gross=aVal(a)*(1-fee/100),owed=l?lRemain(l,age,a0):0;",
      "  var saleIn=houseSaleIn(hSales,age);",
    ]) expect(HTML).toContain(lit);
  });
  it("UI：規格卡有換屋區塊；勾可變賣＋指定後顯示淨得；房租到交屋停", async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    const w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    w.app.role = "coach"; w.app.activeTab = "data";
    const c = w.migrateCase(caseWith({ sellAid: "a1", sellLid: "l1" }));
    c.expenses.push({ name: "房租", cat: "居住", amount: 25_000, freq: 12, start: c.profile.age, end: 90, eid: "e-rent" });
    w.app.cases = [c]; w.app.activeId = c.id; w.app.dataTab = "goals"; w.GOAL_SEL = "house"; w.GOAL_SEL_ID = c.id;
    w.render();
    const t = w.document.querySelector("#app")!.textContent ?? "";
    expect(t).toContain("換屋");
    expect(t).toMatch(/淨得 [\d,]+/);
    w.houseStopRent(0);
    const rent = c.expenses.find((e: { eid: string }) => e.eid === "e-rent");
    expect(rent.end).toBe(49);
    expect(HTML).toContain('houseSell:function(c,i){return houseSellHTML(c,i);}');
  });
});
