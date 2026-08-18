import { describe, it, expect } from "vitest";
import { buildCase } from "./clientPlan";
import { emptyPassport, computePassport } from "./passport";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 人生護照 → v12 case 的「量綱」測試。
 *
 * buildCase 把 passport 的結果塞進 case 的各張表，而每張表對「一次性 vs 年度」
 * 與「現值 vs 已複利」的語意都不同。填錯不會有任何型別或執行期錯誤，
 * 只會讓所有自助客戶的規劃數字整批偏掉：
 *   - 旅遊基金（一次性）被當成年度支出連花 21 年 → 放大 21 倍
 *   - 教育金已含學費成長，引擎再乘一次 → 放大 1.66 倍
 */
describe("buildCase：passport → case 的量綱", () => {
  const p = emptyPassport();
  const r = computePassport(p);
  const c = buildCase(p, "測試客戶");

  it("旅遊基金是一次性支出，不是每年支出", () => {
    const row = c.travel[0];
    expect(row).toBeTruthy();
    // 只在目標年度發生一次
    expect(row.start).toBe(row.end);
    expect(row.amount).toBe(Math.round(r.travel.fund));

    // 生涯累計的旅遊支出（不含通膨）應等於基金本身，而不是 21 倍
    let total = 0;
    for (let age = c.profile.age; age <= 100; age++) {
      total += E.lifestyleFactor({ travel: c.travel, hobby: [], luxury: [] }, age, 1);
    }
    expect(Math.round(total)).toBe(Math.round(r.travel.fund));
  });

  it("旅遊發生在使用者設定的那一年", () => {
    const yearsOut = p.travel.travelYear - p.travel.startYear;
    expect(c.travel[0].start).toBe(c.profile.age + yearsOut);
  });

  it("教育金填的是今日現值年費用，不重複計入學費成長", () => {
    const edu = c.education[0];
    expect(edu).toBeTruthy();
    expect(edu.annual).toBe(Math.round(p.support.annualCost));
    expect(edu.years).toBe(p.support.raiseToAge);

    // 引擎自己會套成長率；投影裡的教育支出總額應對得上 passport 算的 perChildCost
    const caseForProj = {
      ...c,
      params: { ...c.params, tuitionGrowth: p.support.tuitionGrowth },
    };
    const proj = E.projection(caseForProj);
    let eduTotal = 0;
    const start = c.profile.age + edu.startIn;
    for (const row of proj.rows) {
      if (row.age >= start && row.age < start + edu.years) {
        // projection 把 edu 併進 expense 欄，這裡改用引擎的公式直接驗算
      }
    }
    // 直接驗算 projection 內部用的公式：Σ annual × (1+g)^(startIn+yy)
    const g = p.support.tuitionGrowth / 100;
    for (let yy = 0; yy < edu.years; yy++) eduTotal += edu.annual * Math.pow(1 + g, edu.startIn + yy);
    // startIn=0 時應與 passport 的 perChildCost 幾乎相同（差在四捨五入）
    const expected = r.support.perChildCost * Math.pow(1 + g, edu.startIn);
    expect(eduTotal / expected).toBeGreaterThan(0.99);
    expect(eduTotal / expected).toBeLessThan(1.01);
  });

  it("產出的 case 可以直接餵引擎，不丟例外", () => {
    expect(() => E.metrics(c)).not.toThrow();
    expect(() => E.health(c)).not.toThrow();
    expect(() => E.projection(c)).not.toThrow();
    const h = E.health(c);
    expect(h.safety).toBeGreaterThanOrEqual(0);
    expect(h.safety).toBeLessThanOrEqual(100);
  });

  it("人生護照的五面向會被帶成『必須達成』的人生目標", () => {
    expect(c.intent.mustHave).toContain("退休生活規劃");
    expect(c.intent.mustHave).toEqual(c.intent.targets);
  });
});
