import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import {
  RISK_QUESTIONS, RISK_TIERS, scoreAnswers, tierOf, normalizeAnswers, answerList, questionScore,
} from "./riskQuiz";

/**
 * 投資風險屬性測驗：伺服器端鏡像 ↔ lantu-app.html 的對拍。
 *
 * 為什麼需要：2026/09/01 起「教練可以邀請客戶自己填」——客戶端是 React 頁面，
 * 畫不到 iframe 裡的閉包，而且分數一定要由伺服器算（客戶送上來的只是選項索引）。
 * 於是同一份題庫有兩個實作，就跟 taiwan.ts / analysisModules.ts 一樣要有守門員。
 *
 * ⚠️⚠️ 題目的**索引就是主鍵**：作答存成 { "0": 3, "6": [1,2] }。
 *    調換順序＝舊作答靜靜對到別題，所以連順序都要逐題比對。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
});

describe("題庫兩邊逐字一致", () => {
  it("題數與順序一樣", () => {
    expect(w.RISK_Q.length).toBe(RISK_QUESTIONS.length);
    expect(RISK_QUESTIONS.length).toBe(12);
  });

  it("每一題的題幹、複選旗標、選項與配分都一樣", () => {
    RISK_QUESTIONS.forEach((q, i) => {
      const j = w.RISK_Q[i];
      expect(j.q, `第 ${i + 1} 題題幹`).toBe(q.q);
      expect(!!j.multi, `第 ${i + 1} 題複選旗標`).toBe(!!q.multi);
      expect(j.o.length, `第 ${i + 1} 題選項數`).toBe(q.o.length);
      q.o.forEach((o, oi) => {
        expect(j.o[oi][0], `第 ${i + 1} 題第 ${oi + 1} 個選項`).toBe(o[0]);
        expect(j.o[oi][1], `第 ${i + 1} 題第 ${oi + 1} 個配分`).toBe(o[1]);
      });
    });
  });

  it("提示文字也一樣（那是題目的一部分，客戶端要看得到同一句）", () => {
    RISK_QUESTIONS.forEach((q, i) => {
      expect(w.RISK_Q[i].hint ?? undefined, `第 ${i + 1} 題 hint`).toBe(q.hint ?? undefined);
    });
  });

  it("四個分級與門檻一樣", () => {
    expect(w.RISK_TIERS.length).toBe(RISK_TIERS.length);
    RISK_TIERS.forEach((t, i) => {
      const j = w.RISK_TIERS[i];
      expect([j.min, j.max, j.name, j.en, j.rr, j.std]).toEqual([t.min, t.max, t.name, t.en, t.rr, t.std]);
    });
  });
});

describe("計分兩邊算出同一個數字", () => {
  const CASES: Record<string, number | number[]>[] = [
    { "0": 4, "1": 3, "2": 2, "3": 1, "4": 0, "5": 4, "6": [0, 2], "7": [3], "8": 2, "9": 1, "10": 0, "11": 3 },
    { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": [0], "7": [0], "8": 0, "9": 0, "10": 0, "11": 0 },
    { "0": 4, "1": 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": [4], "7": [4], "8": 4, "9": 4, "10": 4, "11": 4 },
  ];
  it.each(CASES.map((a, i) => [i, a] as const))("第 %i 組作答，兩邊同分", (_i, ans) => {
    const mine = scoreAnswers(ans);
    const theirs = w.riskScore({ riskQuiz: { ans } });
    expect(mine.score).toBe(theirs.score);
    expect(mine.answered).toBe(theirs.answered);
  });

  it("滿分 60、最低 12（複選取最高分，所以複選不會膨脹總分）", () => {
    expect(scoreAnswers(CASES[2]).score).toBe(60);
    expect(scoreAnswers(CASES[1]).score).toBe(12);
    // 複選勾好幾個仍然只算最高的那一個
    const many = { ...CASES[2], "6": [0, 1, 2, 3, 4] };
    expect(scoreAnswers(many).score).toBe(60);
  });

  it("等級兩邊一致", () => {
    for (const s of [12, 23, 24, 35, 36, 47, 48, 60]) {
      const ansAll = Object.fromEntries(RISK_QUESTIONS.map((_, i) => [String(i), 0]));
      void ansAll;
      expect(tierOf(s).name).toBe(w.RISK_TIERS.filter((t: { min: number }) => s >= t.min).slice(-1)[0].name);
    }
  });

  it("沒答完就沒有等級（跟 html 的 riskProfile 同一條規則）", () => {
    const partial = { "0": 4, "1": 3 };
    expect(scoreAnswers(partial).answered).toBeLessThan(12);
    expect(w.riskProfile({ riskQuiz: { ans: partial } })).toBeNull();
  });
});

describe("客戶送上來的東西要先洗過", () => {
  it("超出範圍的索引一律丟掉，不會變成 NaN 混進總分", () => {
    const dirty = { "0": 99, "1": -1, "2": "3", "3": null, "99": 1 };
    const clean = normalizeAnswers(dirty);
    expect(clean["0"]).toBeUndefined();
    expect(clean["1"]).toBeUndefined();
    expect(clean["2"]).toBeUndefined();      // 字串不算數字索引
    expect(clean["99"]).toBeUndefined();     // 沒有第 100 題
    expect(Number.isFinite(scoreAnswers(clean).score)).toBe(true);
  });

  it("單選題送陣列只取第一個，複選題送單值也接得住", () => {
    expect(normalizeAnswers({ "0": [2, 3] })["0"]).toBe(2);
    expect(normalizeAnswers({ "6": 3 })["6"]).toEqual([3]);
  });

  it("複選題會去重並排序（同一個選項按兩下不會多算一次）", () => {
    expect(normalizeAnswers({ "6": [3, 1, 3] })["6"]).toEqual([1, 3]);
  });

  it("整包不是物件時回空的，不要炸掉", () => {
    expect(normalizeAnswers(null)).toEqual({});
    expect(normalizeAnswers("x")).toEqual({});
    expect(normalizeAnswers(42)).toEqual({});
  });

  it("answerList / questionScore 對空值是安全的", () => {
    expect(answerList(null, 0)).toEqual([]);
    expect(answerList({}, 5)).toEqual([]);
    expect(questionScore(99, [0])).toBe(0);
    expect(questionScore(0, [])).toBe(0);
  });
});
