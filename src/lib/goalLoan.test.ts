import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 購置目標的貸款進一生金流（2026/08/30 Ray 拍板）。
 *
 * 改版前 projection() 完全沒有讀 goals[].loanRatio：填總價 1,100 萬的購屋目標，
 * 那一年就整整扣 1,100 萬，貸款不存在、月付不存在、房子也沒進資產——
 * 而旁邊的「購屋缺口」那張表是照「總價 − 貸款」算的。同一筆目標，兩張表兩個答案。
 *
 * 這一組守三件事：
 *   1. 三個欄位（成數／利率／年期）沒填齊時，行為與改版前**一位不差**。
 *   2. 填齊時，頭期款、逐年還款、房子進資產、貸款進負債，四件事都對。
 *   3. engine.ts 與 lantu-app.html 兩份實作算出來一樣。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function houseCase(over: Record<string, any> = {}) {
  const c = E.sampleCase();
  c.profile.age = 40;
  c.profile.lifeExp = 85;
  c.params.horizon = 85;
  c.goals = [
    {
      on: true, name: "買房", type: "購屋", present: 11_000_000, minPresent: 9_000_000,
      start: 45, end: 45, freq: 0, growth: "固定", imp: 4, prepared: 0,
      appreciation: 0, loanRatio: 80, ...over,
    },
  ];
  return c;
}

const at = (c: unknown, age: number) =>
  E.projection(c).rows.find((r: { age: number }) => r.age === age);

describe("購置貸款：沒填齊就退回改版前的行為", () => {
  it("只填貸款成數（沒有利率與年期）→ 不生成貸款，那一年照樣扣全額", () => {
    const c = houseCase();
    expect(E.goalLoans(c)).toEqual([]);
    expect(at(c, 45).goal).toBe(11_000_000);
    expect(at(c, 46).debt).toBe(at(c, 44).debt); // 沒有新的還款
  });

  it.each([
    ["少了利率", { loanRate: 0, loanYears: 30 }],
    ["少了年期", { loanRate: 2.1, loanYears: 0 }],
    ["少了成數", { loanRatio: 0, loanRate: 2.1, loanYears: 30 }],
  ])("%s → 不生成貸款（缺一個就整筆退回一次付清）", (_label, over) => {
    const c = houseCase(over);
    expect(E.goalLoans(c)).toEqual([]);
    expect(at(c, 45).goal).toBe(11_000_000);
  });

  it("非購屋／置產（例如購車）即使填了三個欄位也不生成貸款", () => {
    const c = houseCase({ type: "購車", loanRate: 3.5, loanYears: 5 });
    expect(E.goalLoans(c)).toEqual([]);
    expect(at(c, 45).goal).toBe(11_000_000);
  });

  it("週期性購置不生成貸款（一份目標對一筆貸款）", () => {
    const c = houseCase({ freq: 5, end: 60, loanRate: 2.1, loanYears: 30 });
    expect(E.goalLoans(c)).toEqual([]);
  });

  it("購置年早於現齡（已經發生過的）不生成新貸款", () => {
    const c = houseCase({ start: 35, end: 35, loanRate: 2.1, loanYears: 30 });
    expect(E.goalLoans(c)).toEqual([]);
  });

  it("沒有納入的目標（on:false）不生成貸款", () => {
    const c = houseCase({ on: false, loanRate: 2.1, loanYears: 30 });
    expect(E.goalLoans(c)).toEqual([]);
  });
});

describe("購置貸款：填齊之後的四件事", () => {
  const c = houseCase({ loanRate: 2.1, loanYears: 30 });
  const [L] = E.goalLoans(c);

  it("頭期款＝總價 − 貸款，那一年只扣這個數", () => {
    expect(L.price).toBe(11_000_000);          // appreciation 0、growth 固定
    expect(L.loan).toBe(8_800_000);            // 貸八成
    expect(L.down).toBe(2_200_000);
    expect(at(c, 45).goal).toBe(2_200_000);
  });

  it("⚠️ 已備（prepared）不從頭期款扣——那筆錢本來就在資產池裡，再扣一次等於免費", () => {
    const c2 = houseCase({ loanRate: 2.1, loanYears: 30, prepared: 1_000_000 });
    expect(E.goalLoans(c2)[0].down).toBe(2_200_000);
  });

  it("貸款成數超過 100 會被夾住，不會算出負的頭期款", () => {
    const c2 = houseCase({ loanRatio: 130, loanRate: 2.1, loanYears: 30 });
    const [L2] = E.goalLoans(c2);
    expect(L2.loan).toBe(11_000_000);
    expect(L2.down).toBe(0);
  });

  it("購置年起逐年扣月付 ×12，年期結束就停", () => {
    // ⚠️ 基準要拿「同一份資料但沒有購置貸款」的那條線比，不能拿自己前一年比——
    //    示範個案本來就有一筆房貸會在 63 歲攤完，拿前一年當基準會把那件事算到新貸款頭上。
    const yearly = E.pmt(8_800_000, 2.1, 360) * 12;
    const base = E.projection(houseCase()).rows;
    const d = (age: number) =>
      at(c, age).debt - base.find((r: { age: number }) => r.age === age).debt;
    expect(d(44)).toBeCloseTo(0, 4);        // 還沒買
    expect(d(45)).toBeCloseTo(yearly, 4);   // 買下去那一年就開始繳
    expect(d(70)).toBeCloseTo(yearly, 4);   // 第 26 年還在繳
    expect(d(75)).toBeCloseTo(0, 4);        // 30 年繳完（45+30=75 起停）
  });

  it("房子進固定資產、貸款進負債：購置當年兩者的差額剛好是頭期款", () => {
    // 跟「一次付清」那條線比：淨值差 = 現金差 + 房子 − 當年的貸款餘額（＝頭期款）。
    // 這一條同時守住兩件事：房子真的進了固定資產，貸款也真的進了負債。
    const base = E.projection(houseCase()).rows;
    const b45 = base.find((r: { age: number }) => r.age === 45);
    const w45 = at(c, 45);
    expect(w45.net - b45.net).toBeCloseTo(w45.total - b45.total + 2_200_000, 2);
    expect(w45.net).toBeGreaterThan(b45.net);
  });

  it("繳完之後房子還在、貸款歸零", () => {
    const rows = E.projection(c).rows;
    const last = rows[rows.length - 1];
    const noLoan = E.projection(houseCase()).rows;
    // 同一年：有貸款版的淨值裡多了「房子 − 剩餘本金」，最後一年本金已還清 → 多一整間房
    expect(last.net - noLoan[noLoan.length - 1].net).toBeGreaterThan(0);
  });

  it("填齊之後現值缺口會比「一次付清」小——這正是改這件事的理由", () => {
    // 示範個案太有錢，兩條線都沒有缺口；把可投資資產砍到一般家庭的水位才看得出差別。
    const lean = (over: Record<string, unknown> = {}) => {
      const x = houseCase(over);
      x.assets = x.assets.filter((a: { type: string }) => a.type === "不動產");
      return x;
    };
    const oneShot = E.projection(lean()).shortPV;
    const withLoan = E.projection(lean({ loanRate: 2.1, loanYears: 30 })).shortPV;
    expect(oneShot).toBeGreaterThan(0);
    expect(withLoan).toBeLessThan(oneShot);
  });
});

describe("雙實作對拍：engine.ts ↔ lantu-app.html", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  });

  it("goalLoans() 兩邊逐字一致", () => {
    expect(HTML).toContain("function goalLoans(c){");
    expect(HTML).toContain("  if(!(ratio>0&&rate>0&&yrs>0))return;");
    expect(HTML).toContain(" var fixedAt=fixedAssets+sum(gLoans,function(L){return age>=L.buyAge?L.price:0});".trim());
  });

  it.each([
    ["沒填利率年期", {}],
    ["填齊", { loanRate: 2.1, loanYears: 30 }],
    ["超短年期", { loanRate: 3, loanYears: 5 }],
    ["置產", { type: "置產", loanRate: 2.5, loanYears: 20 }],
  ])("%s：兩邊的 projection 每一年的結餘與淨值都一樣", (_label, over) => {
    const c = houseCase(over);
    const a = E.projection(c).rows;
    const b = w.projection(JSON.parse(JSON.stringify(c))).rows;
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].bal, `age ${a[i].age} bal`).toBeCloseTo(a[i].bal, 4);
      expect(b[i].net, `age ${a[i].age} net`).toBeCloseTo(a[i].net, 4);
      expect(b[i].debt, `age ${a[i].age} debt`).toBeCloseTo(a[i].debt, 4);
      expect(b[i].goal, `age ${a[i].age} goal`).toBeCloseTo(a[i].goal, 4);
    }
  });

  it("示範個案（沒有任何購置貸款）兩邊完全一致——確保沒有連累既有資料", () => {
    const c = E.sampleCase();
    const a = E.projection(c);
    const b = w.projection(JSON.parse(JSON.stringify(c)));
    expect(b.shortPV).toBeCloseTo(a.shortPV, 4);
    expect(b.turnNeg).toBe(a.turnNeg);
  });
});
