import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { stageOfAge, remainingStages, tuitionOf, DEFAULT_STAGES } from "./eduPlan";
import { EDU_COST_DEFAULTS } from "./eduCosts.defaults";
import { normalizeEduCost, defaultEduCosts } from "./eduCosts";

const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 子女教育：依年齡自動推學段 + 官方學費預填。
 *
 * 兩件事要守住：
 *  1. 學費參數表兩邊一致（後端 seed ↔ lantu-app.html 的 fallback）。
 *  2. 推學段的規則兩邊一致（eduPlan.ts ↔ lantu-app.html 的 eduRemainingStages）。
 *     這條規則決定「幾年後開始、還要供給幾年」，直接乘進教育金總需求，
 *     兩邊差一年，報告書上的數字就跟畫面對不起來。
 */
describe("教育費用參數表雙實作對拍", () => {
  it("EDU_COST_FALLBACK 與 eduCosts.defaults.ts 完全一致", () => {
    const m = /var EDU_COST_FALLBACK=(\[[\s\S]*?\n\]);/.exec(HTML);
    expect(m, "lantu-app.html 找不到 EDU_COST_FALLBACK").toBeTruthy();
    const html = JSON.parse(m![1]) as Array<Record<string, unknown>>;
    const ts = EDU_COST_DEFAULTS.map((s) => ({
      stage: s.stage, startAge: s.startAge, years: s.years,
      publicTuition: s.publicTuition, privateTuition: s.privateTuition,
      overseasTuition: s.overseasTuition, extraFee: s.extraFee, careFee: s.careFee,
    }));
    expect(html).toEqual(ts);
  });

  it("學段是連續且不重疊的（推學段的前提；重疊會讓同一年被算兩次）", () => {
    const sorted = [...EDU_COST_DEFAULTS].sort((a, b) => a.startAge - b.startAge);
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].startAge + sorted[i - 1].years;
      expect(sorted[i].startAge, `${sorted[i - 1].stage} → ${sorted[i].stage}`).toBe(prevEnd);
    }
  });

  it("採用的是現行法定學段名稱（幼兒園／國小），不是 2012 年就廢掉的舊稱", () => {
    const names = EDU_COST_DEFAULTS.map((s) => s.stage);
    expect(names).toContain("幼兒園");
    expect(names).toContain("國小");
    expect(names).not.toContain("幼稚園");
    expect(names).not.toContain("小學");
  });

  it("高中職學費全免、私立大專扣過 3.5 萬補助，都反映在預設值裡", () => {
    const senior = EDU_COST_DEFAULTS.find((s) => s.stage === "高中職")!;
    // 免學費之後私立高中職的自付額應該遠低於私立國中（國中沒有免學費政策）
    const junior = EDU_COST_DEFAULTS.find((s) => s.stage === "國中")!;
    expect(senior.privateTuition).toBeLessThan(junior.privateTuition / 2);
    // 私立大學扣掉 3.5 萬後，與公立的差距應該小於研究所（研究所不適用補助）
    const uni = EDU_COST_DEFAULTS.find((s) => s.stage === "大學")!;
    const grad = EDU_COST_DEFAULTS.find((s) => s.stage === "研究所")!;
    expect(uni.privateTuition - uni.publicTuition).toBeLessThan(grad.privateTuition - grad.publicTuition);
  });
});

describe("stageOfAge / remainingStages：由年齡推學段", () => {
  it("7 歲＝國小，還剩 5 年", () => {
    const s = stageOfAge(7);
    expect(s?.stage).toBe("國小");
    expect(s?.remainYears).toBe(5);
    expect(s?.current).toBe(true);
  });

  it("學段邊界：6 歲進國小、11 歲還在國小、12 歲已是國中", () => {
    expect(stageOfAge(6)?.stage).toBe("國小");
    expect(stageOfAge(11)?.stage).toBe("國小");
    expect(stageOfAge(12)?.stage).toBe("國中");
    expect(stageOfAge(17)?.stage).toBe("高中職");
    expect(stageOfAge(18)?.stage).toBe("大學");
  });

  it("學齡前與已畢業都回 null（沒有「正在讀」的學段）", () => {
    expect(stageOfAge(1)).toBeNull();
    expect(stageOfAge(40)).toBeNull();
  });

  it("7 歲、期望大學 → 只列還沒念完的四個學段，國小只算剩下的 5 年", () => {
    const rows = remainingStages(7, "大學");
    expect(rows.map((r) => r.stage)).toEqual(["國小", "國中", "高中職", "大學"]);
    expect(rows[0]).toMatchObject({ startIn: 0, remainYears: 5, current: true });
    expect(rows[1]).toMatchObject({ startIn: 5, remainYears: 3 });   // 12-7=5 年後上國中
    expect(rows[3]).toMatchObject({ startIn: 11, remainYears: 4 });  // 18-7=11 年後上大學
  });

  it("已念完的學段不會出現（付過的錢不該再列進未來需求）", () => {
    expect(remainingStages(20, "大學").map((r) => r.stage)).toEqual(["大學"]);
    expect(remainingStages(20, "大學")[0].remainYears).toBe(2); // 20→22
  });

  it("期望最高學歷決定供給到哪一段", () => {
    expect(remainingStages(7, "高中職").map((r) => r.stage)).toEqual(["國小", "國中", "高中職"]);
    expect(remainingStages(7, "研究所").map((r) => r.stage)).toContain("研究所");
    expect(remainingStages(7, "博士班").map((r) => r.stage)).toContain("博士班");
  });

  it("「支付學雜費至幾歲」會截斷後面的年份（G14）", () => {
    const rows = remainingStages(7, "大學", 20);
    expect(rows.map((r) => r.stage)).toEqual(["國小", "國中", "高中職", "大學"]);
    expect(rows[3].remainYears).toBe(2); // 大學 18–22，只供給到 20 歲 → 2 年
    // 只供給到 15 歲 → 大學整段消失
    expect(remainingStages(7, "大學", 15).map((r) => r.stage)).toEqual(["國小", "國中"]);
  });

  it("新生兒（0 歲）從幼兒園開始列，幼兒園 3 年後才開始", () => {
    const rows = remainingStages(0, "大學");
    expect(rows[0]).toMatchObject({ stage: "幼兒園", startIn: 3, remainYears: 3 });
  });

  it("期望學歷不在清單裡（後台改過學段名稱）時，一路供給到最後一段而不是整份消失", () => {
    const rows = remainingStages(7, "不存在的學歷");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].stage).toBe(DEFAULT_STAGES[DEFAULT_STAGES.length - 1].stage);
  });
});

describe("tuitionOf：公立／私立／海外取對應欄位", () => {
  it("三種學別各取各的欄位，未知學別視為公立", () => {
    const uni = EDU_COST_DEFAULTS.find((s) => s.stage === "大學")!;
    expect(tuitionOf("大學", "公立")).toBe(uni.publicTuition);
    expect(tuitionOf("大學", "私立")).toBe(uni.privateTuition);
    expect(tuitionOf("大學", "海外")).toBe(uni.overseasTuition);
    expect(tuitionOf("大學", "")).toBe(uni.publicTuition);
  });

  it("找不到學段回 0，而不是丟錯或亂猜", () => {
    expect(tuitionOf("補習班", "公立")).toBe(0);
  });
});

describe("推學段規則雙實作對拍：eduPlan.ts ↔ lantu-app.html", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;

  beforeAll(async () => {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  });

  const AGES = [0, 2, 3, 5, 6, 7, 11, 12, 14, 15, 17, 18, 21, 22, 23, 24, 27, 30];
  const TOPS = ["高中職", "大學", "研究所", "博士班"];
  const PAY_TO = [0, 15, 20, 22, 26];

  it("所有年齡 × 期望學歷 × 支付至幾歲的組合，兩邊結果完全一致", () => {
    for (const age of AGES) {
      for (const top of TOPS) {
        for (const payTo of PAY_TO) {
          const a = remainingStages(age, top, payTo);
          const b = w.eduRemainingStages(age, top, payTo);
          const key = `age=${age} top=${top} payTo=${payTo}`;
          expect(b.length, key).toBe(a.length);
          a.forEach((row, i) => {
            expect(b[i].stage, key).toBe(row.stage);
            expect(b[i].startIn, key).toBe(row.startIn);
            expect(b[i].remainYears, key).toBe(row.remainYears);
            expect(b[i].current, key).toBe(row.current);
          });
        }
      }
    }
  });

  it("stageOfAge 兩邊一致", () => {
    for (const age of AGES) {
      const a = stageOfAge(age);
      const b = w.eduStageOfAge(age);
      if (a === null) {
        expect(b, String(age)).toBeNull();
      } else {
        expect(b.stage, String(age)).toBe(a.stage);
        expect(b.remainYears, String(age)).toBe(a.remainYears);
      }
    }
  });
});

describe("normalizeEduCost：後台輸入的把關", () => {
  const base = { stage: "大學", startAge: 18, years: 4, publicTuition: 55000, privateTuition: 65000, overseasTuition: 1500000, extraFee: 15000, careFee: 260000 };

  it("正常輸入會過，來源留空存成 null", () => {
    const v = normalizeEduCost(base);
    expect(v.stage).toBe("大學");
    expect(v.source).toBeNull();
  });

  it("空白學段、負數金額、離譜年數會被擋下來", () => {
    expect(() => normalizeEduCost({ ...base, stage: " " })).toThrow("empty-stage");
    expect(() => normalizeEduCost({ ...base, publicTuition: -1 })).toThrow("invalid-publicTuition");
    expect(() => normalizeEduCost({ ...base, years: 0 })).toThrow("invalid-years");
    expect(() => normalizeEduCost({ ...base, years: 99 })).toThrow("invalid-years");
  });

  it("defaultEduCosts 每一段都帶著資料來源（數字不能來歷不明）", () => {
    for (const r of defaultEduCosts()) {
      expect(r.source, r.stage).toBeTruthy();
    }
  });
});
