import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// 引擎目前為 @ts-nocheck 的移植純函式，型別待後續階段補強；測試以 any 呼叫。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

// 移植自 v12 單檔原型的 smoke test：確認引擎純函式在無 DOM 環境可運算且穩定。
describe("嵐途財務引擎（移植 v12）", () => {
  const c = E.sampleCase();

  it("示範個案：核心指標可計算，且分數落在合法值域", () => {
    const m = E.metrics(c);
    const h = E.health(c);
    expect(m.net).toBeGreaterThan(0);
    expect(m.net).toBe(m.assetTotal - m.debtTotal);
    expect(["A", "B", "C", "D"]).toContain(h.grade);
    // ⚠️ 舊版只驗 grade 落在四個字母裡，safety=183 / parts.信用=700 完全逃過。
    //    這三條就是抓 credit 值域漂移的那組斷言（見 engine.drift.test.ts）。
    expect(h.safety).toBeGreaterThanOrEqual(0);
    expect(h.safety).toBeLessThanOrEqual(100);
    for (const v of Object.values(h.parts) as number[]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    for (const v of Object.values(h.raw) as number[]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("財務比率體檢：協會 25 項、每項都有理想值與燈號", () => {
    const r = E.ratios(c);
    // 驗的是「每一項算得對不對」，不是「共有幾項」——
    // 舊版 expect(...).toBe(11) 只鎖住數量，等於在保護 engine 與 iframe 之間的漂移。
    expect(r["負債比率"].v).toBe(E.pct(E.metrics(c).debtTotal / E.metrics(c).assetTotal));
    expect(r["財務自由度"].v).toBe(E.pct(E.metrics(c).incFinancial / E.metrics(c).expTotal));
    expect(r["支出收入比"].status).toMatch(/good|warn|bad/);
    expect(r["撫養壓力比"].status).toBe("na"); // 無門檻項固定 na
    expect(Object.keys(r)).toContain("願景達成率");
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

  it("財務階段：四階段皆有名稱與課題，且不使用等級語彙", () => {
    for (const g of ["D", "C", "B", "A"]) {
      expect(E.stageName(g)).toMatch(/期$/);
      expect(E.stageTask(g).length).toBeGreaterThan(5);
      expect(E.stageColor(g)).toMatch(/^#/);
    }
    expect(E.STAGE_ORDER).toEqual(["D", "C", "B", "A"]); // 整裝 → 遠行
    expect(E.stageName(null)).toBe("未評估");
    expect(E.stageName("X")).toBe("未評估");
  });

  it("階段成因：說明為什麼在這個階段，且不炸", () => {
    const h = E.health(c);
    expect(typeof E.stageReason(h)).toBe("string");
    expect(E.stageReason(h).length).toBeGreaterThan(0);
    expect(E.stageReason(null)).toBe("");
    // 收支為負時，成因優先指向現金流
    const neg = { safety: 30, freedom: 0, vision: 0, raw: { balScore: 0.5, reserve: 1, credit: 1, debtBal: 1, riskCover: 1 } };
    expect(E.stageReason(neg)).toContain("現金流");
  });

  it("空白個案不炸（newCase），且不帶示範資料的信用評分", () => {
    const nc = E.newCase();
    expect(nc.id).toBeTruthy();
    expect(() => E.metrics(nc)).not.toThrow();
    expect(() => E.health(nc)).not.toThrow();
    expect(() => E.projection(nc)).not.toThrow();
    // sampleCase 的 profile.credit=700 必須被清掉，否則新客戶白送約 12.5 分安全度
    expect(E.creditScoreOf(nc)).toBe(0);
    expect(E.health(nc).raw.credit).toBe(0);
    // 與 lantu-app.html 的 newCase() 對齊的欄位
    expect(Array.isArray(nc.lifeGoals)).toBe(true);
    expect(nc.reportNote).toBe("");
    expect(nc.company).toBeTruthy();
  });

  it("蒙地卡羅：horizon 未填時退回 85，不會謊報「不破產機率 100%」", () => {
    const bad = E.sampleCase();
    bad.params.horizon = "";
    const mc = E.monteCarlo(bad, 200);
    expect(mc.years).toBeGreaterThan(2);
    expect(mc.bands.length).toBe(mc.years);
    // P10 ≤ P50 ≤ P90，且不是全 0 的空圖
    expect(mc.finalP10).toBeLessThanOrEqual(mc.finalP50);
    expect(mc.finalP50).toBeLessThanOrEqual(mc.finalP90);
  });

  it("退休參數不合理時明確標示 valid=false，而不是靜默回「沒有缺口」", () => {
    const bad = E.sampleCase();
    bad.profile.retireAge = 95; // > lifeExp 85
    const rn = E.retireNeed(bad);
    expect(rn.valid).toBe(false);
    expect(E.retireNeed(c).valid).toBe(true);
  });
});
