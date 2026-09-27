import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 購屋⑤ 呈現（2026/09/27）：分析頁「購屋規劃」模組與報告書購屋章共用 houseFlowSec——
 * 首屏＝三個數字＋一張逐年長條圖（自備款／房貸本息（寬限期淺色）／裝修／賣屋淨得箭頭），
 * 舊的「置產缺口」表收進折疊；財務目標歷程多了交屋・賣屋兩種事件。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.Element.prototype.scrollIntoView = () => {};
});
function caseWith(goal: Record<string, unknown>) {
  const c = w.migrateCase(w.sampleCase());
  c.goals = [];
  c.assets.push({ name: "自住房", type: "不動產", value: 15_000_000, aid: "a1", sellable: true, currency: "台幣", fxRate: 1 });
  c.goals.push({ on: true, name: "換屋", type: "購屋", present: 20_000_000, minPresent: 0, start: 45, end: 45, freq: 0, growth: "固定", appreciation: 0,
    loanRatio: 75, loanRate: 2.2, loanYears: 30, imp: 4, prepared: 0, ...goal });
  return c;
}
const full = () => caseWith({ condition: "預售", decoCost: 1_000_000, decoLoanRatio: 80, decoLoanRate: 4, decoLoanYears: 7, sellAid: "a1" });

describe("購屋規劃：錢怎麼流", () => {
  it("逐年列：簽約年訂簽開＋期款、交屋年裝修＋賣屋、寬限期三年只繳息", () => {
    const c = full();
    const rows = w.houseFlowRows(c, w.goalLoans(c)[0]);
    expect(rows[0]).toMatchObject({ age: 45, grace: false });
    expect(Math.round(rows[0].down)).toBe(3_000_000 + 666_667);
    const h = rows.find((r: { age: number }) => r.age === 48);
    expect(h.deco).toBe(200_000);
    expect(h.sale).toBe(14_700_000);
    expect(h.grace).toBe(true);
    expect(rows.find((r: { age: number }) => r.age === 51).grace).toBe(false);
    expect(rows[rows.length - 1].age).toBe(78);   // 48 + 30 年
  });
  it("卡片：三個數字＋一張圖；刻度只看支出、賣屋淨得畫成箭頭；深色用 .big3、淺色用報告書色", () => {
    const c = full();
    const d = w.houseFlowSec(c, "dark"), l = w.houseFlowSec(c, "light");
    for (const h of [d, l]) {
      expect(h).toContain("<svg");
      expect(h).toContain("賣屋淨得 1470 萬");
      expect(h).toContain("寬限後月付");
      expect(h).toContain("交屋 48 歲");
      expect(h).toContain("寬限期 3 年");
      expect(h).toContain("裝修貸");
    }
    expect(d).toContain('class="big3"');
    expect(l).not.toContain("var(--");
    expect(l).toContain("#0d2b45");
  });
  it("分析頁：模組改名「購屋規劃」，首屏是圖，置產缺口表收進折疊；沒接上貸款的目標只有缺口表", () => {
    const c = full();
    w.app.role = "coach"; w.app.cases = [c]; w.app.activeId = c.id; w.app.activeTab = "analysis"; w.render();
    w.anJump("property");
    const mod = w.document.querySelector('.anmod[data-k="property"]');
    expect(mod).not.toBeNull();
    expect(mod.textContent).toContain("購屋規劃");
    expect(mod.querySelectorAll("svg").length).toBe(1);
    const det = mod.querySelector("details");
    expect(det).not.toBeNull();
    expect(det.textContent).toContain("置產缺口");
    expect(det.querySelector("table.rtable")).not.toBeNull();
    // 首屏的圖必須在折疊區之前
    expect(mod.innerHTML.indexOf("<svg")).toBeLessThan(mod.innerHTML.indexOf("<details"));

    const c2 = caseWith({ loanRate: 0 });
    w.app.cases = [c2]; w.app.activeId = c2.id; w.render(); w.anJump("property");
    const mod2 = w.document.querySelector('.anmod[data-k="property"]');
    expect(mod2.querySelectorAll("svg").length).toBe(0);
    expect(mod2.querySelector("table.rtable")).not.toBeNull();
  });
  it("報告書：購屋規劃章有圖與說明，置產缺口收進折疊；舊目標維持原本的缺口章", () => {
    const r = w.reportHTML(full());
    const i = r.indexOf(">購屋規劃</div>");
    expect(i).toBeGreaterThan(0);
    const seg = r.slice(i, i + 12000);
    expect(seg).toContain("<svg");
    expect(seg).toContain("賣屋淨得");
    expect(seg).toContain("置產缺口");
    const r2 = w.reportHTML(caseWith({ loanRate: 0 }));
    expect(r2).toContain("置產缺口（購屋・置產）");
    expect(r2).not.toContain(">購屋規劃</div>");
  });
  it("財務目標歷程：交屋年與賣屋年是事件", () => {
    const t = w.timelineSVG(full());
    expect(t).toContain("交屋·換屋");
    expect(t).toContain("賣屋·自住房");
    expect(w.timelineSVG(caseWith({ condition: "新成屋" }))).not.toContain("交屋·");
  });
});
