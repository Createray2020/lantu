import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 「需求」只能有一個數字。
 *
 * 2026/08/24 修的 bug：coverageGaps() 的壽險 need 吃的是 lifeNeed()，
 * 而 lifeNeed() 回的已經是「毛需求 − 已備 − 流動資產」的淨缺口。
 * 接著 coverageGaps() 又把已備扣了第二次：
 *
 *   gap = (gross − existing − liquid) − (existing + liquid + actionCover)
 *
 * 示範案實測：保障準備度說壽險需求 17,724,396、已備 14,480,000（82%），
 * 五欄表說「偏低、可增加 3,244,396」，但保障缺口模組把需求印成 3,244,396、
 * 缺口 −11,235,603，判定「無明顯保障缺口」——同一份資料，兩個結論。
 * 報告書第六章更慘：上面 82% 的準備度，下面一行「目前無明顯保障缺口」。
 *
 * 這組測試釘住三處的「需求」是同一條分子（grossLifeNeed），
 * 任何一處被改回淨需求就會紅。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lifeRow = (rows: any[]) => rows.find((r) => (r.kind ?? r.item) === "壽險");

describe("保障需求：準備度 / 五欄表 / 缺口三處同一個數字", () => {
  it("html：三處的壽險『需求』完全相同", () => {
    const c = w.migrateCase(w.sampleCase());
    const readiness = lifeRow(w.coverageReadinessByKind(c)).need;
    const checkup = lifeRow(w.coverageCheckupRows(c)).need;
    const gap = lifeRow(w.coverageGaps(c)).need;

    expect(readiness).toBeGreaterThan(0);
    expect(checkup).toBe(readiness);
    expect(gap).toBe(readiness);
  });

  it("html：三處的壽險『已備』也相同（都含家庭可變現流動資產）", () => {
    const c = w.migrateCase(w.sampleCase());
    const readiness = lifeRow(w.coverageReadinessByKind(c)).have;
    const checkup = lifeRow(w.coverageCheckupRows(c)).have;
    const gap = lifeRow(w.coverageGaps(c)).have;
    expect(checkup).toBe(readiness);
    expect(gap).toBe(readiness);
  });

  it("html：缺口＝需求 − 已備，而且與五欄表的『可增加』金額一致", () => {
    const c = w.migrateCase(w.sampleCase());
    const g = lifeRow(w.coverageGaps(c));
    const ck = lifeRow(w.coverageCheckupRows(c));
    expect(g.gap).toBeCloseTo(g.need - g.have, 6);
    expect(g.gap).toBeCloseTo(ck.delta, 6);
    // 示範案是「還差一截」，不是「保障過剩」——修好之前這裡是 −1,123 萬。
    expect(g.gap).toBeGreaterThan(0);
  });

  it("engine.ts：缺口與五欄表的需求相同（雙實作不得各算各的）", () => {
    const c = E.newCase ? E.sampleCase() : E.sampleCase();
    expect(lifeRow(E.coverageGaps(c)).need).toBe(lifeRow(E.coverageCheckupRows(c)).need);
  });

  it("雙實作對拍：engine.ts 與 html 的壽險缺口一模一樣", () => {
    const c = w.migrateCase(w.sampleCase());
    const html = lifeRow(w.coverageGaps(c));
    const eng = lifeRow(E.coverageGaps(JSON.parse(JSON.stringify(c))));
    expect(eng.need).toBeCloseTo(html.need, 6);
    expect(eng.have).toBeCloseTo(html.have, 6);
    expect(eng.gap).toBeCloseTo(html.gap, 6);
  });

  it("兩份實作的 coverageGaps 壽險都寫 grossLifeNeed（不是 lifeNeed）", () => {
    expect(HTML).toContain("'壽險':grossLifeNeed(c,nd),");
    expect(HTML).not.toContain("'壽險':lifeNeed(c,nd),");
    const engineSrc = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
    expect(engineSrc).not.toContain("'壽險':lifeNeed(c,nd),");
  });

  it("lifeNeed() 仍是淨缺口：毛需求 − 已備 − 流動資產", () => {
    const c = w.migrateCase(w.sampleCase());
    const nd = c.needs[0];
    const expected = Math.max(
      0,
      w.grossLifeNeed(c, nd) - w.existingCover(c, nd.member, "壽險") - w.liquidMovable(c),
    );
    expect(w.lifeNeed(c, nd)).toBeCloseTo(expected, 6);
    expect(E.lifeNeed(JSON.parse(JSON.stringify(c)), nd)).toBeCloseTo(expected, 6);
  });

  it("非壽險的險種不受影響：需求就是欄位填的值", () => {
    const c = w.migrateCase(w.sampleCase());
    const nd = c.needs[0];
    const rows = w.coverageGaps(c);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = (k: string) => rows.find((r: any) => r.kind === k).need;
    expect(pick("意外傷殘")).toBe(w.n(nd.disability));
    expect(pick("重病給付")).toBe(w.n(nd.critical));
    expect(pick("每月照護")).toBe(w.n(nd.monthCare));
  });

  it("買保障的動作會把缺口拉小（保額進已備，不是讓缺口變大）", () => {
    const c = w.migrateCase(w.sampleCase());
    const before = lifeRow(w.coverageGaps(c)).gap;
    c.actions = c.actions || [];
    c.actions.push({ id: "t1", on: true, cat: "insure", coverKind: "壽險", cover: 2_000_000, member: "" });
    const after = lifeRow(w.coverageGaps(c));
    expect(after.gap).toBeCloseTo(before - 2_000_000, 6);
    // 需求不受動作影響——動作動的是「已備」那一欄。
    expect(after.need).toBeCloseTo(lifeRow(w.coverageReadinessByKind(c)).need, 6);
  });
});
