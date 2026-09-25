import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 2026/09/25 Ray 兩項回饋：
 * 一、副業表的「年化」沒有跟著月收入一起變（要整頁重畫才更新，新加的列一直是 0）。
 * 二、關注議題可以自行新增。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
});

beforeEach(() => {
  const c = w.migrateCase(w.newCase());
  c.profile.name = "本人"; c.profile.age = 41;
  c.members = [{ name: "本人", role: "本人", gender: "男", age: 41, expRatio: 100, indepAge: "" }];
  c.incomes = [];
  w.app.cases = [c];
  w.app.activeId = c.id;
});
const c = () => w.activeCase();

describe("副業年化即時更新", () => {
  it("月收入一輸入，年化那一格當場變成 ×12（不用重畫）", () => {
    w.app.activeTab = "data"; w.app.dataTab = "family"; w.render();
    w.addSideJobAt(0, true);
    w.addSideJobAt(0, true);
    const i = c().incomes.length - 1;
    const cell = w.document.querySelector(`td[data-fincalc="incomes:${i}"]`);
    expect(cell, "年化格要掛 data-fincalc").toBeTruthy();
    const input = cell.previousElementSibling.querySelector("input");
    expect(input.getAttribute("oninput")).toContain("setSideMonthly");
    w.setSideMonthly(i, "50,000");
    expect(c().incomes[i].amount).toBe(600000);
    expect(w.document.querySelector(`td[data-fincalc="incomes:${i}"]`).textContent).toBe(w.fmt(600000));
  });
});

describe("關注議題自行新增", () => {
  it("加入後存在 purposesCustom，normalizeIntent 不會把它濾掉", () => {
    w.addCustomPurpose("  想處理家族信託 ");
    expect(c().intent.purposesCustom).toEqual(["想處理家族信託"]);
    w.normalizeIntent(c());
    expect(c().intent.purposesCustom).toEqual(["想處理家族信託"]);
    expect(c().intent.purposes).not.toContain("想處理家族信託");
  });

  it("空白與重複（含內建議題同名）不加", () => {
    w.addCustomPurpose("");
    w.addCustomPurpose("A");
    w.addCustomPurpose("A");
    w.addCustomPurpose("想增加收入");
    expect(c().intent.purposesCustom).toEqual(["A"]);
    expect(c().intent.purposes).toContain("想增加收入");
  });

  it("畫面上看得到自訂議題與輸入框，可以移除", () => {
    w.addCustomPurpose("A");
    w.addCustomPurpose("B");
    const html = w.customPurposesHTML(c().intent);
    expect(html).toContain("A");
    expect(html).toContain("purposeCustomIn");
    w.delCustomPurpose(0);
    expect(c().intent.purposesCustom).toEqual(["B"]);
  });

  it("報告與註記的議題數把自訂的算進去", () => {
    c().intent.purposes = ["想增加收入"];
    w.addCustomPurpose("想處理家族信託");
    expect(w.allPurposes(c().intent)).toEqual(["想增加收入", "想處理家族信託"]);
  });
});
