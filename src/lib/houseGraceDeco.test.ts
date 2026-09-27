import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";
import { JSDOM } from "jsdom";
import { HOUSE_PAY_DEFAULT } from "./houseParams.defaults";

/**
 * 購屋④-b（2026/09/27 Ray 兩點）：
 *   ① 裝修款不併進總價——成數只算屋價；裝修在交屋年自備付，或走獨立的裝修貸款（第二筆虛擬負債）。
 *   ② 寬限期：範本 graceYears（預售 3／新成屋 2／中古 0，每筆可覆寫 g.pay.graceYears）→ 寬限期內只繳息、本金不動，
 *      之後本金攤在剩餘年期（跟負債列的 grace 同一條規則）。
 *   ⚠️ 沒選屋況的舊目標：寬限 0、跟改版前一模一樣。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

function caseWith(over: Record<string, unknown>) {
  const c = E.sampleCase();
  c.goals = [];
  c.goals.push({ on: true, name: "買房", type: "購屋", present: 12_000_000, minPresent: 0, start: 45, end: 45, freq: 0, growth: "固定",
    appreciation: 0, loanRatio: 75, loanRate: 2.4, loanYears: 30, imp: 4, prepared: 0, ...over });
  return c;
}
const L = (c: unknown) => E.goalLoans(c)[0];

describe("寬限期", () => {
  it("範本起手：預售 3 年／新成屋 2 年／中古 0；舊目標（沒屋況）0", () => {
    expect(HOUSE_PAY_DEFAULT["預售"].graceYears).toBe(3);
    expect(L(caseWith({ condition: "預售" })).liab.grace).toBe(36);
    expect(L(caseWith({ condition: "新成屋" })).liab.grace).toBe(24);
    expect(L(caseWith({ condition: "中古" })).liab.grace).toBe(0);
    expect(L(caseWith({})).liab.grace).toBe(0);
  });
  it("寬限期內只繳息、本金不動；寬限後本金攤在剩餘年期，最後一年還完", () => {
    const c = caseWith({ condition: "新成屋" });
    const g = L(c), a0 = c.profile.age, loan = 9_000_000;
    expect(g.liab.pay).toBeCloseTo(E.pmt(loan, 2.4, 360 - 24), 6);
    // 45、46 歲：只繳息（900 萬 × 2.4%）、餘額不動
    expect(E.goalLoanPayAt(g, 45, a0)).toBeCloseTo(loan * 0.024, 2);
    expect(E.lRemain(g.liab, 46, a0)).toBeCloseTo(loan, 2);
    // 47 歲起：本息攤還
    expect(E.goalLoanPayAt(g, 47, a0)).toBeCloseTo(g.liab.pay * 12, 2);
    expect(E.lRemain(g.liab, 75, a0)).toBeLessThan(1);   // 45+30 年還完
    expect(E.goalLoanPayAt(g, 75, a0)).toBe(0);
  });
  it("每筆可覆寫 g.pay.graceYears；寬限期 ≥ 年期時視為 0", () => {
    expect(L(caseWith({ condition: "中古", pay: { graceYears: 1 } })).liab.grace).toBe(12);
    expect(L(caseWith({ condition: "預售", pay: { graceYears: 30 } })).liab.grace).toBe(0);
  });
});

describe("裝修款", () => {
  it("不併總價：貸款只用屋價算；裝修在交屋年當自備扣（預售＝交屋年 48）", () => {
    const g = L(caseWith({ condition: "預售", decoCost: 800_000 }));
    expect(g.liab.balance).toBe(9_000_000);
    const d = g.pays.find((p: { label: string }) => p.label === "裝修（自備）");
    expect(d).toMatchObject({ age: 48, amount: 800_000 });
    expect(g.decoLiab).toBeNull();
  });
  it("裝修貸：成數／利率／年期都填才成立，變成第二筆負債（無寬限），自備只剩現金部分", () => {
    const c = caseWith({ condition: "新成屋", decoCost: 1_000_000, decoLoanRatio: 80, decoLoanRate: 4, decoLoanYears: 7 });
    const g = L(c), a0 = c.profile.age;
    expect(g.pays.find((p: { label: string }) => p.label === "裝修（自備）").amount).toBe(200_000);
    expect(g.decoLiab).toMatchObject({ balance: 800_000, rate: 4, months: 84, startAge: 45, grace: 0 });
    expect(E.goalLoanPayAt(g, 46, a0)).toBeCloseTo(g.liab.pay * 0 + 9_000_000 * 0.024 + g.decoLiab.pay * 12, 2);   // 房貸寬限只繳息＋裝修貸本息
    expect(E.goalLoanRemain(g, 45, a0)).toBeCloseTo(9_000_000 + E.lRemain(g.decoLiab, 45, a0), 2);
    // 缺一個就退回現金付
    const c2 = caseWith({ condition: "新成屋", decoCost: 1_000_000, decoLoanRatio: 80, decoLoanRate: 4 });
    expect(L(c2).decoLiab).toBeNull();
    expect(L(c2).pays.find((p: { label: string }) => p.label === "裝修（自備）").amount).toBe(1_000_000);
  });
  it("舊資料已併入總價（decoIn）：不再算第二次", () => {
    const g = L(caseWith({ condition: "新成屋", decoCost: 1_000_000, decoIn: true }));
    expect(g.pays.find((p: { label: string }) => p.label === "裝修（自備）")).toBeUndefined();
    expect(g.decoLiab).toBeNull();
  });
  it("投影：裝修自備進交屋年支出；裝修貸月付進負債；裝修不進固定資產", () => {
    const a = E.projection(caseWith({ condition: "新成屋", decoCost: 1_000_000, decoLoanRatio: 50, decoLoanRate: 4, decoLoanYears: 5 })).rows;
    const b = E.projection(caseWith({ condition: "新成屋" })).rows;
    const at = (rows: { age: number }[], age: number) => rows.find((r) => r.age === age) as Record<string, number>;
    expect(at(a, 45).goal - at(b, 45).goal).toBeCloseTo(500_000, 2);
    expect(at(a, 46).debt).toBeGreaterThan(at(b, 46).debt);
    expect(at(a, 52).debt).toBeCloseTo(at(b, 52).debt, 2);   // 5 年還完
  });
});

describe("engine.ts ↔ lantu-app.html", () => {
  it("投影每一年結餘與淨值一致；關鍵函式逐字對拍", async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    const w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    for (const g of [{ condition: "預售", decoCost: 800_000 }, { condition: "新成屋", decoCost: 1_000_000, decoLoanRatio: 80, decoLoanRate: 4, decoLoanYears: 7 }, { condition: "中古", pay: { graceYears: 2 } }, {}]) {
      const c = caseWith(g);
      const a = E.projection(c).rows, b = w.projection(JSON.parse(JSON.stringify(c))).rows;
      for (let i = 0; i < a.length; i++) {
        expect(b[i].bal, `第 ${i} 年結餘`).toBeCloseTo(a[i].bal, 2);
        expect(b[i].net, `第 ${i} 年淨值`).toBeCloseTo(a[i].net, 2);
      }
    }
    for (const lit of [
      // 2026/09/27 購車：liab 可為 null（全款／租賃）、殘值型還沒付的尾款算在剩餘本金裡
      "function goalLoanPayAt(L,age,a0){return (L.liab?debtPayAt(L.liab,age,a0):0)+(L.decoLiab?debtPayAt(L.decoLiab,age,a0):0);}",
      "function goalLoanRemain(L,age,a0){return (L.liab?lRemain(L.liab,age,a0):0)+(L.decoLiab?lRemain(L.decoLiab,age,a0):0)+((L.balloon>0&&age>=L.buyAge&&age<L.balloonAge)?L.balloon:0);}",
      "  var graceM=Math.round(housePayTpl(g).graceYears*12);if(graceM>=months)graceM=0;",
      "   liab:{balance:loan,rate:rate,pay:pmt(loan,rate,months-graceM),months:months,",
      "function houseDeco(g,handoverAge,growth){",
    ]) expect(HTML).toContain(lit);
    expect(HTML).not.toContain("function addDecoToPrice(");
  });
  it("購置試算卡：寬限期月付／寬限後月付兩個數字；裝修款有起手值鈕、填了才出現裝修貸欄位", async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    const w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    w.app.role = "coach"; w.app.activeTab = "data";
    const c = w.migrateCase(caseWith({ condition: "新成屋" }));
    w.app.cases = [c]; w.app.activeId = c.id; w.app.dataTab = "goals"; w.GOAL_SEL = "house"; w.GOAL_SEL_ID = c.id;
    w.render();
    let t = w.document.querySelector("#app")!.textContent ?? "";
    expect(t).toContain("寬限期月付");
    expect(t).toContain("寬限後月付");
    expect(t).toContain("帶入起手值（總價 × 5%）");
    expect(t).not.toContain("裝修貸成數");
    w.houseDecoSeed(0);
    expect(c.goals[0].decoCost).toBe(600_000);
    t = w.document.querySelector("#app")!.textContent ?? "";
    expect(t).toContain("裝修貸成數");
    expect(t).toContain("裝修（自備）");
    w.setHouseDeco(0, "decoLoanRatio", "80"); w.setHouseDeco(0, "decoLoanRate", "4"); w.setHouseDeco(0, "decoLoanYears", "7");
    t = w.document.querySelector("#app")!.textContent ?? "";
    expect(t).toMatch(/裝修貸 480,000 月付/);
    w.setHouseDeco(0, "decoLoanYears", "");
    expect(c.goals[0].decoLoanYears).toBeNull();
    // 付款時程欄位多了寬限期
    expect(t).toContain("寬限期（年）");
  });
});
