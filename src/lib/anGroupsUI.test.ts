import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { AN_MODULES } from "./analysisModules";

/**
 * 分析頁分段（2026/09/26）的 UI 測試。
 *
 * 釘住的是語意，不是長相：
 *   1. 每個模組只出現在自己那一段的段身裡，段身依模組表的 g 分堆；21 個模組一個不少。
 *   2. 一次只顯示一段（.grpbody.on 只有一個）；預設是第一段（沒企業主體＝現況體檢）。
 *   3. 切段只切 class、不重 render；當前段記在 lantu.an2.<id> 的 grp，且只寫這一維。
 *   4. anJump 跳到別段的模組，會先切到那一段。
 *   5. 排序語意不變：後台預設順序在段內照樣生效；跨段拖曳被忽略；隱藏的模組不進段身。
 *   6. 進分析頁不跑蒙地卡羅（mc 的 hint 曾經是 mc().N，等於每次 render 都先算 1000 條路徑）。
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
});

beforeEach(() => {
  w.localStorage.clear();
  w.LANTU_AN_DEFAULT = null;
  w.app.activeTab = "analysis";
  w.render();
});

const $ = (sel: string) => w.document.querySelector(sel);
const $$ = (sel: string) => [...w.document.querySelectorAll(sel)] as HTMLElement[];
const onGroup = () => $$("#anGrpBodies .grpbody.on").map((el) => el.dataset.g);
const cardsIn = (g: string) => $$(`#angrp_${g} .anmod`).map((el) => el.dataset.k);
const gOf = (k: string) => AN_MODULES.find((m) => m.k === k)!.g;

describe("分段：每個模組只在自己的段裡", () => {
  it("段身依模組表的 g 分堆，21 個模組（扣掉條件不成立的）一個不少、一個不重", () => {
    const seen: string[] = [];
    for (const body of $$("#anGrpBodies .grpbody")) {
      const g = body.dataset.g!;
      for (const card of [...body.querySelectorAll(".anmod")] as HTMLElement[]) {
        expect(gOf(card.dataset.k!), `${card.dataset.k} 跑錯段`).toBe(g);
        expect(card.dataset.g).toBe(g);
        seen.push(card.dataset.k!);
      }
    }
    expect(new Set(seen).size).toBe(seen.length);
    // sampleCase 沒有企業主體；置產缺口有條件——其餘全部都要在
    for (const m of AN_MODULES) if (m.k !== "biz" && m.k !== "property") expect(seen).toContain(m.k);
    expect($("#angrp_biz"), "企業主體關著時沒有企業那一段").toBeNull();
  });

  it("段卡片與段身一一對應，每張卡片都有結論句", () => {
    const navs = $$("#anGrpNav .grp").map((el) => el.dataset.g);
    const bodies = $$("#anGrpBodies .grpbody").map((el) => el.dataset.g);
    expect(navs).toEqual(bodies);
    expect(navs).toEqual(["now", "risk", "goal", "future", "rx"]);
    for (const el of $$("#anGrpNav .grp")) expect(el.querySelector(".vd")?.textContent, `${el.dataset.g} 沒有結論句`).toBeTruthy();
  });

  it("導覽晶片也依段分行，段內順序＝畫面順序", () => {
    const rows = $$("#anChips .chipgrp").map((el) => el.dataset.g);
    expect(rows).toEqual(["now", "risk", "goal", "future", "rx"]);
    const chips = $$('#anChips .chipgrp[data-g="risk"] .anchip').map((el) => el.dataset.k);
    expect(chips).toEqual(cardsIn("risk"));
  });
});

describe("切段", () => {
  it("預設停在第一段（現況體檢），一次只顯示一段", () => {
    expect(onGroup()).toEqual(["now"]);
    expect($$("#anGrpNav .grp.on").map((el) => el.dataset.g)).toEqual(["now"]);
  });

  it("anPickGroup 只切 class 不重 render，並把當前段記進 lantu.an2.<id> 的 grp（只寫這一維）", () => {
    const hero = $("#anHeroChart").innerHTML;
    w.anExpandAll(true);
    const filled = $("#anbody_coverage").innerHTML;
    w.anPickGroup("risk");
    expect(onGroup()).toEqual(["risk"]);
    expect($("#anHeroChart").innerHTML, "首屏圖沒被重畫").toBe(hero);
    expect($("#anbody_coverage").innerHTML, "已展開的內容還在").toBe(filled);
    const raw = JSON.parse(w.localStorage.getItem("lantu.an2." + w.activeCase().id));
    expect(raw.grp).toBe("risk");
    expect(raw.order, "切段不可以順手把 order 寫成『調過』").toBeUndefined();
    expect(raw.hidden, "切段不可以順手把 hidden 寫成『調過』").toBeUndefined();
    w.render();
    expect(onGroup(), "重畫後停在記住的那一段").toEqual(["risk"]);
  });

  it("不存在的段被忽略", () => {
    w.anPickGroup("nope");
    expect(onGroup()).toEqual(["now"]);
  });

  it("anJump 到別段的模組會先切段再展開", () => {
    expect(onGroup()).toEqual(["now"]);
    w.anJump("beforeafter");
    expect(onGroup()).toEqual(["rx"]);
    expect($("#anmod_beforeafter").open).toBe(true);
  });
});

describe("排序語意不變", () => {
  it("後台預設順序在段內生效", () => {
    const base = (w.AN_VIEW.order as string[]).slice();
    const riskKeys = base.filter((k) => gOf(k) === "risk");
    const moved = riskKeys[riskKeys.length - 1];
    w.LANTU_AN_DEFAULT = { order: [moved, ...base.filter((k) => k !== moved)], hidden: [] };
    w.render();
    expect(cardsIn("risk")[0]).toBe(moved);
    expect(cardsIn("now")[0], "別段不受影響").toBe(base.filter((k) => gOf(k) === "now")[0]);
  });

  it("跨段拖曳被忽略，段內拖曳照舊", () => {
    const order = (w.AN_VIEW.order as string[]).slice();
    const iNow = order.findIndex((k) => gOf(k) === "now");
    const iRisk = order.findIndex((k) => gOf(k) === "risk");
    w.anMove(iNow, iRisk);
    expect(w.AN_VIEW.order).toEqual(order);
    const riskIdx = order.map((k, i) => (gOf(k) === "risk" ? i : -1)).filter((i) => i >= 0);
    w.anMove(riskIdx[riskIdx.length - 1], riskIdx[0]);
    expect(cardsIn("risk")[0]).toBe(order[riskIdx[riskIdx.length - 1]]);
  });

  it("隱藏的模組不進段身，但晶片還在", () => {
    w.anToggleHide("coverage");
    expect(cardsIn("risk")).not.toContain("coverage");
    expect($$('#anChips .anchip[data-k="coverage"]').length).toBe(1);
  });
});

describe("進分析頁的成本", () => {
  it("render 分析頁不呼叫 monteCarlo（展開那一格才算）", () => {
    const orig = w.monteCarlo;
    let calls = 0;
    w.monteCarlo = (...a: unknown[]) => { calls++; return orig(...a); };
    try {
      w.render();
      expect(calls).toBe(0);
    } finally {
      w.monteCarlo = orig;
    }
  });
});
