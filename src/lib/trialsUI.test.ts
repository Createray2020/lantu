/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 方案比較 v2（2026/10/27 Ray 定案）——存方案＝整份快照、命名不用流水號、重名擋存、上限 5、
 * 採用＝正式層（報告書／客戶端／真實追蹤只讀它）、工作區可從原始或任一方案出發再改。
 *
 * 守的是：
 *  1. 快照含動作清單與 plan 層，不只六根槓桿；載入來改整份回來。
 *  2. 預設名稱帶第一個沒用掉的字母；重名擋；第 6 組擋。
 *  3. adoptedCase：沒有 adopted 回 c 本身（舊客戶一位不動）；有 adopted 回正式層，工作區改了不影響。
 *  4. 方案比較在頁首，不在「更多診斷」折疊裡；6′ 閘門有「存成方案」。
 */
let w: any;
const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

beforeAll(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  w.alert = () => {};
  w.confirm = () => true;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "plan";
});

const fresh = () => {
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.app.trialNaming = null;
  w.render();
  return w.app.cases[0];
};
const pane = () => w.document.querySelector("#app").innerHTML as string;
const addAction = (c: any, name: string, monthly: number) => {
  c.actions = c.actions || [];
  const A = Number(c.profile.age) || 40;   // payFrom／payTo 是年齡，不是年數
  c.actions.push({ id: w.actId(), on: true, cat: "regular", lane: "income-invest", name, payMonthly: monthly, payFrom: A + 1, payTo: A + 20, growth: 3, divMode: "reinvest", src: "月結餘", startY: A + 1 });
};

describe("快照與命名", () => {
  let c: any;
  beforeEach(() => { c = fresh(); });

  it("存方案存的是整份：動作清單＋plan 層，不只槓桿", () => {
    addAction(c, "定期定額 A", 5000);
    c.plan = c.plan || {};
    c.plan.draft = { income: 10 };
    c.plan.movableToOverseas = 1234;
    w.save();
    expect(w.saveTrial("方案 A")).toBe(true);
    const t = c.plan.trials[0];
    expect(t.label).toBe("方案 A");
    expect(t.id).toBeTruthy();
    expect(t.snap.actions.length).toBe(1);
    expect(t.snap.actions[0].name).toBe("定期定額 A");
    expect(t.snap.plan.draft).toEqual({ income: 10 });
    expect(t.snap.plan.movableToOverseas).toBe(1234);
    expect(t.score).toHaveProperty("gap");
    expect(t.score.acts).toBe(1);
    expect(c.plan.base.trialId).toBe(t.id);
  });

  it("預設名稱帶第一個沒用掉的字母；重名擋存；上限 5 組", () => {
    expect(w.trialDefaultName(c)).toBe("方案 A");
    expect(w.saveTrial("方案 A")).toBe(true);
    expect(w.trialDefaultName(c)).toBe("方案 B");
    expect(w.saveTrial("方案 A")).toBe(false);          // 重名
    expect(c.plan.trials.length).toBe(1);
    expect(w.saveTrial("")).toBe(false);                 // 空白
    ["方案 B", "方案 C", "方案 D", "方案 E"].forEach((nm) => expect(w.saveTrial(nm)).toBe(true));
    expect(c.plan.trials.length).toBe(5);
    expect(w.saveTrial("方案 F")).toBe(false);           // 第 6 組
    expect(c.plan.trials.length).toBe(5);
    // 刪掉 B 之後預設名回到 B（不是流水號）
    w.delTrial(1);
    expect(w.trialDefaultName(c)).toBe("方案 B");
  });

  it("命名視窗：trialAskSave 帶預設名，重名時留在視窗並顯示錯誤", () => {
    w.saveTrial("方案 A");
    w.trialAskSave();
    expect(w.app.trialNaming.name).toBe("方案 B");
    expect(w.document.getElementById("trialMask")).toBeTruthy();
    w.trialNamingSet("方案 A");
    w.saveTrial();
    expect(w.app.trialNaming).toBeTruthy();
    expect(w.app.trialNaming.err).toContain("已經存在");
    expect(c.plan.trials.length).toBe(1);
    w.trialNamingSet("方案 B");
    w.saveTrial();
    expect(w.app.trialNaming).toBeNull();
    expect(c.plan.trials.length).toBe(2);
    expect(w.document.getElementById("trialMask")).toBeNull();
  });

  it("載入來改＝整份回到工作區；回到原始＝清空工作區，已存的方案不動", () => {
    addAction(c, "定期定額 A", 5000);
    w.save();
    w.saveTrial("方案 A");
    // 在 A 之上改成 B
    addAction(c, "定期定額 B", 3000);
    w.save();
    w.saveTrial("方案 B");
    expect(c.plan.trials[1].from).toBe(c.plan.trials[0].id);
    expect(c.actions.length).toBe(2);
    w.useTrial(0);
    expect(c.actions.length).toBe(1);
    expect(c.actions[0].name).toBe("定期定額 A");
    expect(w.trialWorkState(c).text).toContain("＝ 方案 A");
    addAction(c, "再加一條", 1000);
    expect(w.trialWorkState(c).text).toContain("自 方案 A 修改中");
    w.trialReset();
    expect(c.actions.length).toBe(0);
    expect(c.plan.base.trialId).toBeNull();
    expect(w.trialWorkState(c).text).toContain("原始");
    expect(c.plan.trials.length).toBe(2);
    expect(c.plan.trials[0].snap.actions.length).toBe(1);
  });

  it("舊格式（只有 levers）的方案在 migrateCase 包成快照、補 id、標 legacy", () => {
    const raw = w.sampleCase();
    raw.plan = { trials: [{ label: "方案 A", levers: { income: 5 }, gap: 100, at: "2026-09-01" }] };
    const m = w.migrateCase(raw);
    const t = m.plan.trials[0];
    expect(t.id).toBeTruthy();
    expect(t.legacy).toBe(true);
    expect(t.snap.plan.draft).toEqual({ income: 5 });
    expect(t.snap.actions).toEqual([]);
  });
});

describe("正式層 adoptedCase", () => {
  let c: any;
  beforeEach(() => { c = fresh(); });

  it("沒有 adopted：回 c 本身，舊客戶數字一位不動", () => {
    expect(w.adoptedCase(c)).toBe(c);
    addAction(c, "x", 5000);
    expect(w.adoptedCase(c)).toBe(c);
  });

  it("採用後：工作區再改，adoptedCase 仍是採用那一份；取消採用回到未調整", () => {
    addAction(c, "定期定額 A", 5000);
    w.save();
    w.saveTrial("方案 A");
    w.adoptTrial(0);
    expect(c.plan.adopted.trialId).toBe(c.plan.trials[0].id);
    expect(c.plan.adopted.label).toBe("方案 A");
    const endTotal = (x: any) => w.projection(x).rows.slice(-1)[0].total;   // sampleCase 本來就沒缺口，拿期末總資產比
    const totA = endTotal(w.adoptedCase(c));
    // 工作區加一條大動作
    addAction(c, "定期定額 大", 50000);
    w.save();
    expect(endTotal(c)).not.toBe(totA);
    expect(endTotal(w.adoptedCase(c))).toBe(totA);
    expect(w.adoptedCase(c)).not.toBe(c);
    expect(w.adoptedCase(c).actions.length).toBe(1);
    // 正式方案不能刪
    w.delTrial(0);
    expect(c.plan.trials.length).toBe(1);
    w.unadoptTrial();
    expect(c.plan.adopted).toBeUndefined();
    expect(w.adoptedCase(c)).toBe(c);
  });

  it("改名會同步到 adopted.label；重名改不過去", () => {
    w.saveTrial("方案 A");
    w.saveTrial("方案 B");
    w.adoptTrial(0);
    w.renameTrial(0, "穩健版");
    expect(c.plan.trials[0].label).toBe("穩健版");
    expect(c.plan.adopted.label).toBe("穩健版");
    w.renameTrial(1, "穩健版");
    expect(c.plan.trials[1].label).toBe("方案 B");
  });

  it("報告分頁與客戶端讀正式層：工作區的動作不會出現在方案書裡", () => {
    addAction(c, "正式那一條", 5000);
    w.save();
    w.saveTrial("方案 A");
    w.adoptTrial(0);
    addAction(c, "工作區偷加的", 7000);
    w.save();
    w.app.activeTab = "report";
    w.app.reportDoc = "plan";
    w.render();
    const rep = pane();
    expect(rep).toContain("正式那一條");
    expect(rep).not.toContain("工作區偷加的");
    w.app.activeTab = "plan";
    w.app.reportDoc = "family";
    w.render();
  });
});

describe("版面", () => {
  it("方案比較在頁首、不在折疊裡；卡片有四個數字與採用鈕；6′ 閘門有存成方案", () => {
    const c = fresh();
    const h0 = pane();
    expect(h0.indexOf('id="trialsSec"')).toBeLessThan(h0.indexOf("<details"));
    expect(h0).not.toContain("教練多次模擬的收納處");
    expect(h0).toContain("尚未採用");
    w.saveTrial("方案 A");
    w.adoptTrial(0);
    const h = pane();
    expect(h).toContain("★ 正式");
    expect(h).toContain("剩餘缺口");
    expect(h).toContain("願景達成");
    expect(h).toContain("載入來改");
    expect(h).toContain("取消採用");
    expect(h).toContain("＝ 方案 A（未改）");
    // 6′ 閘門
    c.flow = { track: "gap", step: "S6x", decisions: {} };
    w.save(); w.render();
    const h2 = pane();
    expect(h2).toContain("trialAskSave()");
    expect(h2).toContain("進入執行期");
  });
});
