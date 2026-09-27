import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import * as EngineExports from "./engine";
import { JSDOM } from "jsdom";

/**
 * 購車③⑤⑥（2026/09/27 Ray）：四種取得方式進投影、車子是折舊資產、換車循環折價進頭期、現況車輛賣掉、
 * 規格卡與購車試算 UI、養車成本自動列、分析頁模組與報告書章。
 *   ⚠️ 沒選取得方式（carMode 空）的舊購車目標＝改版前一模一樣（那一年一次扣全額、不進資產）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

function caseWith(over: Record<string, unknown>) {
  const c = E.sampleCase();
  c.goals = []; c.liabilities = [];   // 只留這一筆購車，投影的 goal／debt 欄才不會混到示範資料
  c.goals.push({ on: true, name: "買車", type: "購車", present: 1_000_000, minPresent: 0, start: 45, end: 45, freq: 0, growth: "固定",
    appreciation: 0, loanRatio: 0, imp: 3, prepared: 0, spec: { brand: "Toyota", segment: "轎車", power: "汽油", cc: 1800 }, condition: "新車", ...over });
  return c;
}
const plans = (c: unknown) => E.goalLoans(c).filter((L: { kind?: string }) => L.kind === "car");
const at = (rows: { age: number }[], age: number) => rows.find((r) => r.age === age) as unknown as Record<string, number>;

describe("四種取得方式", () => {
  it("沒選取得方式：不進 goalLoans，投影那一年一次扣全額、不進固定資產（改版前一模一樣）", () => {
    const c = caseWith({});
    expect(plans(c)).toEqual([]);
    const rows = E.projection(c).rows;
    expect(Math.round(at(rows, 45).goal)).toBe(1_000_000);
    expect(at(rows, 46).fixed).toBe(at(rows, 44).fixed);
  });
  it("全款：購車年付車價＋領牌 1.5％；沒有貸款；車子以折舊價值進固定資產", () => {
    const c = caseWith({ carMode: "全款" });
    const [L] = plans(c);
    expect(L.pays).toEqual([{ age: 45, amount: 1_015_000, label: "全款＋領牌" }]);
    expect(L.liab).toBeNull();
    const rows = E.projection(c).rows;
    expect(Math.round(at(rows, 45).goal)).toBe(1_015_000);
    expect(at(rows, 45).debt).toBe(0);
    // 45 歲車價 100 萬進固定資產；46 歲＝100 萬 × 0.8 × 1.1（Toyota）
    expect(Math.round(at(rows, 45).fixed - at(rows, 44).fixed)).toBe(1_000_000);
    expect(Math.round(at(rows, 46).fixed - at(rows, 44).fixed)).toBe(Math.round(1_000_000 * Math.min(0.95, 0.8 * 1.1)));
    expect(Math.round(at(rows, 60).fixed - at(rows, 44).fixed)).toBe(165_000);   // 最後一段 0.15 × 1.1（Toyota）
  });
  it("貸款：頭期＝車價 × 30％ ＋ 領牌；本息攤還 5 年 3.5％；目標列自己填的成數／利率／年期優先", () => {
    const c = caseWith({ carMode: "貸款" });
    const [L] = plans(c);
    expect(L.pays).toEqual([{ age: 45, amount: 300_000 + 15_000, label: "頭期＋領牌" }]);
    expect(L.liab).toMatchObject({ balance: 700_000, rate: 3.5, months: 60, startAge: 45 });
    expect(Math.round(L.liab.pay)).toBe(Math.round(E.pmt(700_000, 3.5, 60)));
    const rows = E.projection(c).rows;
    expect(Math.round(at(rows, 46).debt)).toBe(Math.round(L.liab.pay * 12));
    expect(Math.round(at(rows, 51).debt)).toBe(0);
    const c2 = caseWith({ carMode: "貸款", loanRatio: 50, loanRate: 2, loanYears: 3 });
    expect(plans(c2)[0].liab).toMatchObject({ balance: 500_000, rate: 2, months: 36 });
  });
  it("殘值型：本金扣掉尾款 40％ 攤 3 年、每年付尾款利息、到期那一年付尾款；尾款在付掉前算在剩餘負債裡", () => {
    const c = caseWith({ carMode: "殘值型" });
    const [L] = plans(c);
    expect(L.liab).toMatchObject({ balance: 400_000, rate: 3.8, months: 36 });   // 貸 80 萬 − 尾款 40 萬
    expect(L.balloon).toBe(400_000); expect(L.balloonAge).toBe(48);
    const labels = L.pays.map((p: { age: number; label: string; amount: number }) => [p.age, p.label, Math.round(p.amount)]);
    expect(labels).toEqual([[45, "頭期＋領牌", 215_000], [45, "尾款利息", 15_200], [46, "尾款利息", 15_200], [47, "尾款利息", 15_200], [48, "尾款", 400_000]]);
    expect(E.goalLoanRemain(L, 46, 40)).toBeGreaterThan(400_000);
    expect(E.goalLoanRemain(L, 48, 40)).toBe(0);
  });
  it("租賃：逐年租金 3 年、期末買斷 45％ 才變成自己的車（買斷前不進資產）；買斷 0＝歸還、從不進資產", () => {
    const c = caseWith({ carMode: "租賃" });
    const [L] = plans(c);
    const rent = 1_000_000 * 1.6 / 100 * 12;
    expect(L.pays.filter((p: { label: string }) => p.label === "租金").length).toBe(3);
    expect(L.pays[L.pays.length - 1]).toEqual({ age: 48, amount: 450_000, label: "期末買斷" });
    expect(L.liab).toBeNull();
    expect(E.carValueAt(L, 46)).toBe(0);
    expect(E.carValueAt(L, 48)).toBeGreaterThan(0);
    const rows = E.projection(c).rows;
    expect(Math.round(at(rows, 46).goal)).toBe(Math.round(rent));
    const c2 = caseWith({ carMode: "租賃", pay: { buyout: 0 } });
    const [L2] = plans(c2);
    expect(L2.pays.every((p: { label: string }) => p.label === "租金")).toBe(true);
    expect(L2.ownTo).toBe(L2.ownFrom);
    expect(E.carValueAt(L2, 46)).toBe(0);
  });
  it("每筆目標可覆寫範本（g.pay）：領牌費 0、殘值型尾款 50％", () => {
    const [L] = plans(caseWith({ carMode: "殘值型", pay: { fee: 0, balloon: 50 } }));
    expect(L.pays[0].amount).toBe(200_000);
    expect(L.balloon).toBe(500_000);
  });
});

describe("換車循環與現況車輛", () => {
  it("每 5 年一台到 55 歲＝3 台；第 2 台起舊車以「保值率 × (1−10％)」折抵頭期；舊車價值從換車年起不在資產裡", () => {
    const c = caseWith({ carMode: "全款", cycle: 5, end: 55 });
    const L = plans(c);
    expect(L.map((x: { buyAge: number }) => x.buyAge)).toEqual([45, 50, 55]);
    expect(L[0].ownTo).toBe(50); expect(L[2].ownTo).toBe(Infinity);
    const tradeIn = L[1].pays.find((p: { label: string }) => p.label === "舊車折價");
    // 49 歲的價值＝100 萬 × 保值(4 年)=0.52×1.1 → × 0.9
    expect(Math.round(tradeIn.amount)).toBe(-Math.round(1_000_000 * Math.min(0.95, 0.52 * 1.1) * 0.9));
    expect(E.carValueAt(L[0], 50)).toBe(0);
    expect(Math.round(E.carValueAt(L[1], 50))).toBe(1_000_000);
    const rows = E.projection(c).rows;
    expect(Math.round(at(rows, 50).goal)).toBe(Math.round(1_015_000 + tradeIn.amount));
  });
  it("中古車：買時車齡 3 年，之後的價值以「保值(車齡)／保值(買時車齡)」遞減", () => {
    const c = caseWith({ carMode: "全款", condition: "中古", spec: { brand: "Toyota", segment: "轎車", power: "汽油", cc: 1800, age: 3 }, present: 700_000 });
    const [L] = plans(c);
    expect(L.age0).toBe(3);
    expect(Math.round(E.carValueAt(L, 45))).toBe(700_000);
    expect(Math.round(E.carValueAt(L, 47))).toBe(Math.round(700_000 * (0.52 * 1.1) / (0.64 * 1.1)));
  });
  it("現況車輛勾可變賣、購車目標指定賣掉：購車年淨得＝現值 × (1−10％) − 車貸餘額 進主池，車與車貸從那一年起拿掉", () => {
    const c = caseWith({ carMode: "貸款" });
    c.assets.push({ aid: "car1", name: "現在這台車", mainCat: "自用資產", type: "自用車輛", cls: "固定", value: 400_000, cost: 800_000, fxRate: 1, sellable: true });
    c.liabilities.push({ lid: "cl1", name: "汽車貸款", mainCat: "車貸", balance: 100_000, rate: 3, pay: 5_000, months: 20, startAge: 44, fxRate: 1 });
    c.goals[0].sellAid = "car1"; c.goals[0].sellLid = "cl1";
    const S = E.houseSales(c);
    expect(S.length).toBe(1);
    expect(S[0]).toMatchObject({ age: 45, aid: "car1", lid: "cl1", value: 400_000, fee: 10, name: "現在這台車" });
    expect(Math.round(S[0].gross)).toBe(360_000);
    expect(S[0].net).toBeCloseTo(360_000 - E.lRemain(c.liabilities[c.liabilities.length - 1], 45, 40), 6);
    const rows = E.projection(c).rows;
    expect(Math.round(at(rows, 46).fixed - at(rows, 44).fixed)).toBe(Math.round(1_000_000 * Math.min(0.95, 0.8 * 1.1) - 400_000));
    // 沒勾可變賣就不賣
    c.assets[c.assets.length - 1].sellable = false;
    expect(E.houseSales(c)).toEqual([]);
  });
  it("購車歲早於現齡：不進 goalLoans（也不會一次扣——那是過去的事）", () => {
    const c = caseWith({ carMode: "貸款", start: 30, end: 30 });
    expect(plans(c)).toEqual([]);
  });
});

describe("engine.ts ↔ lantu-app.html", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    w.app.role = "coach"; w.app.activeTab = "data";
  });
  it("四種取得方式＋換車循環：投影每一年結餘、負債、固定資產與淨值一致；引擎函式逐字對拍", () => {
    for (const over of [{}, { carMode: "全款" }, { carMode: "貸款" }, { carMode: "殘值型" }, { carMode: "租賃" }, { carMode: "貸款", cycle: 5, end: 60 }, { carMode: "全款", condition: "中古", spec: { brand: "BMW", segment: "休旅SUV", power: "柴油", age: 4 } }]) {
      const c = caseWith(over);
      const a = E.projection(c).rows, b = w.projection(JSON.parse(JSON.stringify(c))).rows;
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        for (const k of ["bal", "debt", "fixed", "net", "goal"]) expect(b[i][k], `${JSON.stringify(over)} 第 ${i} 年 ${k}`).toBeCloseTo(a[i][k], 2);
      }
    }
    const engine = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
    for (const fn of ["carPayTpl", "carRetentionOf", "carValueAt", "carPlans", "goalLoanAssetAt", "carCurveAt"]) {
      const re = new RegExp("function " + fn + "\\([\\s\\S]*?\\n}\\n");
      const a = HTML.match(re)?.[0], b = engine.match(re)?.[0];
      expect(a, fn + " html").toBeTruthy();
      expect(b, fn + " engine").toBe(a);
    }
    expect(HTML).toContain("if(g.type==='購車'&&g.carMode){var cgr=g.growth==='通膨'?infl:(g.growth==='薪資'?sg:0);carPlans(c,g,idx,a0,cgr).forEach(function(L){out.push(L)});return;}");
    expect(HTML).toContain("var isCar=(g.type==='購車'&&!!g.carMode);");
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fresh(): any {
    const c = w.migrateCase(w.newCase());
    w.app.cases = [c]; w.app.activeId = c.id; w.app.dataTab = "goals";
    w.addGoalInGroup("car");
    w.GOAL_SEL = "car"; w.GOAL_SEL_ID = c.id;
    w.render();
    return c;
  }
  const $ = (s: string) => w.document.querySelector(s);
  const text = () => $("#app").textContent as string;

  it("購車群：規格卡、購車試算、持有成本三塊都在；新目標預設走貸款；輸入框不在 data-calc 裡", () => {
    const c = fresh(); const g = c.goals[c.goals.length - 1];
    expect(g.carMode).toBe("貸款"); expect(g.condition).toBe("新車");
    expect(text()).toContain("這一台車");
    expect(text()).toContain("購車試算");
    expect(text()).toContain("買車之後的持有成本");
    const sec = $('[data-goalanchor-detail="car-spec"]');
    expect(sec).toBeTruthy();
    expect([...sec.querySelectorAll("input,select")].every((el: Element) => !el.closest("[data-calc]"))).toBe(true);
    expect(text()).toContain("先選品牌");
  });
  it("品牌×車型×動力 → 估值回填總價、帶入貸款起手；手改總價＝手填、一鍵回估值；中古才問車齡；純電問馬力", () => {
    const c = fresh(); const i = c.goals.length - 1;
    w.setCarSpec(i, "brand", "Toyota");
    w.setCarSpec(i, "segment", "休旅SUV");
    w.setCarSpec(i, "power", "油電");
    expect(c.goals[i].present).toBe(Math.round(105 * 1.15) * 10000);
    expect(c.goals[i].loanRatio).toBe(70); expect(c.goals[i].loanYears).toBe(5); expect(c.goals[i].loanRate).toBe(3.5);
    expect($('[data-calc="carEst:' + i + '"]').textContent).toContain("等級層");
    w.set("goals:" + i, "present", 1_500_000, "num");
    expect(c.goals[i].priceManual).toBe(true);
    w.setCarSpec(i, "segment", "轎車");
    expect(c.goals[i].present).toBe(1_500_000);
    w.carUseEstimate(i);
    expect(c.goals[i].priceManual).toBe(false);
    expect(c.goals[i].present).toBe(Math.round(85 * 1.15) * 10000);
    expect(text()).not.toContain("車齡（年）");
    w.setCarSpec(i, "condition", "中古"); w.setCarSpec(i, "age", 3);
    expect(text()).toContain("車齡（年）");
    expect(c.goals[i].present).toBe(Math.round(Math.round(85 * 1.15) * 10000 * Math.min(0.95, 0.64 * 1.1)));
    expect(text()).toContain("排氣量");
    w.setCarSpec(i, "power", "純電");
    expect(text()).toContain("馬力");
  });
  it("養車成本：帶入預設 6 列（帶 auto 鍵、金額由規格推）；規格一改跟著更新；教練改過金額的列不再覆蓋；租賃時保險與保養記 0", () => {
    const c = fresh(); const i = c.goals.length - 1;
    w.setCarSpec(i, "brand", "Toyota"); w.setCarSpec(i, "cc", 1800);
    w.addDetailPresets("car");
    const rows = () => c.expenses.filter((x: { tag: string }) => x.tag === "car");
    expect(rows().length).toBe(6);
    expect(rows().every((x: { auto: string }) => !!x.auto)).toBe(true);
    const tax = rows().find((x: { auto: string }) => x.auto === "tax");
    expect(tax.amount).toBe(7120 + 4800);
    expect(tax.start).toBe(c.goals[i].start); expect(tax.end).toBe(c.goals[i].start + 7 - 1);
    w.setCarSpec(i, "cc", 2400);
    expect(tax.amount).toBe(11230 + 6180);
    const ins = rows().find((x: { auto: string }) => x.auto === "ins");
    const ei = c.expenses.indexOf(ins);
    w.set("expenses:" + ei, "amount", 12345, "num");
    expect(ins.manual).toBe(true);
    w.setCarSpec(i, "cc", 1800);
    expect(ins.amount).toBe(12345);
    w.setCarSpec(i, "carMode", "租賃");
    expect(rows().find((x: { auto: string }) => x.auto === "maint").amount).toBe(0);
    expect(ins.amount).toBe(12345);   // 手填的還是手填
    // 換車每 5 年到 60 歲 → 持有成本到最後一台換掉為止
    w.setCarSpec(i, "carMode", "貸款");
    w.setCarSpec(i, "cycle", 5); w.set("goals:" + i, "end", c.goals[i].start + 10, "num");
    expect(tax.end).toBe(c.goals[i].start + 10 + 5 - 1);
  });
  it("購車試算：時程、20-4-10 檢核、四方案 TCO（含不買車）；公司名義帶折舊上限提示；分析頁模組與報告書章都出現", () => {
    const c = fresh(); const i = c.goals.length - 1;
    w.setCarSpec(i, "brand", "Toyota"); w.setCarSpec(i, "cc", 1800);
    w.setCarSpec(i, "carMode", "殘值型");
    const calc = $('[data-calc="carCalc:' + i + '"]').textContent;
    expect(calc).toContain("頭期＋領牌"); expect(calc).toContain("尾款");
    expect(calc).toContain("20-4-10");
    expect(calc).toContain("10 年總持有成本");
    for (const m of ["全款", "貸款", "殘值型", "租賃", "不買車"]) expect(calc).toContain(m);
    expect(calc).toContain("殘值型（目前選的）");
    expect(calc).not.toContain("折舊上限");
    w.setCarSpec(i, "company", true);
    expect($('[data-calc="carCalc:' + i + '"]').textContent).toContain("折舊上限");
    const tco = w.carTCO(c, c.goals[i], 10);
    expect(tco.map((x: { mode: string }) => x.mode)).toEqual(["全款", "貸款", "殘值型", "租賃", "不買車"]);
    expect(tco[1].total).toBeGreaterThan(tco[0].total);   // 貸款多付利息
    const an = w.analysisModules(c).find((m: { k: string }) => m.k === "car");
    expect(an).toBeTruthy(); expect(an.when).toBe(true);
    const html = an.html();
    expect(html).toContain("一生 1 台車"); expect(html).toContain("<svg");
    expect(w.rCarPlan(c)).toContain("購車規劃：");
    c.goals[i].carMode = "";
    expect(w.analysisModules(c).find((m: { k: string }) => m.k === "car")).toBeUndefined();
    expect(w.rCarPlan(c)).toBe("");
  });
  it("現況車輛：資產表車輛列有「可變賣」；勾了才出現在購車試算的下拉", () => {
    const c = fresh(); const i = c.goals.length - 1;
    c.assets.push({ name: "老車", mainCat: "自用資產", type: "自用車輛", cls: "固定", value: 300_000, cost: 0, fxRate: 1 });
    w.ensureRowIds(c); w.render();
    expect(text()).toContain("都還沒勾「可變賣」");
    c.assets[c.assets.length - 1].sellable = true; w.render();
    expect(text()).not.toContain("都還沒勾「可變賣」");
    w.setHouseSell(i, "sellAid", c.assets[c.assets.length - 1].aid);
    expect($('[data-calc="carSell:' + i + '"]').textContent).toContain("淨得");
  });
});
