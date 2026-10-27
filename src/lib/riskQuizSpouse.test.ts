/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * B-2 配偶風險屬性（2026/10/27 Ray）。
 *
 * 守的是：
 *  1. 本人那份 c.riskQuiz 原封不動：分數、等級、報告書文案一位不變；配偶作答不影響本人。
 *  2. 沒有配偶成員 → KYC 分頁與改版前一模一樣（沒有切換、沒有家庭卡）。
 *  3. 有配偶 → 「本人｜配偶」切換、兩張家庭卡、配偶題目 id 是 riskq_sp_N、RISK_OPEN 兩邊不互相干擾。
 *  4. 「套用到報酬率參數」只吃本人；退休三情境與報告書章節會標配偶的屬性。
 *  5. 客戶端那份狀態 {self,spouse} 與舊的平形狀都讀得到；套用時寫對那一份。
 */
let w: any;
beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  w.confirm = () => true;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = "risk";
});
const pane = () => w.document.querySelector("#app").innerHTML as string;
const fresh = (withSpouse: boolean) => {
  const c = w.migrateCase(w.newCase());
  c.profile.age = 40;
  if (withSpouse) {
    c.members = c.members || [];
    c.members.push({ name: "王太太", role: "配偶", gender: "女", age: 38 });
  }
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.riskWho = "self";
  w.RISK_OPEN = {};
  w.LANTU_CLIENT_QUIZ = null;
  w.render();
  return c;
};
const allAns = (v: number) => { const a: Record<number, number> = {}; for (let i = 0; i < w.RISK_Q.length; i++) a[i] = v; return a; };

describe("沒有配偶：畫面與引擎跟改版前一樣", () => {
  it("沒有切換、沒有家庭卡；riskProfile(c) 等於 riskProfile(c,'self')", () => {
    const c = fresh(false);
    const h = pane();
    expect(h).not.toContain('id="riskPair"');
    expect(h).not.toContain("riskq_sp_");
    expect(h).toContain('id="riskq_0"');
    c.riskQuiz = { ans: allAns(3) };
    expect(w.riskProfile(c).score).toBe(w.riskProfile(c, "self").score);
    expect(w.riskHasSpouse(c)).toBe(false);
    expect(c.riskQuizSpouse).toBeUndefined();
  });
});

describe("有配偶", () => {
  let c: any;
  beforeEach(() => { c = fresh(true); });

  it("家庭卡＋本人｜配偶切換；配偶題目 id 另一組", () => {
    const h = pane();
    expect(h).toContain('id="riskPair"');
    expect(h).toContain("配偶（王太太）");
    expect(h).toContain('id="riskq_0"');
    w.setRiskWho("spouse");
    const h2 = pane();
    expect(h2).toContain('id="riskq_sp_0"');
    expect(h2).not.toContain('id="riskq_0"');
    expect(h2).toContain("邀請客戶替配偶填寫");
    c.riskQuizSpouse = { ans: allAns(2) };
    w.render();
    expect(pane()).toContain("規劃參數的報酬率以本人的屬性為準");
    expect(pane()).not.toContain("applyRiskToParams()");   // 配偶那份沒有套用鈕
  });

  it("配偶作答寫進 riskQuizSpouse，本人分數一位不動；兩份各自算分、各自檢核", () => {
    c.riskQuiz = { ans: allAns(3) };
    const selfScore = w.riskScore(c).score;
    w.setRiskWho("spouse");
    for (let i = 0; i < w.RISK_Q.length; i++) w.setRiskAns(i, 0);
    expect(c.riskQuizSpouse).toBeTruthy();
    expect(Object.keys(c.riskQuizSpouse.ans).length).toBe(12);
    expect(w.riskScore(c).score).toBe(selfScore);
    expect(w.riskScore(c, "self").score).toBe(selfScore);
    expect(w.riskProfile(c, "spouse").score).toBeLessThan(selfScore);
    expect(w.riskProfile(c, "spouse").tier.name).toBe("保守型");
    expect(Array.isArray(w.riskConflicts(c, "spouse"))).toBe(true);   // 跨 realm，不能用 expect.any(Array)
    // 兩人差級的提示
    expect(pane()).toContain("配偶較保守");
  });

  it("RISK_OPEN：本人與配偶的折疊互不干擾；focusRiskQ 帶 who", () => {
    w.riskToggled({ open: true }, 2, "self");
    w.riskToggled({ open: true }, 2, "spouse");
    expect(w.RISK_OPEN[2]).toBe(1);
    expect(w.RISK_OPEN["sp2"]).toBe(1);
    w.riskToggled({ open: false }, 2, "spouse");
    expect(w.RISK_OPEN[2]).toBe(1);
    expect(w.RISK_OPEN["sp2"]).toBeUndefined();
    w.setRiskWho("spouse");
    w.focusRiskQ(5, "spouse");
    expect((w.document.getElementById("riskq_sp_5") as HTMLDetailsElement).open).toBe(true);
  });

  it("套用到報酬率參數只吃本人；退休三情境與報告書標配偶屬性", () => {
    c.riskQuiz = { ans: allAns(4) };          // 本人 60 分 → 進取型 8%（選項索引 0–4）
    c.riskQuizSpouse = { ans: allAns(0) };    // 配偶 12 分 → 保守型 3%
    w.applyRiskToParams();
    expect(c.params.invReturn).toBe(8);
    const sc = w.retireScenarios(c);
    expect(sc.find((x: any) => x.name === "保守").spouse).toBe(true);
    expect(sc.find((x: any) => x.name === "保守").mine).toBe(false);
    const rep = w.reportHTML(c) as string;
    expect(rep).toContain("配偶（王太太）依 KYC 測驗（12 / 60 分）評定為");
    expect(rep).toContain("保守型（Conservative）");
  });

  it("客戶端狀態：{self,spouse} 新形狀與舊的平形狀都讀得到；套用寫對那一份", () => {
    const row = { invitedAt: null, submittedAt: "2026-10-27T00:00:00.000Z", score: 12, tier: "保守型", answers: allAns(0) };
    w.LANTU_CLIENT_QUIZ = row;                             // 舊形狀＝本人
    expect(w.clientQuizState("self")).toBe(row);
    expect(w.clientQuizState("spouse")).toBeNull();
    w.LANTU_CLIENT_QUIZ = { self: null, spouse: row };    // 新形狀
    expect(w.clientQuizState("self")).toBeNull();
    expect(w.clientQuizState("spouse")).toBe(row);
    w.applyClientQuiz("spouse");
    expect(c.riskQuiz.ans).toEqual({});
    expect(Object.keys(c.riskQuizSpouse.ans).length).toBe(12);
    w.setRiskWho("spouse");
    expect(pane()).toContain("讓客戶替配偶填");
    expect(pane()).toContain('id="riskInviteMsg_spouse"');
  });

  it("舊資料：riskQuizSpouse 形狀壞掉時 migrateCase 正規化成 {ans:{}}；沒有時不會憑空建", () => {
    const raw = w.newCase(); raw.riskQuizSpouse = "garbage";
    expect(w.migrateCase(raw).riskQuizSpouse).toEqual({ ans: {} });
    const raw2 = w.newCase();
    expect(w.migrateCase(raw2).riskQuizSpouse).toBeUndefined();
  });
});
