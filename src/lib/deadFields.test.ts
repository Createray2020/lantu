import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 2026/08/29「死欄位」接線（C1–C11）。
 *
 * 這一批全部是**填得進去、但引擎裡完全沒有讀取點**的欄位：教練照著 UI 填，
 * 數字卻一動也不動。每一項在這裡都要有兩組釘子：
 *   ① 填了會怎樣（真的生效）
 *   ② **沒填會怎樣**（未填的語意寫死，之後不會有人「順手」把預設翻面）
 *
 * ⚠️ 兩份實作（engine.ts ↔ lantu-app.html）的逐字對拍在 engine.drift.test.ts，
 *    這裡只釘行為。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  if (!w.app.cases.length) w.app.cases = [w.sampleCase()];
  w.app.activeId = w.app.cases[0].id;
});

/* ══════════════ C1 expenses[].cut 可刪減% ══════════════ */
describe("C1 可刪減%（expenses[].cut）：教練設的保護線，槓桿不能蓋過去", () => {
  it("填了 cut：實際砍幅 ＝ min(槓桿%, 本列 cut%)", () => {
    const c = E.sampleCase();               // 生活費用 720,000、cut:10
    const cut = E.applyLevers(c, { expense: 30 });
    const row = cut.expenses.find((e: { name: string }) => e.name === "生活費用");
    // 改版前：720,000 × (1−30%) = 504,000（教練設的 10% 保護線被無視）
    expect(row.amount).toBe(720_000 * 0.9);
    expect(row.amount).toBe(648_000);
  });

  it("槓桿低於 cut 時，以槓桿為準（cut 是上限、不是固定值）", () => {
    const c = E.sampleCase();
    const row = E.applyLevers(c, { expense: 4 }).expenses
      .find((e: { name: string }) => e.name === "生活費用");
    expect(row.amount).toBeCloseTo(720_000 * 0.96, 6);
  });

  it("⚠️ 未填（0／空／undefined）＝沒有設上限＝吃槓桿的全額", () => {
    for (const blank of [0, "", null, undefined]) {
      const c = E.sampleCase();
      c.expenses = [{ name: "生活費用", cat: "生活", amount: 1_000_000, cut: blank }];
      const row = E.applyLevers(c, { expense: 30 }).expenses[0];
      expect(row.amount, "cut=" + JSON.stringify(blank) + " 必須被砍滿 30%").toBe(700_000);
    }
    expect(E.rowCutPct({}, 30)).toBe(30);
    expect(E.rowCutPct({ cut: 0 }, 30)).toBe(30);
    expect(E.rowCutPct({ cut: 10 }, 30)).toBe(10);
    expect(E.rowCutPct({ cut: 40 }, 30)).toBe(30);   // 本列上限比槓桿寬 → 以槓桿為準
  });

  it("只砍生活/消費，其他大類不受 cut 影響（語意沒變）", () => {
    const c = E.sampleCase();
    const a = E.applyLevers(c, { expense: 30 });
    const parent = a.expenses.find((e: { name: string }) => e.name === "孝親費");
    expect(parent.amount).toBe(240_000);            // 孝親 cut:20 但不是生活/消費 → 不動
  });

  it("求解器的上限跟著縮：leverRange('expense').hi ＝ expenseCutCap()", () => {
    const c = E.sampleCase();
    expect(E.expenseCutCap(c)).toBe(10);            // 唯一一列生活/消費的 cut 是 10
    expect(E.leverRange(c, "expense").hi).toBe(10);
    // 一列沒設上限就會把整根槓桿的上限放回全域 CAP
    c.expenses.push({ name: "娛樂", cat: "消費", amount: 100_000, cut: 0 });
    expect(E.expenseCutCap(c)).toBe(E.CAP_EXPENSE_CUT);
  });

  it("完全沒有生活/消費列 → 上限 0，求解器直接判此路不通（不會回一個假的解）", () => {
    const c = E.sampleCase();
    c.expenses = c.expenses.filter((e: { cat: string }) => e.cat !== "生活" && e.cat !== "消費");
    expect(E.expenseCutCap(c)).toBe(0);
    const r = E.solveLever(c, "expense", {});
    if (r.needed) expect(r.feasible).toBe(false);
  });

  it("⚠️ 求解器不會回一個「砍得到但其實砍不到」的答案：解出來的 x 一定 ≤ 可達上限", () => {
    const c = E.sampleCase();
    const cap = E.expenseCutCap(c);
    const rows = E.prescriptions(c);
    for (const rx of rows) {
      const x = E.n(rx.levers.expense);
      if (x) expect(x, rx.name + " 開出的減少支出 " + x + "% 超過可達上限 " + cap + "%").toBeLessThanOrEqual(cap + 1e-6);
    }
  });
});

/* ══════════════ C2 needs[].careMonths 照護月數 ══════════════ */
describe("C2 照護月數（needs[].careMonths）：長照總需求的換算佐證", () => {
  it("填了月數：月缺口 × 月數 ＝ 換算總額", () => {
    const c = E.sampleCase();               // monthCare 30,000、careMonths 120
    const g = E.coverageGaps(c).find((r: { kind: string }) => r.kind === "每月照護");
    expect(g.months).toBe(120);
    expect(g.monthsAssumed).toBe(false);
    expect(g.needTotal).toBe(30_000 * 120);
    expect(g.needTotal).toBe(3_600_000);
    expect(g.gapTotal).toBe(Math.max(0, g.gap) * 120);
  });

  it("⚠️ 未填（0／空）＝預設 120 個月，而且一定要標成「系統假設」", () => {
    expect(E.DEFAULT_CARE_MONTHS).toBe(120);
    for (const blank of [0, "", null, undefined]) {
      expect(E.careMonthsOf({ careMonths: blank })).toEqual({ months: 120, assumed: true });
    }
    expect(E.careMonthsOf({ careMonths: 60 })).toEqual({ months: 60, assumed: false });
  });

  it("⚠️⚠️ 換算總額刻意不併進 lump：三種給付單位不相加的拍板不能被這一項破壞", () => {
    const c = E.sampleCase();
    const before = E.gapTotals(c);
    c.needs[0].careMonths = 240;            // 月數翻倍
    const after = E.gapTotals(c);
    expect(after.lump).toBe(before.lump);
    expect(after.monthly).toBe(before.monthly);
    expect(after.daily).toBe(before.daily);
    expect(E.health(c).safety).toBe(E.health(E.sampleCase()).safety);
  });

  it("careNeedRows() 逐位被保人給月額與換算總額", () => {
    const c = E.sampleCase();
    const rows = E.careNeedRows(c);
    expect(rows.length).toBe(1);
    expect(rows[0].member).toBe("王大明");
    expect(rows[0].monthly).toBe(30_000);
    expect(rows[0].months).toBe(120);
    expect(rows[0].needTotal).toBe(3_600_000);
  });
});

/* ══════════════ C3 liabilities[].repay / grace ══════════════ */
describe("C3 攤還方式（repay）與寬限期（grace）", () => {
  const loan = (extra: Record<string, unknown>) => ({
    name: "房貸", balance: 10_000_000, rate: 2, pay: 44_000, months: 360, startAge: 40, ...extra,
  });
  const caseWith = (l: Record<string, unknown>) => {
    const c = E.sampleCase();
    c.profile.age = 40;
    c.liabilities = [l];
    return c;
  };

  it("只付利息：本金一毛不減，年現金流＝餘額 × 年利率", () => {
    const l = loan({ repay: "只付利息" });
    expect(E.lRemain(l, 50, 40)).toBe(10_000_000);       // 10 年後本金原封不動
    expect(E.debtPayAt(l, 40, 40)).toBe(10_000_000 * 0.02);
    expect(E.annualDebtPay(caseWith(l))).toBe(200_000);
  });

  it("暫緩還款：本息都不付，利息滾入本金（負債會長大）", () => {
    const l = loan({ repay: "暫緩還款" });
    expect(E.debtPayAt(l, 40, 40)).toBe(0);
    expect(E.annualDebtPay(caseWith(l))).toBe(0);
    const after5 = E.lRemain(l, 45, 40);
    expect(after5).toBeGreaterThan(10_000_000);
    expect(after5).toBeCloseTo(10_000_000 * Math.pow(1 + 0.02 / 12, 60), 2);
  });

  it("寬限期：前 N 個月只繳息、本金不動，期滿後才開始攤本金", () => {
    const l = loan({ grace: 24 });                        // 2 年寬限
    expect(E.lRemain(l, 41, 40)).toBe(10_000_000);        // 寬限期內本金不動
    expect(E.lRemain(l, 42, 40)).toBe(10_000_000);
    expect(E.lRemain(l, 43, 40)).toBeLessThan(10_000_000);// 期滿開始攤
    expect(E.debtPayAt(l, 41, 40)).toBeCloseTo(10_000_000 * 0.02, 6);
    expect(E.debtPayAt(l, 43, 40)).toBe(44_000 * 12);     // 期滿改本息攤還
    // 寬限期讓本金晚 24 個月才開始攤 → 同一年的剩餘本金一定比沒寬限期的高
    expect(E.lRemain(l, 50, 40)).toBeGreaterThan(E.lRemain(loan({}), 50, 40));
  });

  it("⚠️ 未填 repay／grace ＝ 本息攤還、無寬限期，數字與改版前一位不差", () => {
    for (const blank of [undefined, "", "本息攤還"]) {
      const l = loan({ repay: blank });
      expect(E.repayMode(l)).toBe("本息攤還");
      expect(E.debtPayAt(l, 40, 40)).toBe(44_000 * 12);
    }
    for (const blank of [undefined, 0, "", null]) {
      expect(E.graceMonths({ grace: blank })).toBe(0);
    }
    // 本息攤還的剩餘本金公式沒有被動到
    const l = loan({});
    const P = 10_000_000, i = 0.02 / 12, k = 120, f = Math.pow(1 + i, k);
    expect(E.lRemain(l, 50, 40)).toBeCloseTo(P * f - 44_000 * (f - 1) / i, 4);
  });

  it("投影／蒙地卡羅／比率表吃的是同一支 debtPayAt（不會投影照付、比率只付息）", () => {
    const c = caseWith(loan({ repay: "只付利息" }));
    const r0 = E.projection(c).rows[0];
    expect(r0.debt).toBe(E.annualDebtPay(c));
    expect(r0.debt).toBe(200_000);
  });

  it("已經還完的負債不再產生現金流（語意沒變）", () => {
    const l = loan({ months: 12, repay: "只付利息" });
    expect(E.debtPayAt(l, 42, 40)).toBe(0);
  });
});

/* ══════════════ C4 assets[].ret 報酬率% ══════════════ */
describe("C4 報酬率%（assets[].ret）：收益金額優先，其次報酬率", () => {
  const one = (a: Record<string, unknown>) => {
    const c = E.sampleCase();
    c.assets = [{ name: "x", value: 1_000_000, fxRate: 1, cls: "流動", ...a }];
    return c;
  };

  it("addRow 的資產範本寫 income:0 時也要能吃到 ret（這就是原本的斷點）", () => {
    expect(E.assetPassive(one({ type: "現金", ret: 0.5, income: 0 }))).toBe(5_000);
  });

  it("income 有正值 → 用 income，ret 不重複計入", () => {
    expect(E.assetPassive(one({ type: "股票", ret: 6, income: 120_000 }))).toBe(120_000);
  });

  it("不再限定股票/基金/債券：活存、儲蓄險現值一樣算被動現金流", () => {
    expect(E.assetPassive(one({ type: "儲蓄險現金價值", ret: 2, income: 0 }))).toBe(20_000);
    expect(E.assetPassive(one({ type: "保單", ret: 2, income: "" }))).toBe(20_000);
  });

  it("⚠️ 兩欄都沒填（或 ret=0）＝完全不產生被動現金流", () => {
    expect(E.assetPassive(one({ type: "現金", ret: 0, income: 0 }))).toBe(0);
    expect(E.assetPassive(one({ type: "現金" }))).toBe(0);
    expect(E.assetPassive(one({ type: "不動產", ret: "", income: "" }))).toBe(0);
  });

  it("到期之後就不再生錢（matureAge 的既有語意沒被動到）", () => {
    const c = one({ type: "現金", ret: 5, income: 0, matureAge: 30 });
    c.profile.age = 40;
    expect(E.assetPassive(c)).toBe(0);
  });

  it("匯率照算（aVal 換算台幣後再乘 ret）", () => {
    expect(E.assetPassive(one({ type: "股票", value: 100_000, fxRate: 32, ret: 5, income: 0 })))
      .toBe(100_000 * 32 * 0.05);
  });

  it("addRow 的資產範本改成 income:''，「沒填」與「填 0」分得開", () => {
    expect(HTML).toContain("cost:0,value:0,ret:0,income:'',movable:true}");
  });
});

/* ══════════════ C5 retire.prepared[].method ══════════════ */
describe("C5 領取方式（retire.prepared[].method）", () => {
  const rc = (prepared: unknown[]) => {
    const c = E.sampleCase();
    c.profile.retireAge = 65; c.profile.lifeExp = 85;
    c.retire = { monthLiving: 55_000, retireReturn: 4, retireInflation: 1.5, prepared };
    return c;
  };

  it("月領：月額 × 12 → 退休期成長型年金現值（與需求端同一條公式）", () => {
    const c = rc([{ item: "勞保年金", age: 65, amount: 30_000, method: "月領" }]);
    const pv = E.growingAnnuityPV(30_000 * 12, 0.04, 0.015, 20);
    expect(E.preparedPV(c, c.retire.prepared[0])).toBeCloseTo(pv, 6);
    expect(E.retireNeed(c).prepared).toBeCloseTo(pv, 6);
    // 改版前這一列被當成「一次領 3 萬」
    expect(E.retireNeed(c).prepared).toBeGreaterThan(30_000);
  });

  it("起領年齡晚於退休年齡 → 期數縮短，並折現回退休年", () => {
    const c = rc([{ item: "商業年金", age: 70, amount: 20_000, method: "月領" }]);
    const at70 = E.growingAnnuityPV(20_000 * 12, 0.04, 0.015, 15);
    expect(E.preparedPV(c, c.retire.prepared[0])).toBeCloseTo(at70 / Math.pow(1.04, 5), 6);
  });

  it("⚠️ 一次領／自提／未填 ＝ 原值計入（自提照一次領算，語意待 Ray 拍板）", () => {
    for (const m of ["一次領", "自提", "", null, undefined]) {
      const c = rc([{ item: "勞退", age: 65, amount: 3_000_000, method: m }]);
      expect(E.preparedPV(c, c.retire.prepared[0]), "method=" + m).toBe(3_000_000);
    }
  });

  it("⚠️⚠️ 月額合理性守門員：金額大到不可能是月額 → 不換算、維持改版前的原值，並標 suspect", () => {
    expect(E.PREPARED_MONTHLY_MAX).toBe(300_000);
    const c = rc([{ item: "勞退新制", age: 65, amount: 3_600_000, method: "月領" }]);
    expect(E.preparedSuspect(c.retire.prepared[0])).toBe(true);
    expect(E.preparedPV(c, c.retire.prepared[0])).toBe(3_600_000);   // 一位不差
    const rows = E.retireNeed(c).preparedRows;
    expect(rows[0].suspect).toBe(true);
    expect(rows[0].converted).toBe(false);
  });

  it("守門員留了活路：勾「確認為月額」（monthlyOk）就照常換算", () => {
    const c = rc([{ item: "商業年金", age: 65, amount: 400_000, method: "月領", monthlyOk: true }]);
    expect(E.preparedSuspect(c.retire.prepared[0])).toBe(false);
    expect(E.preparedPV(c, c.retire.prepared[0]))
      .toBeCloseTo(E.growingAnnuityPV(400_000 * 12, 0.04, 0.015, 20), 6);
  });

  it("守門員只看月領：一次領的大額不受影響", () => {
    expect(E.preparedSuspect({ method: "一次領", amount: 99_000_000 })).toBe(false);
    expect(E.preparedSuspect({ method: "自提", amount: 99_000_000 })).toBe(false);
  });

  it("preparedRows 讓 UI 說得出「這一列被當成什麼在算」", () => {
    const c = rc([
      { item: "勞退", age: 65, amount: 1_000_000, method: "一次領" },
      { item: "勞保", age: 65, amount: 25_000, method: "月領" },
    ]);
    const rows = E.retireNeed(c).preparedRows;
    expect(rows[0].converted).toBe(false);
    expect(rows[1].converted).toBe(true);
    expect(rows[1].pv).toBeGreaterThan(rows[1].amount);
    expect(E.retireNeed(c).prepared).toBeCloseTo(rows[0].pv + rows[1].pv, 6);
  });

  it("growingAnnuityPV 的邊界：期數 0／金額 0 一律 0；rr≈g 走 m/(1+rr)", () => {
    expect(E.growingAnnuityPV(120_000, 0.04, 0.015, 0)).toBe(0);
    expect(E.growingAnnuityPV(0, 0.04, 0.015, 20)).toBe(0);
    expect(E.growingAnnuityPV(120_000, 0.02, 0.02, 10)).toBeCloseTo(120_000 * 10 / 1.02, 6);
  });
});

/* ══════════════ C6 members[].indepAge 財務獨立歲 ══════════════ */
describe("C6 財務獨立歲（members[].indepAge）：UI 承諾的責任遞減", () => {
  it("子女到獨立歲之後，家庭生活費那一段不再計入壽險毛需求", () => {
    const c = E.sampleCase();               // 王小寶 6 歲、indepAge 26、expRatio 15
    const nd = c.needs[0];
    nd.protectYears = 30;                   // 40→70，第 20 年起小寶滿 26
    const withIndep = E.grossLifeNeed(c, nd);
    const noIndep = (() => {
      const d = JSON.parse(JSON.stringify(c));
      d.members.forEach((m: { indepAge: unknown }) => { m.indepAge = ""; });
      return E.grossLifeNeed(d, d.needs[0]);
    })();
    expect(withIndep).toBeLessThan(noIndep);
    // 30 年裡有 10 年（第 20~29 年）少算 15% → 等效年數 30 − 10×0.15 = 28.5
    expect(E.protectYearsEff(c, nd)).toBeCloseTo(28.5, 6);
  });

  it("⚠️ 沒有人填 indepAge（或都還沒到獨立歲）＝ 等效年數就是 protectYears，既有個案一位不動", () => {
    const c = E.sampleCase();
    c.members.forEach((m: { indepAge: unknown }) => { m.indepAge = ""; });
    expect(E.protectYearsEff(c, c.needs[0])).toBe(E.n(c.needs[0].protectYears));
    for (const blank of ["", null, undefined, 0]) {
      const d = E.sampleCase();
      d.members[2].indepAge = blank;
      expect(E.indepDeps(d, "王大明").length, "indepAge=" + JSON.stringify(blank)).toBe(0);
    }
  });

  it("被保人自己不算進遞減；支出比例 0 的成員也不算（與責任遞減圖同一組條件）", () => {
    const c = E.sampleCase();
    c.members[0].indepAge = 50;             // 本人自己填了也不該影響自己的需求
    expect(E.indepDeps(c, "王大明").map((m: { name: string }) => m.name)).toEqual(["王小寶"]);
    c.members[2].expRatio = 0;
    expect(E.indepDeps(c, "王大明").length).toBe(0);
  });

  it("只作用在「家庭生活費」那一段：孝親、貸款、教育金、喪葬費完全不受影響", () => {
    const c = E.sampleCase();
    const nd = c.needs[0];
    const base = E.grossLifeNeed(c, nd);
    const famLiving = E.familyAnnualLiving(c);
    const dep = E.memberDep(c, nd.member) / 100;
    const rest = base - dep * famLiving * E.protectYearsEff(c, nd);
    // 剩下那一堆＝孝親×年數＋負債＋教育＋喪葬＋遺產稅預留＋連帶保證，與 indepAge 無關
    const d = JSON.parse(JSON.stringify(c));
    d.members.forEach((m: { indepAge: unknown }) => { m.indepAge = ""; });
    const rest2 = E.grossLifeNeed(d, d.needs[0])
      - dep * famLiving * E.protectYearsEff(d, d.needs[0]);
    expect(rest).toBeCloseTo(rest2, 6);
  });

  it("遞減比例夾在 0~1（多個子女的支出比例加起來超過 100% 也不會算成負的）", () => {
    const c = E.sampleCase();
    c.needs[0].protectYears = 5;
    c.members = [
      { name: "王大明", role: "本人", age: 40, depRatio: 100, expRatio: 40, indepAge: "" },
      { name: "甲", role: "子女", age: 30, expRatio: 80, indepAge: 20 },
      { name: "乙", role: "子女", age: 30, expRatio: 80, indepAge: 20 },
    ];
    expect(E.protectYearsEff(c, c.needs[0])).toBe(0);
  });
});

/* ══════════════ C7 legacy.feedEstate ══════════════ */
describe("C7 納入遺產稅考量（legacy.feedEstate）：報告書那句話終於是真的", () => {
  it("勾了：傳承金額進遺產稅稅基", () => {
    const c = E.sampleCase();               // heirs 2 × perHeirCash 2,000 萬 = 4,000 萬
    c.legacy.feedEstate = true;
    const es = E.estateTax(c);
    expect(es.legacyFed).toBe(E.legacyNeed(c));
    expect(es.legacyFed).toBe(40_000_000);
    expect(es.net).toBe(es.netBase + 40_000_000);
    const off = JSON.parse(JSON.stringify(c));
    off.legacy.feedEstate = false;
    expect(es.tax).toBeGreaterThan(E.estateTax(off).tax);
  });

  it("⚠️ 沒勾（含未填／false）＝完全維持改版前的算法", () => {
    for (const blank of [false, undefined, null, 0, ""]) {
      const c = E.sampleCase();
      c.legacy.feedEstate = blank;
      const es = E.estateTax(c);
      expect(es.legacyFed, "feedEstate=" + JSON.stringify(blank)).toBe(0);
      expect(es.net).toBe(es.netBase);
      expect(es.net).toBe(E.metrics(c).net);
    }
  });

  it("legacy.on===false（客戶決定這次不處理傳承）→ 就算勾了也不進稅基", () => {
    const c = E.sampleCase();
    c.legacy.feedEstate = true; c.legacy.on = false;
    expect(E.estateTax(c).legacyFed).toBe(0);
  });

  it("netOverride 的呼叫端（企業主股權試算）照樣疊得上傳承", () => {
    const c = E.sampleCase();
    c.legacy.feedEstate = true;
    expect(E.estateTax(c, 1_000_000).net).toBe(1_000_000 + E.legacyNeed(c));
    expect(E.estateTax(c, 1_000_000).netBase).toBe(1_000_000);
  });

  it("⚠️⚠️ 只做遺產稅這一段：legacyNeed 仍然沒有進 projection 的 needPV", () => {
    const c = E.sampleCase();
    const off = JSON.parse(JSON.stringify(c)); off.legacy.feedEstate = false;
    expect(E.projection(c).needPV).toBe(E.projection(off).needPV);
    expect(E.projection(c).shortPV).toBe(E.projection(off).shortPV);
  });
});

/* ══════════════ C8 policies[].paidYears ══════════════ */
describe("C8 已繳年數（policies[].paidYears）：沒有生效日時的備援", () => {
  const pol = (p: Record<string, unknown>) => ({
    name: "終身壽險", policyKind: "主約", premium: 50_000, payYears: 20, life: 3_000_000, ...p,
  });

  it("沒填生效日 → 改用已繳年數算累計已繳保費", () => {
    const c = E.sampleCase();
    c.policies = [pol({ effDate: "", paidYears: 8 })];
    const m = E.masterAnalysis(c, 2026)[0];
    expect(m.polYear).toBe(8);
    expect(m.paid).toBe(50_000 * 8);
    expect(m.ratio).toBeGreaterThan(0);
  });

  it("有生效日 → 生效日優先（可驗證的事實 > 人填的記憶）", () => {
    const c = E.sampleCase();
    c.policies = [pol({ effDate: "2020/01/01", paidYears: 99 })];
    expect(E.masterAnalysis(c, 2026)[0].polYear).toBe(E.policyYearAt(c.policies[0], 2026));
    expect(E.masterAnalysis(c, 2026)[0].polYear).toBe(7);
  });

  it("⚠️ 兩個都沒填 ＝ 維持改版前：polYear 0、已繳 0、倍數 0", () => {
    for (const blank of [undefined, "", 0, null]) {
      const c = E.sampleCase();
      c.policies = [pol({ effDate: "", paidYears: blank })];
      const m = E.masterAnalysis(c, 2026)[0];
      expect(m.polYear, "paidYears=" + JSON.stringify(blank)).toBe(0);
      expect(m.paid).toBe(0);
      expect(m.ratio).toBe(0);
    }
  });

  it("已繳年數超過繳費年期時，累計保費仍以繳費年期封頂", () => {
    const c = E.sampleCase();
    c.policies = [pol({ effDate: "", paidYears: 30, payYears: 20 })];
    expect(E.masterAnalysis(c, 2026)[0].paid).toBe(50_000 * 20);
  });
});

/* ══════════════ C9 params.freeSaving（移除）══════════════ */
describe("C9 自由儲蓄%（params.freeSaving）：整個欄位移除", () => {
  it("範本不再帶這個欄位（engine 與 html 兩邊）", () => {
    expect(E.sampleCase().params.freeSaving).toBeUndefined();
    expect(E.newCase().params.freeSaving).toBeUndefined();
    expect(HTML).not.toContain("freeSaving:1");
  });

  it("UI 的輸入框拿掉了", () => {
    expect(HTML).not.toContain("fld('freeSaving','自由儲蓄%','num')");
    expect(HTML).not.toContain("'自由儲蓄%'");   // 圖表圖例的「自由儲蓄累積」是另一件事，不受影響
  });

  it("⚠️ 舊資料殘留 params.freeSaving 也不會爆（沒有任何讀取點）", () => {
    const c = E.sampleCase();
    c.params.freeSaving = 7;
    expect(() => E.health(c)).not.toThrow();
    expect(E.health(c).grade).toBe(E.health(E.sampleCase()).grade);
  });
});

/* ══════════════ C10 savings[].start / end ══════════════ */
describe("C10 儲蓄理財投入的起訖（savings[].start / end）", () => {
  const sc = (rows: unknown[], age = 40) => {
    const c = E.sampleCase();
    c.profile.age = age;
    c.savings = rows;
    return c;
  };

  it("現齡落在起訖內才計入", () => {
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000, start: 30, end: 65 }]))).toBe(120_000);
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000, start: 45, end: 65 }]))).toBe(0);
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000, start: 30, end: 35 }]))).toBe(0);
  });

  it("⚠️ 起訖留空（0／空字串／undefined）＝ 沒有設這個界線＝全期間有效（不是 0–0）", () => {
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000 }]))).toBe(120_000);
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000, start: 0, end: 0 }]))).toBe(120_000);
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000, start: "", end: "" }]))).toBe(120_000);
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000, start: 30, end: 0 }]))).toBe(120_000);
    expect(E.savingInvest(sc([{ name: "ETF", amount: 120_000, start: 0, end: 65 }]))).toBe(120_000);
  });

  it("邊界含頭含尾（與 inSpan 同一套判斷）", () => {
    expect(E.savingInvest(sc([{ amount: 1, start: 40, end: 40 }]))).toBe(1);
    expect(E.savingInvest(sc([{ amount: 1, start: 41, end: 50 }]))).toBe(0);
  });

  it("有效儲蓄率的分子跟著改（示範案兩列都沒設起訖 → 數字不變）", () => {
    const c = E.sampleCase();
    expect(E.savingInvest(c)).toBe(180_000);
    c.savings[0].end = 35;                  // 已經結束的那一列不再計入
    expect(E.savingInvest(c)).toBe(60_000);
  });
});

/* ══════════════ C11 policies[].pAmount（2026/08/29 D2 起接上產險比對線）══════════════ */
// ⚠️ 這個 describe 原本守的是「pAmount 這一輪刻意不接，只標『僅供記錄』」。
//    D2 已經把它接進**平行於人身險的產險比對線**（propGaps），所以：
//    ・第一條斷言語意不變且更重要了——pAmount 進的是產險線，**絕不**進人身缺口與健康度。
//    ・第二條原本斷言 UI 上有「僅供記錄（產險比對開發中）」那句話；那句話已經被真的比對取代，
//      改成斷言 pAmount 確實有讀取點（propGaps 讀得到）。
describe("C11 產險保額（policies[].pAmount）：進產險比對線，不進人身缺口", () => {
  it("填了也不影響人身保障缺口／健康度（單位不同不相加）", () => {
    const c = E.sampleCase();
    const before = { gap: E.gapTotals(c), grade: E.health(c).grade, safety: E.health(c).safety };
    c.policies.forEach((p: { pAmount: number }) => { p.pAmount = 50_000_000; });
    expect(E.gapTotals(c)).toEqual(before.gap);
    expect(E.health(c).grade).toBe(before.grade);
    expect(E.health(c).safety).toBe(before.safety);
  });

  it("但它現在有讀取點了：產物保單的 pAmount 進 propGaps() 的『已備』", () => {
    const c = E.sampleCase();
    expect(E.propHave(c, "住宅火險")).toBe(0);
    c.policies.push({
      insured: "王大明", name: "住宅火險", bigCat: "產物", subtype: "住宅火險",
      status: "有效", premium: 3000, pAmount: 4_000_000,
    });
    expect(E.propHave(c, "住宅火險")).toBe(4_000_000);
  });
});

/* ══════════════ UI 有沒有把話講清楚 ══════════════ */
describe("畫面上要說得清楚（教練看得懂每一個欄位在做什麼）", () => {
  it("C1：可刪減% 的提示要寫明「留空 ＝ 沒有設上限」", () => {
    expect(HTML).toContain("<b>留空或 0 ＝ 沒有設上限</b>");
    expect(HTML).toContain("實際砍幅 ＝ min(槓桿%, 本列可刪減%)");
  });

  it("C2：需求卡有長照總需求的換算佐證，而且說明它不與一次性給付相加", () => {
    expect(HTML).toContain("function careConvHint(c,nd)");
    expect(HTML).toContain("<b>長照總需求換算</b>");
    expect(HTML).toContain("刻意不與壽險等「一次性給付」相加");
  });

  it("C3：攤還方式與寬限期在進階欄有逐項說明", () => {
    expect(HTML).toContain("<b>只付利息</b>：每期只繳息、本金一毛不減");
    expect(HTML).toContain("<b>暫緩還款</b>：本息都不付，<b>利息滾入本金</b>");
    expect(HTML).toContain("寬限期留空或 0 ＝ 沒有寬限期");
  });

  it("C3：剩餘月數 0 的貸款要當場說明「為什麼年應付本息是 0」", () => {
    // 庫內那 5 筆特殊攤還的貸款全部沒填剩餘月數 → 引擎視為已結清、現金流 0。
    // 那不是算錯，是資料沒填完；畫面一定要講出來，不然教練只看到一個莫名其妙的 0。
    expect(HTML).toContain("function liaHowHTML(l,md,g,yr,a0)");
    expect(HTML).toContain("<b>剩餘月數 0</b> → 視為已結清，年應付本息記 0");
    expect(HTML).toContain("<b>剩餘月數是 0</b>");
  });

  it("C4：資產的被動現金流來源要說清楚是走 income 還是 ret", () => {
    expect(HTML).toContain("沒填被動現金流 \\u2192 改用<b>報酬率</b>推算");
    expect(HTML).toContain("兩欄都沒填 \\u2192 這筆資產不產生任何被動現金流");
  });

  it("C5：已備退休金逐列說明 ＋ 守門員的警語 ＋「確認為月額」欄位", () => {
    expect(HTML).toContain("function preparedConvHTML(c)");
    expect(HTML).toContain("['method','方式','sel:一次領,月領,自提'],['monthlyOk','確認為月額','bool']");
    expect(HTML).toContain("preparedConv:function(c){return preparedConvHTML(c);}");
    expect(HTML).toContain("<b>暫不換算，仍以 '+fmt(p.pv)+' 元計入</b>");
  });

  it("C6：財務獨立歲的提示要說明遞減的是哪一段", () => {
    expect(HTML).toContain("其「支出比例 '+n(m.expRatio)+'%」的份額會自動從壽險保障需求中移除");
    expect(HTML).toContain("<b>「家庭年生活費 × 保障年數」</b>");
  });

  it("C7：遺產稅明細會把傳承那一列印出來", () => {
    expect(HTML).toContain("＋ 傳承金額（繼承人數 × 每人現金傳承，已納入考量）");
    expect(HTML).toContain("['家庭淨值(資產−負債)',es.netBase]");
  });

  it("C8：沒填生效日時要告訴教練備援用的是已繳年數", () => {
    expect(HTML).toContain("主約效益分析改用<b>已繳年數");
    expect(HTML).toContain("生效日與已繳年數都沒填");
  });

  it("C10：儲蓄表要寫明「留空 ＝ 沒有設這個界線」", () => {
    expect(HTML).toContain("<b>留空或 0 ＝ 沒有設這個界線</b>（不是 0 歲）");
  });
});

/* ══════════════ 真的跑起來的畫面（不是只比字串）══════════════ */
describe("在真實 DOM 上驗（JSDOM 把 lantu-app.html 跑起來）", () => {
  const paneOf = (tab: string) => {
    w.app.activeTab = "data"; w.app.dataTab = tab; w.render();
    return w.document.querySelector("#app").innerHTML as string;
  };

  it("C5：退休分頁看得到「月領 → 換算總額」與守門員警語", () => {
    const c = w.activeCase();
    c.profile.retireAge = 65; c.profile.lifeExp = 85;
    c.retire.prepared = [
      { item: "勞保老年年金", age: 65, amount: 25_000, method: "月領" },
      { item: "勞退新制", age: 65, amount: 3_600_000, method: "月領" },
      { item: "自提專戶", age: 65, amount: 1_000_000, method: "自提" },
    ];
    const h = paneOf("retire");
    expect(h).toContain("已備退休金：每一列被當成什麼在算");
    expect(h).toContain("月領 25,000 元/月 × 12");
    expect(h).toContain("暫不換算");
    expect(h).toContain("當一次領");
  });

  it("C1：支出列展開進階欄，可刪減% 旁邊有保護線說明", () => {
    const c = w.activeCase();
    c.expenses = [{ name: "生活費用", cat: "生活", amount: 720_000, cut: 10, start: 0, end: 0 }];
    w.finOpenMap("expenses")[0] = true;
    const h = paneOf("finance");
    expect(h).toContain("這一列的<b>保護線</b>已設 10%");
    expect(h).toContain("就算槓桿拉到 30% 也一樣");
  });

  it("C4：資產列展開進階欄，說得出被動現金流是怎麼算出來的", () => {
    const c = w.activeCase();
    c.assets = [{ name: "活存", owner: "王大明", type: "現金", cls: "流動", value: 2_000_000, fxRate: 1, ret: 0.5, income: 0 }];
    w.finOpenMap("assets")[0] = true;
    const h = paneOf("finance");
    expect(h).toContain("改用<b>報酬率</b>推算");
    expect(h).toContain("2,000,000");
    expect(h).toContain("10,000 元/年");
  });
});
