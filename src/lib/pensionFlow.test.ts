import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 2026/10/16 Ray 拍板：已備退休金（retire.prepared）進全生涯財務流。
 * 之前只進 retireNeed() 的退休缺口，projection() 退休後收入永遠 0，延後退休也不會讓年金變多。
 */
function mk() {
  const c = E.sampleCase();
  c.profile.age = 40; c.profile.retireAge = 65; c.profile.lifeExp = 85;
  c.params.horizon = 85;
  c.retire.retireInflation = 2;
  c.members = [{ name: "王大明", role: "本人", age: 40, insType: "勞保", insSalary: 45800, monthlySalary: 80000, worked: 15, expRatio: 100 }];
  c.retire.prepared = [];
  return c;
}
const row = (p: any, age: number) => p.rows.find((r: any) => r.age === age);

describe("已備退休金進投影", () => {
  it("兩邊都接了 pensionSchedule／pensionAt（projection 與 monteCarlo 各一處）", () => {
    for (const s of [
      "var pen=pensionAt(penS,age);otherIncome+=pen.inc;",
      "var inflowY=yearInflow(mats,age)+yearInflow(fIn,age)+pen.lump;",
      "inflow:inflowY,pension:pen.inc,penLump:pen.lump});",
      "var penMC=pensionSchedule(c);",
      "inflowAt[ia]=yearInflow(matsMC,ia)+yearInflow(fInMC,ia)+pensionAt(penMC,ia).lump;",
      "inSpan(i,age))?n(i.amount):0})+pensionAt(penMC,age).inc;",
    ]) expect(HTML).toContain(s);
    const ENGINE = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
    for (const s of ["var pen=pensionAt(penS,age);otherIncome+=pen.inc;", "pensionAt(penMC,ia).lump;"]) expect(ENGINE).toContain(s);
  });

  it("沒有已備退休金 → 數字一位不動（schedule 空、pensionAt 全 0）", () => {
    const c = mk();
    expect(E.pensionSchedule(c)).toEqual([]);
    expect(E.pensionAt([], 70)).toEqual({ inc: 0, lump: 0 });
    const p = E.projection(c);
    expect(row(p, 70).pension).toBe(0);
    expect(row(p, 65).penLump).toBe(0);
  });

  it("一次領：起領那年進存量（inflow）、插入帳旗；不進年金收入", () => {
    const c = mk();
    c.retire.prepared = [{ item: "勞退", age: 65, amount: 3000000, method: "一次領" }];
    const p = E.projection(c);
    expect(row(p, 65).penLump).toBe(3000000);
    expect(row(p, 65).inflow).toBe(3000000);
    expect(row(p, 66).penLump).toBe(0);
    expect(row(p, 70).pension).toBe(0);
    const flag = p.events.find((e: any) => e.kind === "inflow" && e.name === "勞退");
    expect(flag).toBeTruthy();
    expect(flag.age).toBe(65);
    // 存量比沒有這筆時多 300 萬（當年）
    const c0 = mk(); const p0 = E.projection(c0);
    expect(row(p, 65).invest - row(p0, 65).invest).toBeCloseTo(3000000, 0);
  });

  it("月領：退休歲的下一年起逐年 amount×12、以退休通膨成長；起領歲早於退休歲從退休歲起算", () => {
    const c = mk();
    c.retire.prepared = [{ item: "商業年金", age: 60, amount: 20000, method: "月領" }];
    const p = E.projection(c);
    expect(row(p, 65).pension).toBe(0);
    expect(row(p, 66).pension).toBeCloseTo(240000, 6);
    expect(row(p, 67).pension).toBeCloseTo(240000 * 1.02, 6);
    const p0 = E.projection(mk());
    expect(row(p, 66).other - row(p0, 66).other).toBeCloseTo(240000, 6);   // 走其他收入
    expect(row(p, 66).income - row(p0, 66).income).toBeCloseTo(240000, 6);
  });

  it("疑似填成總額的月領列（>30 萬／月、未勾確認）視同一次領，與 retireNeed 同一條規則", () => {
    const c = mk();
    c.retire.prepared = [{ item: "勞退新制", age: 65, amount: 2707500, method: "月領" }];
    const p = E.projection(c);
    expect(row(p, 65).penLump).toBe(2707500);
    expect(row(p, 66).pension).toBe(0);
    c.retire.prepared[0].monthlyOk = true;   // 教練確認真的是月額 → 照月領
    const p2 = E.projection(c);
    expect(row(p2, 65).penLump).toBe(0);
    expect(row(p2, 66).pension).toBeCloseTo(2707500 * 12, 6);
  });

  it("勞保概算列：有年金資格走 monthly×12 逐年；勞退概算列：專戶在退休那年一次進存量；延後退休年金自動變多", () => {
    const c = mk();
    c.retire.prepared = [
      { item: "勞保老年年金(概算)", laborAuto: "lp", age: 65, amount: 1, method: "一次領" },
      { item: "勞退新制(概算)", laborAuto: "fund", age: 65, amount: 1, method: "一次領" },
    ];
    const e = E.estimateSocialPension(c);
    expect(e.eligible).toBe(true);
    const p = E.projection(c);
    expect(row(p, 66).pension).toBeCloseTo(e.monthly * 12, 3);
    expect(row(p, 80).pension).toBeCloseTo(e.monthly * 12, 3);   // 勞保年金不成長（保守）
    expect(row(p, 65).penLump).toBeCloseTo(e.fund, 3);
    expect(row(p, 65).pension).toBe(0);
    // 延後 5 年：年資多 5 年 → 月領變多；一次領的勞退移到 70
    const a = E.applyRetireDelay(JSON.parse(JSON.stringify(c)), 5);
    const pa = E.projection(a);
    expect(row(pa, 70).penLump).toBeGreaterThan(e.fund);
    expect(row(pa, 65).penLump).toBe(0);
    expect(row(pa, 71).pension).toBeGreaterThan(e.monthly * 12);
    expect(row(pa, 70).pension).toBe(0);
  });

  it("勞保年資未滿 15 年：老年一次金在退休那年進存量", () => {
    const c = mk();
    c.members[0].worked = 3;
    c.profile.age = 60;
    c.retire.prepared = [{ item: "勞保老年年金(概算)", laborAuto: "lp", age: 65, amount: 1, method: "一次領" }];
    const e = E.estimateSocialPension(c);
    expect(e.eligible).toBe(false);
    const p = E.projection(c);
    expect(row(p, 65).penLump).toBeCloseTo(e.lump, 3);
    expect(row(p, 66).pension).toBe(0);
  });

  it("monteCarlo 也吃退休金：有年金的中位數期末資產高於沒有的", () => {
    const c0 = mk();
    const c1 = mk();
    c1.retire.prepared = [{ item: "商業年金", age: 65, amount: 30000, method: "月領" }];
    const m0 = E.monteCarlo(c0, 200), m1 = E.monteCarlo(c1, 200);
    const last = (m: any) => m.bands[m.bands.length - 1][1];
    expect(last(m1)).toBeGreaterThan(last(m0));
  });
});
