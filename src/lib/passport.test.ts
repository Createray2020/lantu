import { describe, it, expect } from "vitest";
import { fv, pmt, computePassport, emptyPassport, passportBaseYear, currentPassportYear, rollPassportForward, BASE_YEAR } from "./passport";

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

/**
 * 「現在是哪一年」的三層：存在護照裡的 baseYear → 舊資料 fallback 到 BASE_YEAR
 * → 新建護照時由伺服器用 currentPassportYear() 蓋章。
 * ⚠️ BASE_YEAR **不是**「今年」，是舊資料的 fallback，永遠停在 2026，不要每年改它。
 */
describe("passportBaseYear / currentPassportYear", () => {
  it("護照有 baseYear 就用它", () => {
    expect(passportBaseYear({ baseYear: 2031 })).toBe(2031);
    expect(passportBaseYear(emptyPassport(2029))).toBe(2029);
  });

  it("舊資料（沒有 baseYear）、壞值、null 一律 fallback 到 BASE_YEAR", () => {
    expect(passportBaseYear({})).toBe(BASE_YEAR);
    expect(passportBaseYear(null)).toBe(BASE_YEAR);
    expect(passportBaseYear(undefined)).toBe(BASE_YEAR);
    expect(passportBaseYear({ baseYear: NaN })).toBe(BASE_YEAR);
    expect(passportBaseYear({ baseYear: 0 })).toBe(BASE_YEAR);
    expect(passportBaseYear({ baseYear: 99999 })).toBe(BASE_YEAR);
  });

  it("currentPassportYear 走台北時區——跨年那一刻不能差一年", () => {
    // 2026-12-31 16:00 UTC ＝ 台北 2027-01-01 00:00
    const t = new Date("2026-12-31T16:00:00Z");
    expect(currentPassportYear(t)).toBe(2027);
    expect(currentPassportYear(t, "UTC")).toBe(2026);
    expect(currentPassportYear(new Date("2026-08-26T03:00:00Z"))).toBe(2026);
  });

  it("BASE_YEAR 是舊資料的 fallback，不是今年——它不該跟著時鐘走", () => {
    expect(BASE_YEAR).toBe(2026);
  });
});

describe("rollPassportForward：年份與年齡一起走", () => {
  const p = emptyPassport(2026);

  it("推一年 → baseYear +1、目前年齡 +1，其餘一字不動", () => {
    const r = rollPassportForward(p, 2027);
    expect(r.baseYear).toBe(2027);
    expect(r.retire.curAge).toBe(p.retire.curAge + 1);
    // 目標年份與月存入起始年都是西元年，不該被動到
    expect(r.house).toEqual(p.house);
    expect(r.car).toEqual(p.car);
    expect(r.travel).toEqual(p.travel);
    expect(r.support).toEqual(p.support);
    expect(r.retire.retireAge).toBe(p.retire.retireAge);
  });

  it("不倒退：目標年份不比現在的 baseYear 新就原樣回傳", () => {
    expect(rollPassportForward(p, 2026)).toBe(p);
    expect(rollPassportForward(p, 2020)).toBe(p);
  });

  it("年齡有上限，不會被推到 100 以上", () => {
    const old = { ...p, retire: { ...p.retire, curAge: 98 } };
    expect(rollPassportForward(old, 2036).retire.curAge).toBe(100);
  });

  it("舊護照（沒有 baseYear）從 BASE_YEAR 起算", () => {
    const legacy = { ...p } as Record<string, unknown>;
    delete legacy.baseYear;
    const r = rollPassportForward(legacy as typeof p, BASE_YEAR + 2);
    expect(r.retire.curAge).toBe(p.retire.curAge + 2);
  });
});
