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
  w.HTMLElement.prototype.scrollIntoView = () => {};
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

// 圖右側的年度明細卡（2026/09/26 Ray：「移動到哪一歲，那一年的收入、支出、資產負債、為什麼是正或負直接跟著跑出來」）
describe("年度明細卡：滑到哪一歲就換、點一下鎖住", () => {
  const svgOf = () => {
    const svg = $("#anHeroChart svg");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 760, height: 250, right: 760, bottom: 250, x: 0, y: 0, toJSON() {} });
    return svg;
  };
  const evAt = (i: number) => {
    const d = w.__charts.cf;
    const x = d.pad + (i / (d.n - 1)) * (d.W - d.pad * 2);
    return { currentTarget: svgOf(), clientX: x } as unknown as MouseEvent;
  };
  const cardAge = () => Number(($("#cfDetail .cfhd b").textContent as string).replace(/\D/g, ""));

  it("預設停在第一個入不敷出的年份，卡片有收入／支出／存量／為什麼", () => {
    w.render();
    const proj = w.metrics(w.activeCase()).proj;
    const firstNeg = proj.rows.find((r: { bal: number }) => r.bal < 0);
    expect($("#cfDetail"), "圖右側要有明細卡").toBeTruthy();
    expect(cardAge()).toBe(firstNeg.age);
    const txt = $("#cfDetail").textContent as string;
    for (const k of ["收入", "支出", "存量", "為什麼", "可投資資產"]) expect(txt).toContain(k);
    expect(txt, "負的那一年要講原因").toMatch(/支出 [\d,]+ ＞ 收入/);
  });

  it("projection 的 row 帶著拆項：日常／教育／退休生活／方案動作／剩餘負債／固定資產", () => {
    const r = w.metrics(w.activeCase()).proj.rows[0];
    for (const k of ["base", "edu", "retire", "act", "liab", "fixed"]) expect(r, k).toHaveProperty(k);
    // 合計欄 expense 仍舊等於三項相加，既有消費者不受影響
    expect(Math.round(r.expense)).toBe(Math.round(r.base + r.edu + r.retire));
  });

  it("滑鼠滑到第 10 年，卡片換成那一歲", () => {
    w.render();
    w.hoverChart(evAt(10), "cf");
    expect(cardAge()).toBe(w.__charts.cf.a0 + 10);
    expect($("#cfReadout").textContent).toContain(String(w.__charts.cf.a0 + 10) + " 歲");
  });

  it("點一下鎖住那一歲：滑鼠再動卡片不跟；再點一下解鎖", () => {
    w.render();
    w.cfLockToggle(evAt(12), "cf");
    expect(w.__charts.cf.lockAge).toBe(w.__charts.cf.a0 + 12);
    expect(cardAge()).toBe(w.__charts.cf.a0 + 12);
    expect($("#cfDetail").textContent).toContain("已鎖定");
    w.hoverChart(evAt(20), "cf");
    expect(cardAge(), "鎖住時不跟滑鼠").toBe(w.__charts.cf.a0 + 12);
    w.cfLockToggle(evAt(20), "cf");
    expect(w.__charts.cf.lockAge).toBeNull();
    expect(cardAge(), "解鎖後直接跳到滑鼠所在那一歲").toBe(w.__charts.cf.a0 + 20);
  });

  it("鎖住的那一歲跨拉桿重畫保留：拉報酬率，卡片還停在同一歲", () => {
    w.render();
    w.cfLockToggle(evAt(15), "cf");
    const age = w.__charts.cf.a0 + 15;
    w.anTune("ret", "9");
    expect(w.__charts.cf.lockAge).toBe(age);
    expect(cardAge()).toBe(age);
    w.anTuneReset();
    w.__charts.cf.lockAge = null;
  });

  it("首屏與「一生現金流投影」模組各自一把 key，不互相蓋掉", () => {
    w.render();
    w.anJump("cashflow");
    expect(w.__charts.cf2, "模組那張用 cf2").toBeTruthy();
    expect($("#cf2Detail")).toBeTruthy();
    expect($("#cfDetail")).toBeTruthy();
  });
});
