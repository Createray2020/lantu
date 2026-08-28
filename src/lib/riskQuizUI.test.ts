import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 投資風險屬性測驗第 12 題改版（2026/08/28 教練回饋）。
 *
 * 舊題：「投資期間內您臨時需要動用這筆資金的可能性？」
 * 新題：「您目前的緊急預備金（可隨時動用的現金）大約可以支應幾個月的生活支出？」
 *
 * ⚠️⚠️ 地基語意：riskQuiz.ans 是用**題目索引**當 key（{0:1, 1:2, …}）。
 * 改題序或插題，既有作答會靜默對到錯的題目、分數照樣算得出來、完全不噴錯。
 * 所以這次只換第 12 題的內容，題號、選項數、滿分 60、四個分級門檻全部不動。
 *
 * 改版前已作答的 42 份規劃：分數與分級保留（兩題方向一致，不會顛倒），
 * 但打上 q12Legacy 標記提醒教練下次見面順口重問一次。
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

const fresh = () => {
  w.app.cases = [w.migrateCase(w.newCase())];
  w.app.activeId = w.app.cases[0].id;
  return w.app.cases[0];
};
const answerAll = (c: Record<string, unknown>, v = 2) => {
  const ans: Record<number, number> = {};
  for (let i = 0; i < w.RISK_Q.length; i++) ans[i] = v;
  c.riskQuiz = { ans };
};
beforeEach(() => { fresh(); });

describe("第 12 題換成緊急預備金", () => {
  it("題目與五個選項就是定案的那一版", () => {
    const Q = w.RISK_Q[11];
    expect(Q.q).toBe("您目前的緊急預備金（可隨時動用的現金）大約可以支應幾個月的生活支出？");
    expect(Q.o.map((x: [string, number]) => x[0])).toEqual([
      "沒有準備", "不到 3 個月", "3–6 個月", "6–12 個月", "12 個月以上",
    ]);
    expect(Q.o.map((x: [string, number]) => x[1])).toEqual([1, 2, 3, 4, 5]);
  });

  it("⚠️ 題數、滿分與分級門檻不准動（ans 用索引當 key）", () => {
    expect(w.RISK_Q.length).toBe(12);
    const max = w.RISK_Q.reduce(
      (s: number, Q: { o: [string, number][] }) => s + Math.max(...Q.o.map((x) => x[1])), 0);
    expect(max, "滿分仍是 60").toBe(60);
    expect(w.RISK_TIERS.map((t: { min: number }) => t.min)).toEqual([12, 24, 36, 48]);
  });

  it("方向沒有顛倒：舊題與新題都是「越有餘裕分數越高」", () => {
    // 舊題選項 3（偏低動用可能）＝4 分；新題選項 3（6–12 個月）＝4 分。
    // 所以 42 份舊作答沿用時分數完全不變，只是問的不是同一件事。
    expect(w.RISK_Q[11].o[3][1]).toBe(4);
    const c = fresh();
    answerAll(c, 2);
    expect(w.riskScore(c).score).toBe(12 * 3);
  });
});

describe("q12Legacy：舊題作答的提醒", () => {
  it("有標記且第 12 題答過 → 判定為舊題作答", () => {
    const c = fresh();
    answerAll(c);
    c.riskQuiz.q12Legacy = true;
    expect(w.q12IsLegacy(c)).toBe(true);
  });

  it("沒標記，或標記了但第 12 題根本沒答 → 不提醒", () => {
    const c = fresh();
    answerAll(c);
    expect(w.q12IsLegacy(c), "沒標記就不提醒").toBe(false);
    c.riskQuiz = { ans: { 0: 1 }, q12Legacy: true };
    expect(w.q12IsLegacy(c), "第 12 題沒答就沒有舊作答可言").toBe(false);
  });

  it("分數與分級不受標記影響（Ray 拍板：保留分數）", () => {
    const c = fresh();
    answerAll(c, 4);
    const before = w.riskProfile(c);
    c.riskQuiz.q12Legacy = true;
    const after = w.riskProfile(c);
    expect(after.score).toBe(before.score);
    expect(after.tier.name).toBe(before.tier.name);
  });

  it("教練重新作答第 12 題 → 標記自己消失", () => {
    const c = fresh();
    answerAll(c);
    c.riskQuiz.q12Legacy = true;
    w.setRiskAns(11, 4);
    expect(w.activeCase().riskQuiz.q12Legacy).toBeUndefined();
    expect(w.q12IsLegacy(w.activeCase())).toBe(false);
  });

  it("答別題不會把標記清掉（只有第 12 題算數）", () => {
    const c = fresh();
    answerAll(c);
    c.riskQuiz.q12Legacy = true;
    w.setRiskAns(3, 4);
    expect(w.q12IsLegacy(w.activeCase())).toBe(true);
  });

  it("提醒會真的印在第 12 題那一格上", () => {
    const c = fresh();
    answerAll(c);
    c.riskQuiz.q12Legacy = true;
    w.app.dataTab = "risk";
    w.render();
    const box = w.document.querySelector("#app #riskq_11");
    expect(box, "找得到第 12 題").toBeTruthy();
    expect(box.textContent).toContain("此題已改版");
    expect(box.textContent).toContain("重選一個選項");
    const clean = w.document.querySelector("#app #riskq_10");
    expect(clean.textContent, "別題不該出現提醒").not.toContain("此題已改版");
  });
});
