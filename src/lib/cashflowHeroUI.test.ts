import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 分析頁首屏「全生涯財務流」（2026/09/26 Ray）：
 * 收支負不等於缺口——入不敷出只是那一年要動用存量，存量被吃光那一年起才是真的不夠用。
 * 釘住三層口徑：柱色三態（金／琥珀＝靠存量撐／紅＝存量用完後）、存量線零線以下的缺口面積、
 * 三個數字＝首次入不敷出／存量用完／現值缺口。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.localStorage.clear();
  w.app.activeTab = "analysis";
  w.render();
});

const $ = (sel: string) => w.document.querySelector(sel);
const $$ = (sel: string) => [...w.document.querySelectorAll(sel)] as Element[];

describe("全生涯財務流：流量 → 存量 → 缺口", () => {
  it("標題與三個數字換成三層口徑", () => {
    const hero = $("#anHero");
    expect(hero.querySelector("h4").textContent).toContain("全生涯財務流");
    const labels = $$("#anHeroKpis .kpi .lb").map((el) => el.textContent);
    expect(labels).toEqual(["首次入不敷出", "存量用完", "現值缺口"]);
  });

  it("柱色三態：示範客戶在存量用完之前有入不敷出的年份（琥珀），之後才是紅", () => {
    const proj = w.metrics(w.activeCase()).proj;
    expect(proj.turnNeg, "示範客戶要有存量用完的年份，這條測試才有意義").toBeTruthy();
    const rects = $$("#anHeroChart svg rect");
    const amber = rects.filter((r) => r.getAttribute("fill") === "#c8873f").length;
    const red = rects.filter((r) => r.getAttribute("fill") === "#ef6f6f").length;
    expect(amber, "存量用完前的入不敷出年份是琥珀色").toBeGreaterThan(0);
    expect(red, "存量用完後才是紅").toBeGreaterThan(0);
    // 紅柱數 ＝ 存量用完之後、結餘為負的年數
    const expectRed = proj.rows.filter((r: { age: number; bal: number }) => r.age >= proj.turnNeg && r.bal < 0).length;
    expect(red).toBe(expectRed);
  });

  it("存量線零線以下塗成缺口面積；圖例講的是三態而不是「紅柱＝不夠用」", () => {
    expect($("#anHeroChart svg path.cfgap"), "缺口面積").toBeTruthy();
    const txt = $("#anHeroChart").textContent as string;
    expect(txt).toContain("靠存量撐");
    expect(txt).toContain("存量用完後");
    expect(txt).not.toContain("0 以下為入不敷出");
  });

  it("第 ④ 段的結論句跟首屏同一個口徑", () => {
    const vd = $('#anGrpNav .grp[data-g="future"] .vd').textContent as string;
    expect(vd).toContain("存量");
    expect(vd).toContain("用完");
  });

  it("滑鼠讀數會標「靠存量撐」或「缺口」", () => {
    const d = w.__charts.cf;
    expect(d.tn).toBe(w.metrics(w.activeCase()).proj.turnNeg);
  });
});
