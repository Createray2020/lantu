import { describe, it, expect } from "vitest";
import { computeMonthly, emptyPassport, type PassportInputs } from "./passport";

describe("人生護照 computeMonthly", () => {
  it("空白護照 → 全部 0", () => {
    const m = computeMonthly(emptyPassport());
    expect(m.total).toBe(0);
    expect(m.house).toBe(0);
    expect(m.retire).toBe(0);
  });

  it("旅遊：每年 120000 → 每月 10000（攤 12）", () => {
    const p = emptyPassport();
    p.travel = { annualBudget: 120000, years: 20 };
    expect(computeMonthly(p).travel).toBeCloseTo(10000, 0);
  });

  it("購房：房價 1000 萬、貸 7 成、5 年 → 頭期 300 萬、月存約 4~5 萬", () => {
    const p = emptyPassport();
    p.house = { price: 10_000_000, loanRatio: 70, years: 5 };
    const m = computeMonthly(p);
    expect(m.meta.houseDown).toBeCloseTo(3_000_000, 0);
    expect(m.house).toBeGreaterThan(40_000);
    expect(m.house).toBeLessThan(50_000);
  });

  it("退休：有月生活費 → 有退休金總需求與每月應存", () => {
    const p = emptyPassport();
    p.retire = { age: 35, retireAge: 65, monthLiving: 50_000, prepared: 0 };
    const m = computeMonthly(p);
    expect(m.meta.retireCorpus).toBeGreaterThan(0);
    expect(m.retire).toBeGreaterThan(0);
  });

  it("已備退休金越多 → 每月應存越少", () => {
    const base: PassportInputs = { ...emptyPassport(), retire: { age: 35, retireAge: 65, monthLiving: 50_000, prepared: 0 } };
    const withPrep: PassportInputs = { ...base, retire: { ...base.retire, prepared: 5_000_000 } };
    expect(computeMonthly(withPrep).retire).toBeLessThan(computeMonthly(base).retire);
  });

  it("合計＝五面向相加", () => {
    const p = emptyPassport();
    p.house = { price: 8_000_000, loanRatio: 80, years: 6 };
    p.travel = { annualBudget: 60_000, years: 10 };
    const m = computeMonthly(p);
    expect(m.total).toBeCloseTo(m.house + m.car + m.retire + m.support + m.travel, 3);
  });
});
