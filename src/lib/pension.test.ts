import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";
import {
  yearsSinceYm,
  LABOR_ANNUITY_MIN_YEARS,
  LABOR_INS_ANNUITY_RATE,
  LABOR_INS_ANNUITY_RATE_A,
  LABOR_INS_ANNUITY_BONUS_A,
  LABOR_PENSION_FUND_RATE,
  LABOR_PENSION_RATE,
} from "./taiwan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 勞保年資 / 勞退專戶（2026/08）。
 *
 * 改版前的三個缺陷：
 *  1. member.worked（已投保年資）**沒有任何輸入欄位**，永遠是 0 → 只算「從現在到退休」那一段，
 *     四十歲、已投保十五年的客戶，勞保年金被砍掉將近四成。
 *  2. 勞保只算 B 式 1.55%，沒有 A 式擇優 → 年資短的人被系統性低估。
 *  3. 沒有「保險年資滿 15 年才能請領老年年金」的門檻 → 年資 8 年的客戶被算出一筆領不到的月退俸。
 *  4. 勞退用 years(過去+未來) 當未來提繳的複利期數 → 一旦有了年資資料就會嚴重高估。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function caseWith(over: Record<string, any> = {}) {
  const c = E.sampleCase();
  c.profile.age = over.age ?? 40;
  c.profile.retireAge = over.retireAge ?? 65;
  c.profile.lifeExp = over.lifeExp ?? 85;
  const pm = c.members[0];
  pm.insType = over.insType ?? "勞保";
  pm.insSalary = over.insSalary ?? 45800;
  pm.worked = over.worked ?? 0;
  pm.insStart = over.insStart ?? "";
  pm.pensionStart = over.pensionStart ?? "";
  pm.pensionYears = over.pensionYears ?? 0;
  pm.pensionBalance = over.pensionBalance ?? 0;
  pm.monthlySalary = over.monthlySalary ?? 100000;
  return c;
}

describe("yearsSinceYm：起保年月 → 已投保年資", () => {
  const asOf = new Date("2026-08-20T00:00:00Z");

  it("整年與跨月都算得出來（取到小數一位）", () => {
    expect(yearsSinceYm("2016-08", asOf)).toBe(10);
    expect(yearsSinceYm("2011-03", asOf)).toBeCloseTo(15.4, 1);
    expect(yearsSinceYm("2026-02", asOf)).toBeCloseTo(0.5, 1);
  });

  it("空值、格式錯、未來日期一律回 0（年資寧可少算，不要憑空生出來）", () => {
    expect(yearsSinceYm("", asOf)).toBe(0);
    expect(yearsSinceYm(null, asOf)).toBe(0);
    expect(yearsSinceYm("2016/08", asOf)).toBe(0);
    expect(yearsSinceYm("2016-13", asOf)).toBe(0);
    expect(yearsSinceYm("2030-01", asOf)).toBe(0);
    expect(yearsSinceYm("2026-08", asOf)).toBe(0);
  });
});

describe("保險年資 = 已投保（過去）+ 到退休（未來）", () => {
  it("有填已投保年資才算得進去；沒填就只有未來那一段", () => {
    const none = E.estimateSocialPension(caseWith({ worked: 0 }));
    expect(none.past).toBe(0);
    expect(none.future).toBe(25);
    expect(none.years).toBe(25);

    const withPast = E.estimateSocialPension(caseWith({ worked: 15 }));
    expect(withPast.past).toBe(15);
    expect(withPast.years).toBe(40);
  });

  it("沒填年資但有填起保年月時，用起保年月推算", () => {
    const r = E.estimateSocialPension(caseWith({ worked: 0, insStart: "2016-01" }));
    expect(r.past).toBeGreaterThan(9);
    expect(r.years).toBeGreaterThan(34);
  });

  it("手填的年資優先於起保年月（中斷投保過的人以實填為準）", () => {
    const r = E.estimateSocialPension(caseWith({ worked: 8, insStart: "2001-01" }));
    expect(r.past).toBe(8);
  });

  it("漏掉已投保年資會讓勞保年金低估——這正是改版前的行為", () => {
    const before = E.estimateSocialPension(caseWith({ worked: 0 }));
    const after = E.estimateSocialPension(caseWith({ worked: 15 }));
    expect(after.monthly).toBeGreaterThan(before.monthly);
    expect(before.monthly / after.monthly).toBeLessThan(0.7); // 少算超過三成
  });
});

describe("勞保老年年金：A / B 式擇優", () => {
  it("年資長：B 式勝出", () => {
    const r = E.estimateSocialPension(caseWith({ worked: 15, insSalary: 45800 }));
    expect(r.years).toBe(40);
    expect(r.insB).toBeCloseTo(45800 * 40 * LABOR_INS_ANNUITY_RATE, 4);
    expect(r.insA).toBeCloseTo(45800 * 40 * LABOR_INS_ANNUITY_RATE_A + LABOR_INS_ANNUITY_BONUS_A, 4);
    expect(r.pick).toBe("B");
    expect(r.monthly).toBe(Math.max(r.insA, r.insB));
  });

  it("投保薪資低（部分工時級距，投保薪資可手填）：A 式勝出", () => {
    // A > B 的條件是 投保薪資 × 年資 < 3000 / (1.55% − 0.775%) ≒ 387,097。
    // 投保薪資 11,100（部分工時級距，UI 允許手填）、年資 20 年 → 222,000，A 式勝。
    const r = E.estimateSocialPension(
      caseWith({ age: 45, retireAge: 65, worked: 0, insSalary: 11100 }),
    );
    expect(r.years).toBe(20);
    expect(r.pick).toBe("A");
    expect(r.monthly).toBeCloseTo(11100 * 20 * LABOR_INS_ANNUITY_RATE_A + LABOR_INS_ANNUITY_BONUS_A, 4);
    expect(r.monthly).toBeGreaterThan(11100 * 20 * LABOR_INS_ANNUITY_RATE);
  });

  it("投保薪資落在正常分級表（≥29,500）且年資已滿 15 年時，B 式一定勝出", () => {
    // 記錄這個事實，免得日後有人以為 A 式壞掉了：
    // 29,500 × 15 = 442,500 已經超過 387,097 的交叉點，所以正常受僱者一律走 B 式。
    for (const years of [15, 20, 30, 40]) {
      const r = E.estimateSocialPension(
        caseWith({ age: 65 - years, retireAge: 65, worked: 0, insSalary: 29500 }),
      );
      expect(r.years, String(years)).toBe(years);
      expect(r.pick, String(years)).toBe("B");
    }
  });
});

describe("保險年資未滿 15 年：只能請領老年一次金，不能月領", () => {
  it("年資 8 年 → 沒有月領年金，改成一次金（每滿 1 年給 1 個月）", () => {
    const r = E.estimateSocialPension(caseWith({ age: 57, retireAge: 65, worked: 0, insSalary: 40100 }));
    expect(r.years).toBe(8);
    expect(r.years).toBeLessThan(LABOR_ANNUITY_MIN_YEARS);
    expect(r.eligible).toBe(false);
    expect(r.monthly).toBe(0);
    expect(r.onceMonths).toBe(8);
    expect(r.lump).toBe(40100 * 8);
  });

  it("剛好滿 15 年就能月領", () => {
    const r = E.estimateSocialPension(caseWith({ age: 50, retireAge: 65, worked: 0 }));
    expect(r.years).toBe(15);
    expect(r.eligible).toBe(true);
    expect(r.monthly).toBeGreaterThan(0);
  });

  it("國民年金沒有 15 年門檻（勞保才有）", () => {
    const r = E.estimateSocialPension(
      caseWith({ age: 57, retireAge: 65, insType: "國民年金", insSalary: 21103 }),
    );
    expect(r.eligible).toBe(true);
    expect(r.monthly).toBeGreaterThan(0);
  });
});

describe("勞退新制：專戶現有累積滾存 + 未來提繳", () => {
  const contrib = () => {
    const r = E.estimateSocialPension(caseWith({}));
    return r.pensionBase * LABOR_PENSION_RATE * 12;
  };

  it("未來提繳只複利「未來年數」，不複利過去的年資（改版前的高估點）", () => {
    const r = E.estimateSocialPension(caseWith({ worked: 15 }));
    const g = LABOR_PENSION_FUND_RATE;
    const expected = (contrib() * (Math.pow(1 + g, 25) - 1)) / g;   // future = 25，不是 years = 40
    expect(r.future).toBe(25);
    expect(r.fundNew).toBeCloseTo(expected, 0);
  });

  it("填了專戶餘額就照實滾存到退休", () => {
    const r = E.estimateSocialPension(caseWith({ pensionBalance: 800000 }));
    expect(r.fundEstimated).toBe(false);
    expect(r.fundNow).toBeCloseTo(800000 * Math.pow(1 + LABOR_PENSION_FUND_RATE, 25), 0);
    expect(r.fund).toBeCloseTo(r.fundNow + r.fundNew, 6);
  });

  it("沒填餘額但有提繳起始年月 → 回推概估，並標記為概估值", () => {
    const r = E.estimateSocialPension(caseWith({ pensionYears: 10 }));
    expect(r.fundEstimated).toBe(true);
    expect(r.pensionPast).toBe(10);
    expect(r.fundNow).toBeGreaterThan(0);
  });

  it("兩者都沒填 → 專戶餘額當 0，只算未來提繳（不亂猜）", () => {
    const r = E.estimateSocialPension(caseWith({}));
    expect(r.fundEstimated).toBe(false);
    expect(r.fundNow).toBe(0);
    expect(r.fund).toBeCloseTo(r.fundNew, 6);
  });

  it("國民年金沒有雇主提繳，永遠沒有勞退", () => {
    const r = E.estimateSocialPension(caseWith({ insType: "國民年金", pensionBalance: 500000 }));
    expect(r.fund).toBe(0);
  });

  it("勞退提繳工資走的是另一張表（上限 15 萬），不是勞保的 45,800", () => {
    const r = E.estimateSocialPension(caseWith({ monthlySalary: 100000 }));
    expect(r.pensionBase).toBe(100000);
    expect(r.ins).toBe(45800);
  });
});
