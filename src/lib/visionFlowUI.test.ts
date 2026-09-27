/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { FLOW_STEPS_GAP, FLOW_STEPS_SUR, FLOW_LANES } from "./visionFlow";

/**
 * 願景處理流程（2026/09/27）——調整方案頁的步進器與後果引擎。
 *
 * 守的是四件事：
 *  1. 沒有 c.flow 的舊客戶，/plan 長得跟 v2 一模一樣（只多一顆入口），投影數字一位不動。
 *  2. 流程狀態只前進靠閘門決定；每個閘門決定都留紀錄（decisions）。
 *  3. 後果引擎 consequences() 只回清單、不改 c；applyConsequences() 才寫入並打 byConsequence 印記。
 *  4. 理財收入的三個前提（月結餘／可投資水位／可貸款資產）算得出來，且 TS 鏡射常數與 HTML 一致。
 */
let w: any;
const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

beforeAll(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = "plan";
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

const cur = () => w.app.cases[0];
const pane = () => w.document.querySelector("#app").innerHTML as string;
const v2Folds = ["缺口配額對帳", "調整動作清單", "資金勾稽", "動作流程", "拉桿與處方", "缺口組成與即時缺口", "建議資產配置", "方案比較", "其他方案參數"];

describe("TS 鏡射與 HTML 一致", () => {
  it("步驟常數兩邊一樣", () => {
    expect(w.FLOW_STEPS_GAP).toEqual(FLOW_STEPS_GAP.map((s) => [...s]));
    expect(w.FLOW_STEPS_SUR).toEqual(FLOW_STEPS_SUR.map((s) => [...s]));
    expect(w.FLOW_LANES).toEqual(FLOW_LANES);
  });
});

describe("舊客戶（沒有 c.flow）", () => {
  it("/plan 有入口、九個 v2 折疊原樣、沒有步進器", () => {
    const h = pane();
    expect(cur().flow).toBeUndefined();
    expect(h).toContain("開始願景處理流程");
    expect(h).not.toContain('class="flowrail"');
    v2Folds.forEach((t) => expect(h).toContain(t));
  });
  it("投影數字不因流程程式碼存在而改變（加了 c.flow 再拿掉也一樣）", () => {
    const c = cur();
    const before = w.projection(c).shortPV;
    c.flow = { track: "gap", step: "S0", decisions: {} };
    expect(w.projection(c).shortPV).toBe(before);
    delete c.flow;
    expect(w.projection(c).shortPV).toBe(before);
  });
});

describe("Step 0 判定", () => {
  it("範例客戶有缺口 → 缺口線；保守情境的缺口 ≥ 客戶假設的缺口", () => {
    const T = w.flowTrack(cur());
    expect(T.track).toBe("gap");
    expect(T.cons.shortPV).toBeGreaterThanOrEqual(T.proj.shortPV);
    expect(T.need).toBeGreaterThan(0);
  });
  it("把願景全部拿掉、現金給足 → 餘裕線", () => {
    const c = JSON.parse(JSON.stringify(cur()));
    c.goals = []; c.travel = []; c.hobby = []; c.luxury = []; c.education = []; c.legacy = { on: false };
    c.assets = [{ name: "現金", cls: "流動", value: 300000000 }];
    const T = w.flowTrack(c);
    expect(T.track).toBe("surplus");
    expect(T.surplus).toBeGreaterThan(0);
  });
});

describe("流程推進與閘門", () => {
  it("flowStart 建 c.flow 並畫出步進器；v2 折疊收進「更多診斷」但一個不少", () => {
    w.flowStart();
    const c = cur();
    expect(c.flow.track).toBe("gap");
    expect(c.flow.step).toBe("S0");
    const h = pane();
    expect(h).toContain('id="flowSec"');
    expect(h).toContain("更多診斷");
    v2Folds.forEach((t) => expect(h).toContain(t));
    expect(h).not.toContain('onclick="flowStart()"');
  });
  it("S0 → S1 顯示三個數字與受影響願景；D1 決定寫進 decisions 並前進到 S2", () => {
    w.flowGo("S1");
    expect(pane()).toContain("首次入不敷出");
    const G = w.gapView(cur());
    expect(G.items.length).toBeGreaterThan(0);
    expect(G.items[0].pos).toBe(1);
    w.flowDecide("S1", "d1", { ok: true }, "客戶確認願景", "S2");
    expect(cur().flow.step).toBe("S2");
    expect(cur().flow.decisions.d1.ok).toBe(true);
    expect(cur().flow.decisions.d1.step).toBe("S1");
    expect(pane()).toContain("這一場的決定");
  });
  it("S2 鎖定願景 → visionLock 有順序印記，前進到 S2′", () => {
    w.flowLockVision();
    const f = cur().flow;
    expect(f.step).toBe("S2g");
    expect(Array.isArray(f.visionLock.order)).toBe(true);
    expect(f.visionLock.order.length).toBeGreaterThan(0);
  });
  it("S2′ 護欄：guardCheck 一定有預備金那一列；列入行動清單會長出 lane=guard 的動作", () => {
    const G = w.guardCheck(cur());
    expect(G.rows.some((r: any) => r.kind === "reserve")).toBe(true);
    const idx = G.rows.findIndex((r: any) => r.gap > 0);
    if (idx >= 0) {
      const before = (cur().actions || []).length;
      w.flowAddGuard(idx);
      expect(cur().actions.length).toBe(before + 1);
      expect(cur().actions[before].lane).toBe("guard");
      expect(w.guardActionExists(cur(), G.rows[idx])).toBe(true);
    }
  });
  it("S3 階段目標：stagesOf 依願景事件切段、年齡連續；定案寫進 c.stages 並前進到 S4", () => {
    w.flowGo("S3");
    const st = w.stagesOf(cur());
    expect(st.length).toBeGreaterThan(0);
    for (let i = 1; i < st.length; i++) expect(st[i].fromAge).toBe(st[i - 1].toAge + 1);
    w.flowConfirmStages();
    expect(cur().stages.length).toBe(st.length);
    expect(cur().flow.step).toBe("S4");
    expect(pane()).toContain("教練建議");
  });
  it("S4 routeSim 兩條路都有反解；D2 先收入 → S5A", () => {
    const RS = w.routeSim(cur());
    expect(RS.income.id).toBe("income");
    expect(RS.expense.id).toBe("expense");
    w.flowDecide("S4", "d2", { first: "income" }, "先收入", "S5A");
    expect(cur().flow.step).toBe("S5A");
    expect(pane()).toContain("A-1 工作收入");
  });
  it("S5A：investGate 三個數字；新增的收入動作帶 lane 與 stageId", () => {
    const IG = w.investGate(cur());
    expect(typeof IG.monthLeft).toBe("number");
    expect(typeof IG.investable).toBe("number");
    expect(IG.loanable).toBeGreaterThanOrEqual(0);
    const before = cur().actions.length;
    w.flowAddAction("income", "income-work", "晉升");
    const a = cur().actions[before];
    expect(a.lane).toBe("income-work");
    expect(a.cat).toBe("income");
    expect(a.stageId).toBe(w.flowCurrentStage(cur()).id);
    w.flowSub("a2");
    expect(pane()).toContain("可投資水位");
  });
  it("S5B：客戶標「放一半」長出 ref 到該列的 expense 動作；勾結餘回流長出專屬定期定額；改回「留」就關掉", () => {
    w.flowDecide("S5A", "d5a", { closed: false, reason: "short" }, "沒補平", "S5B");
    expect(cur().flow.step).toBe("S5B");
    const c = cur();
    const i = c.expenses.findIndex((e: any) => w.isLivingCat(e.cat) && w.n(e.amount) > 0);
    expect(i).toBeGreaterThanOrEqual(0);
    w.flowExpMark(i, "half");
    const act = c.actions.find((a: any) => a.cat === "expense" && a.ref === "expenses:" + i);
    expect(act).toBeTruthy();
    expect(act.getMonthly).toBe(Math.round(w.n(c.expenses[i].amount) / 12 * 0.5));
    expect(w.flowExpMode(c, i)).toBe("half");
    w.flowToggleReflow(true);
    const rf = c.actions.find((a: any) => a.flowKey === "reflow");
    expect(rf.on).toBe(true);
    expect(rf.payMonthly).toBe(act.getMonthly);
    w.flowExpMark(i, "keep");
    expect(w.flowExpMode(c, i)).toBe("keep");
    expect(c.actions.find((a: any) => a.flowKey === "reflow").on).toBe(false);
  });
});

describe("Step 6 後果引擎", () => {
  it("consequences() 只回清單、不改 c；有缺口時清單非空且從最低順位開始", () => {
    const c = cur();
    const snap = JSON.stringify(c);
    const C = w.consequences(c);
    expect(JSON.stringify(c)).toBe(snap);
    if (w.projection(c).shortPV > 0.5) {
      expect(C.items.length).toBeGreaterThan(0);
      const list = w.flowVisionList(c);
      expect(C.items[0].pos).toBe(list[list.length - 1].pos);
      C.items.forEach((d: any) => expect(["delay", "downgrade", "drop", "unsolved"]).toContain(d.kind));
    }
  });
  it("applyConsequences() 才寫入，並在該願景打 byConsequence 印記、記到 c.consequences", () => {
    const c = JSON.parse(JSON.stringify(cur()));
    const C = w.consequences(c);
    const written = C.items.filter((d: any) => d.kind !== "unsolved");
    if (!written.length) return;
    w.applyConsequences(c, C.items, { sessionId: "s1" });
    expect(c.consequences.items.length).toBe(C.items.length);
    expect(c.consequences.sessionId).toBe("s1");
    const d = written[0];
    const tgt = d.itemKind === "legacy" ? c.legacy : d.itemKind === "retire" ? c.profile : c[d.ref.arr][d.ref.i];
    expect(tgt.byConsequence.kind).toBe(d.kind);
    if (d.kind === "delay") expect(d.to).toBe(d.from + d.years);
    if (d.kind === "drop" && d.itemKind !== "retire") expect(tgt.on).toBe(false);
  });
  it("延後是整數年、不設上限（可以掃到一生盡頭）", () => {
    const c = JSON.parse(JSON.stringify(cur()));
    c.actions = [];
    const C = w.consequences(c);
    C.items.filter((d: any) => d.kind === "delay").forEach((d: any) => {
      expect(Number.isInteger(d.years)).toBe(true);
      expect(d.to).toBeLessThanOrEqual(w.effHorizon(c));
    });
  });
  it("S6 畫面：時間軸畫出後果旗（只在方案頁那一張）；接受後前進到 S6′ 並出行動清單", () => {
    w.flowGo("S6");
    expect(pane()).toContain("D3");
    const C = w.consequences(cur());
    if (C.items.length) {
      expect(w.app._flowCons.items.length).toBe(C.items.length);
      expect(w.visionTimelineSVG(cur(), "dark", "plan")).toContain('class="vtcons"');
      expect(w.visionTimelineSVG(cur(), "light", "rp")).not.toContain('class="vtcons"');
      w.flowAcceptConsequences();
    } else w.flowDecide("S6", "d3", { choice: "accept", n: 0 }, "無後果", "S6x");
    expect(cur().flow.step).toBe("S6x");
    expect(w.app._flowCons).toBeNull();
    expect(pane()).toContain("行動清單與下一步");
    expect(pane()).toContain("進入執行期");
  });
});

describe("Step 7–8 執行期與回訪對帳", () => {
  it("進入執行期存下規劃線基準，每個啟用動作都有 status", () => {
    w.flowStartExec();
    const f = cur().flow;
    expect(f.step).toBe("S7");
    expect(f.baseline.rows.length).toBeGreaterThan(0);
    expect(f.baseline.rows[0].age).toBe(w.n(cur().profile.age));
    cur().actions.filter((a: any) => a.on !== false).forEach((a: any) => expect(a.status.state).toBe("planned"));
    expect(pane()).toContain("回訪對帳");
  });
  it("標動作狀態；checkin 以里程碑為主、動作數並列", () => {
    const c = cur();
    const idx = c.actions.findIndex((a: any) => a.on !== false);
    w.flowSetStatus(idx, "done");
    expect(c.actions[idx].status.state).toBe("done");
    const K = w.checkin(c);
    expect(K.cnt.done).toBe(1);
    expect(K.planned).not.toBeNull();
    expect(K.ratio).toBeGreaterThan(0);
    expect(["done", "partial", "none"]).toContain(K.grade);
  });
  it("D4 到位 → 階段標 reached、回 S3；完全沒動 → 先問願景", () => {
    w.flowGo("S8");
    expect(pane()).toContain("D4");
    w.flowD4("done");
    expect(["S3", "S0", "P0"]).toContain(cur().flow.step);
    if (cur().flow.step === "S3") expect(cur().stages.some((s: any) => s.status === "reached")).toBe(true);
    w.flowGo("S8");
    w.flowD4("none");
    expect(cur().flow.askVision).toBe(true);
    expect(pane()).toContain("還是你要的嗎");
    w.flowD4Vision(true);
    expect(cur().flow.step).toBe("S6");
    expect(cur().flow.askVision).toBe(false);
  });
});

describe("餘裕線 P1–P3′", () => {
  it("餘裕客戶走 P0→P1→P2→P2′→P3→P3′→S7；提早退休會改 retireAge 並記錄分配", () => {
    const c = JSON.parse(JSON.stringify(w.sampleCase()));
    c.id = "surplus1";
    c.goals = []; c.travel = []; c.hobby = []; c.luxury = []; c.education = []; c.legacy = { on: false }; c.actions = [];
    c.assets = [{ name: "現金", cls: "流動", value: 300000000 }];
    w.app.cases.push(w.migrateCase(c)); w.app.activeId = "surplus1"; w.render();
    w.flowStart();
    const cc = w.app.cases[1];
    expect(cc.flow.track).toBe("surplus");
    expect(cc.flow.step).toBe("P0");
    w.flowGo("P1");
    expect(pane()).toContain("保守假設下的餘裕");
    w.flowGo("P2");
    w.flowUpgradeVision(false);
    expect(cc.flow.step).toBe("P2g");
    w.flowGo("P3");
    expect(pane()).toContain("餘裕分配");
    const early = w.flowEarlyRetire(cc);
    expect(early).toBeGreaterThan(0);
    const rA = w.n(cc.profile.retireAge);
    w.flowApplyAdvance(1);
    expect(w.n(cc.profile.retireAge)).toBe(rA - 1);
    expect(cc.surplus.allocation[0].kind).toBe("advance");
    w.flowConfirmSurplus();
    expect(cc.flow.step).toBe("P3x");
    expect(cc.surplus.trueSurplus).toBeGreaterThan(0);
    w.flowStartExec();
    expect(cc.flow.step).toBe("S7");
    w.app.cases.pop(); w.app.activeId = w.app.cases[0].id; w.render();
  });
});

describe("訪談清單第 ④ 群：補件 → 走流程 → 定行動 → 回訪對帳", () => {
  it("四個項目名稱＝落地區塊標題；舊的「收斂與下一步」「調整方案」「真實追蹤」不再是項目", () => {
    const names = w.INTERVIEW_STEPS.filter((s: any) => s.g === 4).map((s: any) => s.name);
    expect(names).toEqual(["待補件", "願景處理流程", "行動清單與下一步", "回訪對帳"]);
    w.INTERVIEW_STEPS.filter((s: any) => ["flow", "actlist", "checkin"].includes(s.k)).forEach((s: any) => expect(s.a).toBe("#flowSec"));
    expect(pane()).not.toContain('data-ivsec="review"');
    expect(pane()).toContain('data-ivname="願景處理流程"');
  });
  it("「已談過」的判定跟著流程走：flow 有 c.flow 就算；行動清單要走到 6′ 且有下次日期；回訪要有 D4", () => {
    const c = cur();
    const st = (k: string) => w.INTERVIEW_STEPS.find((s: any) => s.k === k);
    expect(st("flow").has(c)).toBe(true);
    c.flow.step = "S6x"; delete c.flow.wrap; c.nextReview = "";
    expect(st("actlist").has(c)).toBe(false);
    w.flowSetWrap("nextDate", "2027-01-15");
    expect(c.nextReview).toBe("2027-01-15");
    expect(st("actlist").has(c)).toBe(true);
    expect(pane()).toContain("收尾三題");
    expect(st("checkin").has(c)).toBe(!!(c.flow.decisions && c.flow.decisions.d4));
  });
  it("ivGoto：行動清單項目把步進器切到 6′；回訪項目在 S7 時切到 S8", () => {
    const c = cur();
    c.flow.step = "S5B"; w.render();
    w.ivGoto("actlist");
    expect(c.flow.step).toBe("S5B");            // 沒走到 6′ 就停在目前那一步
    c.flow.step = "S7"; w.render();
    w.ivGoto("checkin");
    expect(c.flow.step).toBe("S8");
    expect(pane()).toContain("規劃線 vs 實際淨資產");
    c.flow.step = "S6x"; w.render();
  });
  it("父層回寫下次會談日期（embed）：lantu:nextreview → c.nextReview 與 wrap.nextDate", async () => {
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/?embed=1" });
    const e = dom.window as any;
    await new Promise<void>((r) => e.addEventListener("load", () => r(), { once: true }));
    e.app.role = "coach"; e.app.activeTab = "data"; e.app.dataTab = "plan";
    const cc = e.migrateCase(e.sampleCase());
    cc.flow = { track: "gap", step: "S6x", decisions: {} };
    e.app.cases = [cc]; e.app.activeId = cc.id; e.render();
    e.dispatchEvent(new e.MessageEvent("message", { data: { type: "lantu:nextreview", date: "2027-03-01" }, source: e.parent }));
    expect(cc.nextReview).toBe("2027-03-01");
    expect(cc.flow.wrap.nextDate).toBe("2027-03-01");
  });
});

describe("底列：執行期入口", () => {
  it("客戶在 S7 而人不在方案頁 → 底列多一顆「回訪對帳」；按下去跳到方案頁 S8", () => {
    const c = cur();
    c.flow.step = "S7";
    w.app.dataTab = "family"; w.render();
    const bar = () => (w.document.getElementById("lnSessBar")?.innerHTML ?? "") as string;
    expect(bar()).toContain("回訪對帳");
    w.LN.checkin();
    expect(w.app.dataTab).toBe("plan");
    expect(c.flow.step).toBe("S8");
    expect(bar()).not.toContain("回到對帳");   // 人已經在方案頁，不再重複給入口
    c.flow.step = "S6x"; w.render();
  });
});

describe("方案書與拉桿改標", () => {
  it("方案書多一章「零、我們是怎麼走到這份方案的」，含決定、階段、行動清單", () => {
    const h = w.planReportHTML(cur()) as string;
    expect(h).toContain("零、我們是怎麼走到這份方案的");
    expect(h).toContain("這一路的決定");
    expect(h).toContain("行動清單");
    const c0 = JSON.parse(JSON.stringify(cur())); delete c0.flow;
    expect(w.planReportHTML(c0)).not.toContain("零、我們是怎麼走到這份方案的");
  });
  it("有 c.flow 時：該解什麼加分工說明、調願景型改標為後果試算", () => {
    const h = pane();
    expect(h).toContain("後果槓桿");
    expect(h).toContain("後果試算（原調願景型）");
  });
});

describe("分析頁段結論", () => {
  it("⑤ 調整處方段帶出流程線與步驟", () => {
    const v = w.anGroupVerdict("rx", cur());
    expect(v.text).toContain("缺口線");
    expect(v.text).toContain("S6");
  });
});
