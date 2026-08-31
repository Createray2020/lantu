import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 職涯 / 創業規劃 → 真的進現金流（2026/08/31 Ray 拍板）。
 *
 * ⚠️⚠️ 在此之前 c.career 整組（switchAge / switchFund / startupType / startupBudget）
 *    是**死欄位**：engine.ts 一個字都沒讀，只有報告書把它印出來。
 *    「職涯規劃」被勾成必須達成時，它的錢從來沒進過現金流——缺口一律低估。
 *
 * Ray 的原問題是「轉換預備資金跟創業預算不同在哪裡？」——程式上當時沒有差別，
 * 因為兩個都不進計算。現在兩者各是一筆一次性支出，落在「預計幾歲轉換」那一年：
 *   · 轉換期預備金 switchFund   ＝ 沒有薪水的那幾個月要活下去的現金
 *   · 創業投入本金 startupBudget ＝ 一次投進事業的錢
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fresh(): any {
  const c = w.migrateCase(w.newCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const careerRows = (c: any) => (c.goals || []).filter((g: { careerAuto?: string }) => g.careerAuto);

describe("兩筆錢是兩件事，落點也不同", () => {
  it("考慮轉職：只有轉換期預備金，落在「預計幾歲轉換」那一年", () => {
    const c = fresh();
    c.career = { plan: "考慮轉職", switchAge: 45, switchFund: 600_000, startupType: "", startupBudget: 0, importance: 4 };
    w.applyCareerPlan(c);
    const rows = careerRows(c);
    expect(rows.length).toBe(1);
    expect(rows[0].careerAuto).toBe("switch");
    expect(rows[0].type).toBe("職涯轉換");
    expect(rows[0].present).toBe(600_000);
    expect(rows[0].start).toBe(45);
    expect(rows[0].end).toBe(45);
    expect(rows[0].imp).toBe(4);
  });

  it("考慮創業：兩筆都在——開店那段期間一樣沒有薪水", () => {
    const c = fresh();
    c.career = { plan: "考慮創業", switchAge: 42, switchFund: 800_000, startupType: "餐飲", startupBudget: 3_000_000, importance: 5 };
    w.applyCareerPlan(c);
    const rows = careerRows(c);
    expect(rows.map((g: { type: string }) => g.type).sort()).toEqual(["創業", "職涯轉換"]);
    expect(rows.find((g: { careerAuto: string }) => g.careerAuto === "startup").present).toBe(3_000_000);
    expect(rows.every((g: { start: number }) => g.start === 42)).toBe(true);
  });

  it("⚠️ 轉職不會冒出「創業投入本金」——這正是 Ray 問的那個差別", () => {
    const c = fresh();
    c.career = { plan: "考慮轉職", switchAge: 50, switchFund: 500_000, startupBudget: 9_999_999, importance: 3 };
    w.applyCareerPlan(c);
    expect(careerRows(c).map((g: { careerAuto: string }) => g.careerAuto)).toEqual(["switch"]);
  });
});

describe("重填是更新，不是複製", () => {
  it("同一筆改金額只會有一列", () => {
    const c = fresh();
    c.career = { plan: "考慮創業", switchAge: 40, switchFund: 0, startupBudget: 1_000_000, importance: 3 };
    w.applyCareerPlan(c);
    c.career.startupBudget = 2_500_000;
    w.applyCareerPlan(c);
    w.applyCareerPlan(c);
    const rows = careerRows(c);
    expect(rows.length).toBe(1);
    expect(rows[0].present).toBe(2_500_000);
  });

  it("計畫改回「無」／金額歸零／年齡清掉，那一列自己收掉（不留孤兒）", () => {
    const c = fresh();
    c.career = { plan: "考慮創業", switchAge: 40, switchFund: 300_000, startupBudget: 1_000_000, importance: 3 };
    w.applyCareerPlan(c);
    expect(careerRows(c).length).toBe(2);

    c.career.plan = "無";
    w.applyCareerPlan(c);
    expect(careerRows(c).length).toBe(0);

    c.career.plan = "考慮創業";
    w.applyCareerPlan(c);
    c.career.switchAge = "";
    w.applyCareerPlan(c);
    expect(careerRows(c).length, "沒有年齡就落不到時間軸上，寧可不算").toBe(0);
  });

  it("⚠️ 只動 career 自己的列，教練手填的目標一列都不碰", () => {
    const c = fresh();
    c.goals = [{ on: true, name: "換屋", type: "購屋", present: 12_000_000, start: 50, end: 50 }];
    c.career = { plan: "考慮創業", switchAge: 40, switchFund: 0, startupBudget: 1_000_000, importance: 3 };
    w.applyCareerPlan(c);
    c.career.plan = "無";
    w.applyCareerPlan(c);
    expect(c.goals.length).toBe(1);
    expect(c.goals[0].name).toBe("換屋");
  });
});

describe("真的進了現金流", () => {
  it("創業本金會拉低那一年之後的可投資資產（以前完全沒感覺）", () => {
    const before = (() => {
      const c = fresh();
      c.career = { plan: "無", switchAge: "", switchFund: 0, startupBudget: 0, importance: 3 };
      w.applyCareerPlan(c);
      return w.metrics(c).proj.shortPV;
    })();
    const after = (() => {
      const c = fresh();
      c.career = { plan: "考慮創業", switchAge: 45, switchFund: 0, startupBudget: 5_000_000, importance: 5 };
      w.applyCareerPlan(c);
      return w.metrics(c).proj.shortPV;
    })();
    expect(after).toBeGreaterThan(before);
  });

  it("類型下拉含這兩種——不含的話這幾列一被打開就會靜靜跳回第一個選項", () => {
    expect(HTML).toContain("sel:購屋,置產,購車,婚姻,生育,孝親,職涯轉換,創業,傳承,其他");
  });

  it("migrateCase 會替既有資料補上（舊案打開就會看到那筆錢）", () => {
    const raw = w.newCase();
    raw.career = { plan: "考慮創業", switchAge: 48, switchFund: 400_000, startupBudget: 2_000_000, importance: 4 };
    const c = w.migrateCase(raw);
    expect(careerRows(c).length).toBe(2);
  });
});

describe("欄位語意講清楚（Ray 問「差在哪裡」的正解寫在畫面上）", () => {
  it("兩個欄位各自標明是什麼錢", () => {
    expect(HTML).toContain("轉換期預備金（空窗期生活費）");
    expect(HTML).toContain("創業投入本金（一次性）");
  });

  it("欄位下方一句話說清楚差別", () => {
    expect(HTML).toContain("沒有薪水的那幾個月要活下去的現金");
    expect(HTML).toContain("一次投進事業的錢");
  });

  it("填完當場看得到它變成哪一筆（不是填了不知道去哪）", () => {
    const c = fresh();
    c.career = { plan: "考慮創業", switchAge: 45, switchFund: 0, startupBudget: 1_500_000, importance: 3 };
    w.applyCareerPlan(c);
    const h = w.careerCalcHTML(c) as string;
    expect(h).toContain("45 歲");
    expect(h).toContain("創業投入本金");
  });

  it("沒填年齡時要說出來，而不是安靜地不算", () => {
    const c = fresh();
    c.career = { plan: "考慮創業", switchAge: "", switchFund: 0, startupBudget: 1_500_000, importance: 3 };
    expect(w.careerCalcHTML(c)).toContain("還沒填「預計幾歲轉換」");
  });
});
