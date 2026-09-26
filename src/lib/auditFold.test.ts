import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 2026/09/26 全站盤查（Ray：留基本資訊、其餘點開再展開，全站都盤一遍）。
 * 釘住每一頁的「預設攤開多少」：
 *   保障中心 → 頁內四個分頁籤，一次只顯示一段；KYC → 已答題收成一行；
 *   收支資債副區／族譜／理財模式／待補齊／已準備退休金 → foldKeep 收起且記得展開狀態；
 *   調整方案 → 首屏之外的 details 全部收著。
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
  w.FOLD_OPEN = {}; w.RISK_OPEN = {}; w.COV_TAB = "check";
  w.app.activeTab = "data";
});

const go = (t: string) => { w.app.dataTab = t; w.render(); };
const $ = (sel: string) => w.document.querySelector(sel);
const $$ = (sel: string) => [...w.document.querySelectorAll(sel)] as HTMLElement[];

describe("保障中心：頁內四個分頁籤", () => {
  it("賓士圖在上面；四張段卡片；一次只顯示一段（預設健檢報告）", () => {
    go("coverage");
    expect($$("#covNav .grp").map((e) => e.dataset.t)).toEqual(["check", "policies", "needs", "prop"]);
    expect($$("#covBodies .covtab.on").map((e) => e.dataset.t)).toEqual(["check"]);
    const h = $("#app").innerHTML as string;
    expect(h.indexOf("嵐途雙環風險需求圖")).toBeLessThan(h.indexOf('id="covNav"'));
    // 四段的內容都在 DOM（data-calc 即時重算靠它）
    expect($('.covtab[data-t="check"] [data-calc="coverageDerived"]')).toBeTruthy();
    expect($('.covtab[data-t="needs"] [data-calc="coverageNeeds"]')).toBeTruthy();
    expect($('.covtab[data-t="policies"]').textContent).toContain("保單");
    expect($('.covtab[data-t="prop"]').textContent).toContain("產險");
  });

  it("covTabPick 只切 class 不重 render，並記住", () => {
    go("coverage");
    const before = $("#app").innerHTML;
    w.covTabPick("needs");
    expect($$("#covBodies .covtab.on").map((e) => e.dataset.t)).toEqual(["needs"]);
    expect($$("#covNav .grp.on").map((e) => e.dataset.t)).toEqual(["needs"]);
    expect($("#app").innerHTML.length).toBe(before.length);
    w.render();
    expect($$("#covBodies .covtab.on").map((e) => e.dataset.t), "重畫後停在同一段").toEqual(["needs"]);
    w.covTabPick("nope");
    expect($$("#covBodies .covtab.on").map((e) => e.dataset.t)).toEqual(["needs"]);
  });

  it("revealEl：捲到別段的錨點會先切過去", () => {
    go("coverage");
    const el = $('[data-ivsec="cover"]');
    w.revealEl(el);
    expect(w.COV_TAB).toBe("needs");
  });
});

describe("KYC：已答題收成一行", () => {
  it("已作答的題收著並顯示所選答案；未作答的攤開；focusRiskQ 會打開", () => {
    const c = w.activeCase();
    c.riskQuiz = { ans: { 0: 1, 1: 2 } };
    go("risk");
    const q0 = $("#riskq_0") as HTMLDetailsElement, q2 = $("#riskq_2") as HTMLDetailsElement;
    expect(q0.tagName).toBe("DETAILS");
    expect(q0.open).toBe(false);
    expect(q0.querySelector(".riskans")?.textContent).toBe(String(w.RISK_Q[0].o[1]));
    expect(q2.open, "未答的要攤開").toBe(true);
    w.focusRiskQ(0);
    expect(($("#riskq_0") as HTMLDetailsElement).open).toBe(true);
    w.render();
    expect(($("#riskq_0") as HTMLDetailsElement).open, "打開過的重畫後還開著").toBe(true);
  });
});

describe("foldKeep：收起且記得展開狀態", () => {
  const cases: [string, string, string][] = [
    ["finance", "finCeil", "收入的彈性上限"], ["finance", "finShort", "短期資金需求"],
    ["family", "tree", "家族族譜"], ["intent", "money", "理財模式評估"], ["intent", "pending", "待補齊清單"],
    ["retire", "prepared", "已準備退休金"],
  ];
  for (const [tab, key, title] of cases) {
    it(`${tab} 的「${title}」預設收著，開了重畫不會關`, () => {
      go(tab);
      const d = $(`details[data-fk="${key}"]`) as HTMLDetailsElement;
      expect(d, key).toBeTruthy();
      expect(d.open).toBe(false);
      expect(d.querySelector("summary")?.textContent).toContain(title);
      d.open = true; d.dispatchEvent(new w.Event("toggle"));
      w.render();
      expect(($(`details[data-fk="${key}"]`) as HTMLDetailsElement).open).toBe(true);
    });
  }

  it("ivGoto 到理財模式會先把折疊卡打開", () => {
    go("intent");
    w.ivGoto("money");
    return new Promise<void>((r) => setTimeout(() => {
      expect(($('details[data-fk="money"]') as HTMLDetailsElement).open).toBe(true);
      r();
    }, 80));
  });
});

describe("調整方案：首屏之外全收", () => {
  it("沒有任何 details 預設是開的", () => {
    go("plan");
    expect($$('[data-ivsec="planact"] details[open]').length).toBe(0);
    expect($("#app").textContent).toContain("調整動作清單（");
  });
});
