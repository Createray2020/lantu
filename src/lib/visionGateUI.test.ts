import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 願景選定閘的 UI 接線（2026/08/24）。
 *
 * 三件事要釘住：
 *   ① migrateCase 一定把舊資料補成 on:true —— 這是「既有客戶數字一位不動」的實作面保證
 *   ② 四張願景表都要有「納入」欄，教練才勾得到
 *   ③ 布林欄位存進去必須是真的 boolean，不能是 'true'/'false' 字串
 *      （旁邊的 feedEstate 就是這樣壞掉的：字串 'false' 在 JS 是 truthy）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useCase(c: any) {
  w.app.cases = [c];
  w.app.activeId = c.id;
}

describe("migrateCase：舊資料一律補 on:true", () => {
  it("四張願景表的每一列都會被補上 on:true", () => {
    const raw = w.sampleCase();
    ["goals", "travel", "hobby", "luxury"].forEach((k) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw[k] || []).forEach((x: any) => delete x.on);
    });
    const c = w.migrateCase(raw);
    ["goals", "travel", "hobby", "luxury"].forEach((k) => {
      expect(c[k].length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      c[k].forEach((x: any) => expect(x.on).toBe(true));
    });
  });

  it("已經是 false 的不會被覆蓋回 true", () => {
    const raw = w.sampleCase();
    raw.goals[0].on = false;
    const c = w.migrateCase(raw);
    expect(c.goals[0].on).toBe(false);
    expect(c.goals[1].on).toBe(true);
  });

  it("legacy 的布林欄位從字串正規化成 boolean（舊的 sel:true,false 存的是字串）", () => {
    const raw = w.sampleCase();
    raw.legacy.on = "false";
    raw.legacy.feedEstate = "false";
    const c = w.migrateCase(raw);
    expect(c.legacy.on).toBe(false);
    expect(c.legacy.feedEstate).toBe(false);
    expect(w.legacyNeed(c)).toBe(0);
  });

  it("legacy 沒有 on 欄位時預設納入", () => {
    const raw = w.sampleCase();
    delete raw.legacy.on;
    const c = w.migrateCase(raw);
    expect(c.legacy.on).toBe(true);
    expect(w.legacyNeed(c)).toBeGreaterThan(0);
  });
});

describe("新增列預設就是「納入」", () => {
  it("addRow 出來的新列帶 on:true", () => {
    useCase(w.migrateCase(w.sampleCase()));
    ["goals", "travel", "hobby", "luxury"].forEach((k) => {
      const before = w.app.cases[0][k].length;
      w.addRow(k);
      const list = w.app.cases[0][k];
      expect(list.length).toBe(before + 1);
      expect(list[list.length - 1].on).toBe(true);
    });
  });
});

describe("四張願景表都看得到「納入」欄", () => {
  it("目標／置產分頁有納入欄與勾選框", () => {
    useCase(w.migrateCase(w.sampleCase()));
    w.app.dataTab = "goals";
    w.render();
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toContain("納入");
    expect(html).toContain("'goals:0','on'");
  });

  it("生活願望分頁的三張表都有納入欄", () => {
    useCase(w.migrateCase(w.sampleCase()));
    w.app.dataTab = "lifestyle";
    w.render();
    const html = w.document.querySelector("#app").innerHTML as string;
    ["travel:0", "hobby:0", "luxury:0"].forEach((id) => {
      expect(html).toContain("'" + id + "','on'");
    });
  });
});

describe("勾掉願景 ⇢ 缺口當場改變", () => {
  it("關掉一個目標，需求現值下降", () => {
    const c = w.migrateCase(w.sampleCase());
    useCase(c);
    const before = w.projection(c).needPV;
    w.set("goals:0", "on", false, "bool");
    const after = w.projection(w.app.cases[0]).needPV;
    expect(after).toBeLessThan(before);
    expect(w.app.cases[0].goals[0].on).toBe(false);
  });
});

describe("boolish()：字串布林一律正規化", () => {
  it("'false' / '0' / '' / '否' 視為關，其餘視為開", () => {
    expect(w.boolish("false", true)).toBe(false);
    expect(w.boolish("0", true)).toBe(false);
    expect(w.boolish("", true)).toBe(false);
    expect(w.boolish("否", true)).toBe(false);
    expect(w.boolish("true", true)).toBe(true);
    expect(w.boolish(true, false)).toBe(true);
    expect(w.boolish(false, true)).toBe(false);
    expect(w.boolish(undefined, true)).toBe(true);
  });
});
