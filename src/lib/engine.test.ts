import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// 引擎目前為 @ts-nocheck 的移植純函式，型別待後續階段補強；測試以 any 呼叫。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

// 移植自 v12 單檔原型的 smoke test：確認引擎純函式在無 DOM 環境可運算且穩定。
describe("嵐途財務引擎（移植 v12）", () => {
  const c = E.sampleCase();

  it("示範個案：核心指標可計算", () => {
    const m = E.metrics(c);
    const h = E.health(c);
    const r = E.ratios(c);
    expect(m.net).toBeGreaterThan(0);
    expect(["A", "B", "C", "D"]).toContain(h.grade);
    expect(Object.keys(r).length).toBe(11);
  });

  it("退休 / 教育 / 稅務引擎回傳數值", () => {
    expect(E.retireNeed(c).total).toBeGreaterThan(0);
    expect(E.eduTotal(c)).toBeGreaterThan(0);
    expect(E.incomeTax(c).tax).toBeGreaterThanOrEqual(0);
    expect(E.estateTax(c).tax).toBeGreaterThanOrEqual(0);
  });

  it("蒙地卡羅：機率介於 0–1 且固定種子可重現", () => {
    const a = E.monteCarlo(c, 400);
    const b = E.monteCarlo(c, 400);
    expect(a.pSuccess).toBeGreaterThanOrEqual(0);
    expect(a.pSuccess).toBeLessThanOrEqual(1);
    expect(a.finalP50).toBe(b.finalP50); // 決定性
    expect(a.finalP10).toBeLessThanOrEqual(a.finalP90);
  });

  it("投資風險屬性 KYC：全答完得屬性、未答完為 null", () => {
    const rp = E.riskProfile(c);
    expect(rp).not.toBeNull();
    expect(["保守型", "穩健型", "積極型", "進取型"]).toContain(rp.tier.name);

    const partial = E.sampleCase();
    partial.riskQuiz = { ans: { 0: 1 } };
    expect(E.riskProfile(partial)).toBeNull();
  });

  it("空白個案不炸（newCase）", () => {
    const nc = E.newCase();
    expect(nc.id).toBeTruthy();
    expect(() => E.metrics(nc)).not.toThrow();
    expect(() => E.health(nc)).not.toThrow();
    expect(() => E.projection(nc)).not.toThrow();
  });
});
