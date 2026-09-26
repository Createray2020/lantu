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
["intent", "money", "理財模式評估"], ["intent", "pending", "待補齊清單"],
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

describe("家庭／參數：族譜當主體，底下只出點到的那一位", () => {
  it("族譜常駐（不折疊）；預設選本人；點別人底下就換卡；＋新增家庭成員自動選到新的人", () => {
    w.app.treeSel = "";
    go("family");
    expect($('details[data-fk="tree"]'), "族譜不再折疊").toBeNull();
    expect($(".sec h4")?.textContent ?? $("#app").textContent).toBeTruthy();
    const c = w.activeCase();
    const self = c.members.find((m: { role: string }) => m.role === "本人");
    expect($$(".pcard").length).toBe(1);
    expect($$(".pcard")[0].id).toBe("pc-" + self.mid);
    const other = c.members.find((m: { role: string }) => m.role !== "本人");
    w.treeSel(other.mid);
    expect($$(".pcard").length).toBe(1);
    expect($$(".pcard")[0].id).toBe("pc-" + other.mid);
    expect($("#app").textContent).toContain("目前顯示");
    const n0 = c.members.length;
    w.addRow("members");
    expect(c.members.length).toBe(n0 + 1);
    expect(w.app.treeSel).toBe(c.members[n0].mid);
    expect($$(".pcard")[0].id).toBe("pc-" + c.members[n0].mid);
    w.app.treeSel = "";
  });
});

describe("目標／置產：上面點群，底下只出那一群", () => {
  it("四張群卡；底下只有選到那一群的列；購屋群帶持有成本與購置試算；群內新增直接帶型別", () => {
    w.GOAL_SEL = "";
    const c = w.activeCase();
    c.goals = [
      { on: true, name: "換屋", type: "購屋", present: 12000000, start: 50, end: 50, freq: 0, growth: "固定", imp: 4 },
      { on: true, name: "購車", type: "購車", present: 1000000, start: 45, end: 45, freq: 0, growth: "通膨", imp: 3 },
      { on: true, name: "創業金", type: "創業", present: 500000, start: 48, end: 48, freq: 0, growth: "通膨", imp: 2 },
    ];
    go("goals");
    expect($$("#goalNav .grp").map((e) => e.dataset.g)).toEqual(["house", "car", "care", "other"]);
    expect($$("#goalNav .grp.on").map((e) => e.dataset.g)).toEqual(["house"]);
    const rowsIn = () => $$('.goalgrp table tr:not(.addtr) td:nth-child(2) input').map((e: HTMLInputElement) => e.value);
    expect(rowsIn()).toEqual(["換屋"]);
    expect($("#app").textContent).toContain("買房之後的持有成本");
    expect($("#app").textContent).toContain("購置試算");
    expect($("#app").textContent).not.toContain("買車之後的持有成本");
    w.goalPick("car");
    expect(rowsIn()).toEqual(["購車"]);
    expect($("#app").textContent).toContain("買車之後的持有成本");
    w.goalPick("other");
    expect(rowsIn()).toEqual(["創業金"]);
    // 群內改欄位寫到正確的那一列（索引是原陣列的）
    const nameInput = $('.goalgrp table td:nth-child(2) input') as HTMLInputElement;
    nameInput.value = "開店"; nameInput.dispatchEvent(new w.Event("change"));
    expect(c.goals[2].name).toBe("開店");
    w.addGoalInGroup("care");
    expect(c.goals[3].type).toBe("孝親");
    expect(w.GOAL_SEL).toBe("care");
    expect(rowsIn().length).toBe(1);
    w.GOAL_SEL = "";
  });

  it("gotoGoal／addGoalRowFor 會先切到該目標的群", () => {
    w.GOAL_SEL = "";
    w.gotoGoal("購車規劃");
    expect(w.GOAL_SEL).toBe("car");
    w.addGoalRowFor("孝親規劃");
    expect(w.GOAL_SEL).toBe("care");
    w.GOAL_SEL = "";
  });
});

describe("資料分頁下拉：項目分組顯示（純顯示層）", () => {
  it("①②③ 各有小標題，項目一個不少、順序照分組；方案·追蹤不分", () => {
    go("family");
    const menus = $$("#app .dmenu");
    const catsOf = (i: number) => [...menus[i].querySelectorAll(".dmcat")].map((e) => e.textContent);
    expect(catsOf(0)).toEqual(["這個家", "想法與習慣", "參數"]);
    expect(catsOf(1)).toEqual(["人生階段", "置產", "家庭", "生活願望"]);
    expect(catsOf(2)).toEqual(["收支", "資產負債", "稅賦", "風險與保障"]);
    for (let g = 1; g <= 3; g++) {
      const shown = [...menus[g - 1].querySelectorAll(".ivt")].map((e) => (e as HTMLElement).dataset.ivk);
      const all = w.INTERVIEW_STEPS.filter((s: { g: number }) => s.g === g).map((s: { k: string }) => s.k);
      expect(shown.sort()).toEqual(all.sort());
      expect(menus[g - 1].querySelector(".dmcat")?.textContent).not.toBe("其他");
    }
    const names2 = [...menus[1].querySelectorAll(".ivt")].map((e) => e.textContent?.replace("新", ""));
    expect(names2.slice(0, 3)).toEqual(["職涯規劃", "退休規劃", "傳承規劃"]);
    const last = menus[menus.length - 1];
    expect(last.querySelectorAll(".dmcat").length).toBe(0);
  });
});
