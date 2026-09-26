import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 2026/09/26 Ray：「買車規劃的停車位費用，買車時間 43 歲，現在的支出表已經出現，現在年齡沒有到。」
 * 真因：逐年投影（workPhaseExpense）有判 inSpan，但「現在」的幾個數字沒有——
 *   finTotals 的年支出、familyAnnualLiving（壽險需求／健康 KPI 都吃它）、孝親年額、調整方案的 expNow。
 * 這裡釘住：未來才開始的列不進任何「現在」的數字，到了那一歲才進；表上要看得出它「還沒到」。
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
});

beforeEach(() => {
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.app.activeTab = "data";
});

describe("未來才開始的支出：不進「現在」的數字", () => {
  it("43 歲起的停車位：40 歲時年支出／年生活費／孝親都不含，改成 40 就含", () => {
    const c = w.activeCase();
    c.profile.age = 40;
    const exp0 = w.finTotals(c).exp, liv0 = w.familyAnnualLiving(c), par0 = w.familyAnnualParentSupport(c);
    c.expenses.push({ tag: "car", name: "停車位月租", cat: "生活", subCat: "通勤/停車", period: "年", amount: 36000, infl: true, cut: 0, start: 43, end: 53 });
    c.expenses.push({ name: "孝親（未來）", cat: "孝親", subCat: "孝親", period: "年", amount: 120000, infl: true, cut: 0, start: 45, end: 60 });
    expect(w.finTotals(c).exp).toBe(exp0);
    expect(w.familyAnnualLiving(c)).toBe(liv0);
    expect(w.familyAnnualParentSupport(c)).toBe(par0);
    expect(w.finTotals(c).futN).toBe(2);
    expect(w.finTotals(c).futExp).toBe(156000);
    c.profile.age = 43;
    expect(w.familyAnnualLiving(c)).toBe(w.familyAnnualLiving({ ...c, expenses: c.expenses.filter((e: { name: string }) => e.name !== "停車位月租") }) + 36000);
    c.profile.age = 45;
    expect(w.familyAnnualParentSupport(c)).toBe(par0 + 120000);
  });

  it("投影不受影響：43 歲那一年才開始扣（原本就對，釘住不退步）", () => {
    const c = w.activeCase();
    c.profile.age = 40;
    c.expenses.push({ tag: "car", name: "停車位月租", cat: "生活", subCat: "通勤/停車", period: "年", amount: 36000, infl: false, cut: 0, start: 43, end: 53 });
    expect(w.workPhaseExpense(c, 42, 1, 0)).toBe(w.workPhaseExpense({ ...c, expenses: c.expenses.slice(0, -1) }, 42, 1, 0));
    expect(w.workPhaseExpense(c, 43, 1, 0)).toBe(w.workPhaseExpense({ ...c, expenses: c.expenses.slice(0, -1) }, 43, 1, 0) + 36000);
  });

  it("支出表：未來的列淡化、標「43 歲起」，表尾說明未計入", () => {
    const c = w.activeCase();
    c.profile.age = 40;
    c.expenses.push({ tag: "car", name: "停車位月租", cat: "生活", subCat: "通勤/停車", period: "年", amount: 36000, infl: true, cut: 0, start: 43, end: 53 });
    w.app.dataTab = "finance"; w.render();
    const fut = [...w.document.querySelectorAll("#app tr.futrow")] as HTMLElement[];
    expect(fut.length).toBe(1);
    expect(fut[0].textContent).toContain("43 歲起");
    expect(w.document.querySelector("#app .finpanel.exp")!.textContent).toContain("1 列未來才開始的支出");
    expect(w.document.getElementById("finSum_exp")!.textContent).toBe(w.fmt(w.finTotals(c).exp));
  });
});
