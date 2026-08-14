import { describe, it, expect } from "vitest";
import { fv, pmt, computePassport, emptyPassport } from "./passport";

describe("人生護照 能力分析引擎", () => {
  it("fv：月存 30,000、120 期、3% → 約 419 萬（對得上原版）", () => {
    expect(fv(30000, 120, 3)).toBeGreaterThan(4_150_000);
    expect(fv(30000, 120, 3)).toBeLessThan(4_230_000);
  });

  it("fv：0 報酬＝本金加總", () => {
    expect(fv(10000, 60, 0)).toBe(600_000);
  });

  it("pmt：本息均攤為正、且高於純息", () => {
    const p = pmt(9_780_000, 2, 204);
    expect(p).toBeGreaterThan(9_780_000 * 0.02 / 12);
  });

  it("購屋：房價＝自備款÷(1−貸款成數)，預設約 1,397 萬", () => {
    const m = computePassport(emptyPassport());
    expect(m.house.down).toBeGreaterThan(4_150_000);
    expect(m.house.price).toBeCloseTo(m.house.down / (1 - 0.7), -4);
    expect(Math.round(m.house.price / 10000)).toBeGreaterThan(1_300);
    expect(Math.round(m.house.price / 10000)).toBeLessThan(1_450);
  });

  it("退休：三柱加總＝總月領，且為正", () => {
    const m = computePassport(emptyPassport());
    const sum = m.retire.selfMonthly + m.retire.laborPensionMonthly + m.retire.laborInsMonthly;
    expect(m.retire.totalMonthly).toBeCloseTo(sum, 3);
    expect(m.retire.totalMonthly).toBeGreaterThan(0);
    expect(m.retire.presentMonthly).toBeLessThan(m.retire.totalMonthly);
  });

  it("扶養：可扶養位數 = 出生時存款 ÷ 每位總花費", () => {
    const m = computePassport(emptyPassport());
    expect(m.support.kids).toBeCloseTo(m.support.savedAtBirth / m.support.perChildCost, 4);
    expect(m.support.perChildCost).toBeGreaterThan(0);
  });

  it("每月應存合計＝五面向月存加總（預設 6.5 萬）", () => {
    const m = computePassport(emptyPassport());
    expect(m.totalMonthlyWan).toBeCloseTo(6.5, 5);
  });

  it("月存越多 → 可購房價越高", () => {
    const base = emptyPassport();
    const more = emptyPassport();
    more.house.monthly = 6;
    expect(computePassport(more).house.price).toBeGreaterThan(computePassport(base).house.price);
  });
});
