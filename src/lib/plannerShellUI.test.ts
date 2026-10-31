/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 規劃器第二版外殼（2026/11/01 介面整理第二波）。
 *
 * 守的是「只搬位置、不丟功能」：
 *   - 教練端嵌在編輯器裡才換外殼；客戶端、示範模式維持原樣。
 *   - 舊導覽（分頁列／群組下拉／完整度列）還在 DOM 裡，只是藏起來——其他功能（聚焦、ivGoto、sticky 高度）照常吃得到。
 *   - 步驟欄的面向＝INTERVIEW_STEPS，名稱與順序不變（②在③前是刻意的）。
 *   - 工具從大分頁搬進抽屜、諮詢狀態從底部搬上頂列、方案頁的重複圖預設收起但元素都還在。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

async function boot(url: string): Promise<any> {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url, pretendToBeVisual: true });
  const w: any = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.Element.prototype.scrollIntoView = function () {};
  w.scrollTo = function () {};
  return w;
}
function init(w: any, extra: Record<string, unknown> = {}) {
  const c = w.sampleCase();
  w.dispatchEvent(new w.MessageEvent("message", {
    data: { type: "lantu:init", data: c, theme: "light", readOnly: false, notes: [], session: null, past: [], noteAccess: "owner",
      nav: { back: "/dashboard/clients/c1", history: "/dashboard/plans/p1/history", versionLabel: "2026 · 初版" }, ...extra },
    origin: w.location.origin, source: w.parent,
  }));
}

describe("教練端編輯器：換成步驟欄外殼", () => {
  let w: any;
  beforeAll(async () => { w = await boot("https://lantu.test/lantu-app.html?embed=1"); init(w); });

  it("html 掛上 pl2，左邊有步驟欄、右邊有抽屜列", () => {
    expect(w.document.documentElement.classList.contains("pl2")).toBe(true);
    expect(w.document.querySelector(".p2rail")).toBeTruthy();
    expect(w.document.getElementById("p2dock")).toBeTruthy();
    expect(w.document.getElementById("p2dock").textContent).toContain("記事");
    expect(w.document.getElementById("p2dock").textContent).toContain("工具");
  });

  it("舊導覽只藏不刪：分組列、完整度列、分頁列都還在 DOM", () => {
    expect(w.document.getElementById("dgbar")).toBeTruthy();
    expect(w.document.querySelector('[data-calc="completeness"]')).toBeTruthy();
  });

  it("步驟欄：①②③ 照順序，展開那一段的面向名稱＝INTERVIEW_STEPS", () => {
    const steps = [...w.document.querySelectorAll(".p2step[data-p2g]")].map((b: any) => b.textContent);
    expect(steps[0]).toContain("① 基礎參數");
    expect(steps[1]).toContain("② 未來的需求");
    expect(steps[2]).toContain("③ 現在的狀況");
    const g1 = w.INTERVIEW_STEPS.filter((s: any) => s.g === 1).map((s: any) => s.name);
    const shown = [...w.document.querySelectorAll(".p2subs .p2f")].map((b: any) => b.textContent);
    expect(shown).toEqual(g1);
  });

  it("產出四步：分析／方案／建議／報告，工具不再是分頁", () => {
    const outs = [...w.document.querySelectorAll('.p2step[data-tab]')].map((b: any) => b.dataset.tab);
    expect(outs).toEqual(["analysis", "plan", "advice", "report"]);
    w.app.activeTab = "tools"; w.render();
    expect(w.app.activeTab, "舊連結的 tools 轉成抽屜").toBe("data");
    expect(w.document.querySelector(".p2tools")).toBeTruthy();
    w.app.pl2Tools = false; w.render();
  });

  it("點面向走 ivGoto：切到那一段的分頁", () => {
    const st = w.INTERVIEW_STEPS.find((s: any) => s.g === 3);
    w.app.pl2Open = 3; w.render();
    (w.document.querySelector(`.p2f[data-ivk="${st.k}"]`) as any).click();
    expect(w.app.activeTab).toBe("data");
    expect(w.app.dataTab).toBe(st.tab);
  });

  it("頂列：返回客戶、客戶名、版本選單（含版本紀錄）、諮詢狀態膠囊", () => {
    const lead = w.document.getElementById("p2lead");
    expect(lead.querySelector('a.p2back').getAttribute("href")).toBe("/dashboard/clients/c1");
    expect(lead.querySelector('a.p2back').getAttribute("target")).toBe("_top");
    expect(lead.textContent).toContain("2026 · 初版");
    expect(lead.innerHTML).toContain("/dashboard/plans/p1/history");
    const pill = w.document.getElementById("p2sess");
    expect(pill.textContent).toContain("不在諮詢中");
    pill.click();
    expect(w.document.documentElement.classList.contains("p2sessopen")).toBe(true);
    pill.click();
  });

  it("「下一個沒填」跳到第一個沒完成、而且客戶有勾的面向", () => {
    const c = w.activeCase();
    const gap = w.INTERVIEW_STEPS.find((s: any) => !(s.t && !w.targetOn(c, s.t)) && !w.ivDone(c, s));
    w.app.activeTab = "analysis"; w.render();
    w.PL2_NEXT();
    expect(w.app.ivFacet).toBe(gap.k);
  });

  it("⌘K 打開搜尋；找得到面向、產出與抽屜", () => {
    w.PL2_K();
    const box = w.document.getElementById("p2k");
    expect(box).toBeTruthy();
    const inp = w.document.getElementById("p2kq");
    inp.value = "退休"; inp.dispatchEvent(new w.Event("input"));
    expect(box.textContent).toContain("退休規劃");
    w.PL2_K();
    expect(w.document.getElementById("p2k")).toBe(null);
  });
});

describe("方案頁那張重複的圖：預設收起，元素還在（不用 <details>，首屏的定義是第一個 <details> 之前）", () => {
  it("tuneHero 包在可展開的 .tunefold 裡（預設收起），不是刪掉", async () => {
    const w = await boot("https://lantu.test/lantu-app.html?embed=1"); init(w);
    w.app.activeTab = "plan"; w.render();
    const hero = w.document.querySelector('[data-calc="tuneHero"]');
    expect(hero).toBeTruthy();
    const fold = hero.closest(".tunefold");
    expect(fold).toBeTruthy();
    expect(fold.classList.contains("open"), "沒有在拉桿階段時預設收起").toBe(false);
    (fold.querySelector(".tfsw") as any).click();
    expect(fold.classList.contains("open")).toBe(true);
  });
});

describe("其他模式不換外殼", () => {
  it("示範模式（沒有 embed）維持原本的分頁列", async () => {
    const w = await boot("https://lantu.test/lantu-app.html");
    expect(w.document.documentElement.classList.contains("pl2")).toBe(false);
    expect(w.document.querySelector(".p2rail")).toBe(null);
  });

  it("切到客戶端檢視就拿掉 pl2", async () => {
    const w = await boot("https://lantu.test/lantu-app.html?embed=1"); init(w);
    w.app.role = "client"; w.render();
    expect(w.document.documentElement.classList.contains("pl2")).toBe(false);
  });
});
