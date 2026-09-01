import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import {
  CLIENT_DASH_MODULES, CLIENT_DASH_KEYS, CLIENT_DASH_GROUPS, ADVICE_MODULES,
  dashModulesOf, AN_PREFIX, AD_PREFIX,
} from "./clientDashModules";
import { AN_MODULE_KEYS } from "./analysisModules";

/**
 * 客戶財務儀表板模組清單：伺服器端鏡像 ↔ lantu-app.html 的對拍。
 *
 * Ray 2026/09/01：「我希望預設新增進去的部分，會是『教練』那邊有關分析以及建議的
 * 這兩個模塊，全部都可以放進去。」
 *
 * 三群的守門員各不相同：
 *   總覽 —— 這一支逐字比對 html 的 CLIENT_DASH_MODULES
 *   分析 —— 由 AN_MODULES 生出來（anModules.drift.test.ts 已經守著它 ↔ html）
 *   建議 —— 這一支比對 html 的 adviceModules()
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
});

describe("三群的組成", () => {
  it("總覽那六塊逐字一致", () => {
    const mine = dashModulesOf("總覽");
    expect(w.CLIENT_DASH_MODULES.length).toBe(mine.length);
    mine.forEach((m, i) => {
      expect(w.CLIENT_DASH_MODULES[i].k, `第 ${i + 1} 塊的鍵`).toBe(m.k);
      expect(w.CLIENT_DASH_MODULES[i].t, `第 ${i + 1} 塊的名稱`).toBe(m.t);
    });
  });

  it("分析那一群＝AN_MODULES 全部（分析頁加模組時後台自動跟著長）", () => {
    expect(dashModulesOf("分析").map((m) => m.k)).toEqual(AN_MODULE_KEYS.map((k) => AN_PREFIX + k));
    expect(AN_MODULE_KEYS.length).toBe(21);
  });

  it("建議那一群跟 html 的 adviceModules() 一致", () => {
    // when 為 false 的（企業主診斷建議）在一般客戶身上會被濾掉，所以拿企業主體開著的 case 比
    const c = w.migrateCase(w.newCase());
    c.intent.entities = { company: true };
    const theirs = w.adviceModules(c);
    expect(theirs.length).toBe(ADVICE_MODULES.length);
    ADVICE_MODULES.forEach((m, i) => {
      expect(theirs[i].k, `建議第 ${i + 1} 塊的鍵`).toBe(m.k);
      expect(theirs[i].t, `建議第 ${i + 1} 塊的名稱`).toBe(m.t);
    });
    expect(dashModulesOf("建議").map((m) => m.k)).toEqual(ADVICE_MODULES.map((m) => AD_PREFIX + m.k));
  });

  it("⚠️ 前綴不能拿掉：分析與建議都有 biz，撞在一起就會勾一個等於勾兩個", () => {
    expect(AN_MODULE_KEYS).toContain("biz");
    expect(ADVICE_MODULES.map((m) => m.k)).toContain("biz");
    expect(AN_PREFIX + "biz").not.toBe(AD_PREFIX + "biz");
    expect(w.AN_DASH_PREFIX).toBe(AN_PREFIX);
    expect(w.AD_DASH_PREFIX).toBe(AD_PREFIX);
  });

  it("鍵沒有重複，而且每一塊都有名稱與說明", () => {
    expect(new Set(CLIENT_DASH_KEYS).size).toBe(CLIENT_DASH_KEYS.length);
    for (const m of CLIENT_DASH_MODULES) {
      expect(m.t.length, m.k).toBeGreaterThan(1);
      expect(m.d.length, m.k).toBeGreaterThan(4);
      expect(CLIENT_DASH_GROUPS).toContain(m.g);
    }
  });

  it("總共 32 塊（總覽 6 ＋ 分析 21 ＋ 建議 5）", () => {
    expect(CLIENT_DASH_MODULES.length).toBe(32);
  });
});

describe("拆掉建議分頁之後，教練端輸出沒有變", () => {
  it("advicePane 仍然畫得出那五塊的標題", () => {
    const c = w.migrateCase(w.sampleCase());
    w.app.cases = [c]; w.app.activeId = c.id;
    const h = w.advicePane(c) as string;
    for (const t of ["規劃建議", "執行行動清單", "動態調整（PDCA）", "缺口總表"]) {
      expect(h, t).toContain(t);
    }
    expect(h).toContain("下次檢視日期");
    expect(h).toContain("資產轉負年齡");
  });

  it("沒開企業主體時不會冒出企業主診斷建議", () => {
    const c = w.migrateCase(w.newCase());
    w.app.cases = [c]; w.app.activeId = c.id;
    expect(w.adviceModules(c).map((x: { k: string }) => x.k)).not.toContain("biz");
  });
});
