import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * B1「薪資補償」拆日額／月額 ＋ B3 保障缺口三個總額分開（Ray 2026/08/29 拍板）。
 *
 * 起因：incomeComp 一個欄位，三個地方三種說法——
 *   ・需求輸入標「薪資補償（日額）」
 *   ・保單欄位標「薪資補償(月)」
 *   ・引擎的單位表寫「元/月」
 * 而缺口表把這兩個直接對減。全庫實測只有 3 筆有值（60,000／40,000 顯然是月，
 * 3,000 顯然是日），保單端 0 筆。
 *
 * 拍板：需求端與保單端都拆兩欄，日對日、月對月，缺口表出兩列，
 *       **不做任何隱藏換算**；舊值一律搬到月額並標 incomeCompLegacy，
 *       ⚠️ 不依金額大小猜單位——3,000 看起來像日額，但那是猜的。
 *
 * B3：totalGap() 曾經把「元」「元/日」「元/月」直接相加（示範案 5,629,396）。
 *     改成 gapTotals() 回 {lump,daily,monthly} 三個數字，不相加；
 *     health().riskCover 只吃 lump。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blank = (): any => {
  const c = E.newCase();
  c.needs = [];
  c.policies = [];
  c.coverages = [];
  c.actions = [];
  return c;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const row = (rows: any[], kind: string) => rows.find((r) => (r.kind ?? r.item) === kind);

describe("B1 拆欄：日對日、月對月，沒有隱藏換算", () => {
  it("KINDS 有兩列薪資補償，舊的單一項目不再存在", () => {
    expect(E.KINDS).toContain("薪資補償（日）");
    expect(E.KINDS).toContain("薪資補償（月）");
    expect(E.KINDS).not.toContain("薪資補償");
    expect(E.KINDS.length).toBe(10);
    expect(w.KINDS).toEqual(E.KINDS);
  });

  it("POLICY_MAP 各自對到自己的保單欄位", () => {
    expect(E.POLICY_MAP["薪資補償（日）"]).toBe("incomeCompDay");
    expect(E.POLICY_MAP["薪資補償（月）"]).toBe("incomeCompMonth");
    expect(E.POLICY_MAP.incomeComp).toBeUndefined();
  });

  it("缺口表出兩列，日只對日、月只對月", () => {
    const c = blank();
    c.needs = [{ member: "本人", protectYears: 0, incomeCompDay: 3_000, incomeCompMonth: 60_000 }];
    c.policies = [{ insured: "本人", name: "失能扶助", premium: 0, incomeCompDay: 1_000, incomeCompMonth: 20_000 }];
    const g = E.coverageGaps(c);
    expect(row(g, "薪資補償（日）").need).toBe(3_000);
    expect(row(g, "薪資補償（日）").have).toBe(1_000);
    expect(row(g, "薪資補償（日）").gap).toBe(2_000);
    expect(row(g, "薪資補償（月）").need).toBe(60_000);
    expect(row(g, "薪資補償（月）").have).toBe(20_000);
    expect(row(g, "薪資補償（月）").gap).toBe(40_000);
  });

  it("⚠️ 沒有隱藏換算：只填月額時，日額那一列是 0，不是 60,000÷30", () => {
    const c = blank();
    c.needs = [{ member: "本人", protectYears: 0, incomeCompMonth: 60_000 }];
    const g = E.coverageGaps(c);
    expect(row(g, "薪資補償（日）").need).toBe(0);
    expect(row(g, "薪資補償（月）").need).toBe(60_000);
    // 反向也一樣
    const c2 = blank();
    c2.needs = [{ member: "本人", protectYears: 0, incomeCompDay: 3_000 }];
    expect(row(E.coverageGaps(c2), "薪資補償（月）").need).toBe(0);
  });

  it("月額的保單保額不會被日額的需求吃掉（改版前就是這樣對減的）", () => {
    const c = blank();
    c.needs = [{ member: "本人", protectYears: 0, incomeCompDay: 3_000 }];
    c.policies = [{ insured: "本人", name: "失能所得", premium: 0, incomeCompMonth: 60_000 }];
    expect(row(E.coverageGaps(c), "薪資補償（日）").gap).toBe(3_000);
  });

  it("五欄表兩列的單位各自正確", () => {
    const c = blank();
    c.needs = [{ member: "本人", protectYears: 0, incomeCompDay: 3_000, incomeCompMonth: 60_000 }];
    const rows = E.coverageCheckupRows(c);
    expect(row(rows, "薪資補償（日）").unit).toBe("元/日");
    expect(row(rows, "薪資補償（月）").unit).toBe("元/月");
    expect(row(rows, "住院醫療").unit).toBe("元/日");
    expect(row(rows, "壽險").unit).toBe("元");
  });

  it("保障準備度（coverageReadiness）也拆成兩列", () => {
    const c = w.migrateCase(w.newCase());
    c.needs = [{ member: c.members[0].name, protectYears: 0, incomeCompDay: 3_000, incomeCompMonth: 60_000 }];
    const rd = w.coverageReadinessByKind(c);
    expect(row(rd, "薪資補償（日）").need).toBe(3_000);
    expect(row(rd, "薪資補償（月）").need).toBe(60_000);
  });

  it("兩份實作對同一份資料算出同一組列", () => {
    const c = blank();
    c.needs = [{ member: "本人", protectYears: 0, incomeCompDay: 3_000, incomeCompMonth: 60_000 }];
    c.policies = [{ insured: "本人", name: "x", premium: 0, incomeCompDay: 500, incomeCompMonth: 5_000 }];
    const a = E.coverageGaps(JSON.parse(JSON.stringify(c)));
    const b = w.coverageGaps(JSON.parse(JSON.stringify(c)));
    expect(b.map((r: { kind: string }) => r.kind)).toEqual(a.map((r: { kind: string }) => r.kind));
    expect(b.map((r: { gap: number }) => r.gap)).toEqual(a.map((r: { gap: number }) => r.gap));
  });
});

describe("B1 遷移：舊 incomeComp → 月額，標 legacy，不猜單位", () => {
  it("需求端：舊值搬到月額、日額為 0、標記 incomeCompLegacy", () => {
    const c = w.migrateCase({ needs: [{ member: "林國棟", incomeComp: 60_000 }] });
    const nd = c.needs[0];
    expect(nd.incomeCompMonth).toBe(60_000);
    expect(nd.incomeCompDay).toBe(0);
    expect(nd.incomeCompLegacy).toBe(true);
    expect(nd.incomeComp).toBeUndefined();
  });

  it("⚠️ 金額像日額也一樣搬到月額（3,000 的那一筆不猜）", () => {
    const c = w.migrateCase({ needs: [{ member: "李育鏷", incomeComp: 3_000 }] });
    expect(c.needs[0].incomeCompMonth).toBe(3_000);
    expect(c.needs[0].incomeCompDay).toBe(0);
    expect(c.needs[0].incomeCompLegacy).toBe(true);
  });

  it("保單端同一套規則", () => {
    const c = w.migrateCase({ policies: [{ insured: "本人", name: "舊保單", incomeComp: 20_000 }] });
    expect(c.policies[0].incomeCompMonth).toBe(20_000);
    expect(c.policies[0].incomeCompDay).toBe(0);
    expect(c.policies[0].incomeCompLegacy).toBe(true);
  });

  it("已備保障（手動補充）的 kind='薪資補償' 也收斂到月額", () => {
    const c = w.migrateCase({ coverages: [{ member: "本人", kind: "薪資補償", comm: 30_000, social: 0 }] });
    expect(c.coverages[0].kind).toBe("薪資補償（月）");
    expect(c.coverages[0].incomeCompLegacy).toBe(true);
  });

  it("舊值是 0 不標記（沒有東西要確認，不製造雜訊）", () => {
    const c = w.migrateCase({ needs: [{ member: "本人", incomeComp: 0 }] });
    expect(c.needs[0].incomeCompMonth).toBe(0);
    expect(c.needs[0].incomeCompLegacy).toBeUndefined();
  });

  it("冪等：跑第二次、第三次數字與旗標都不變", () => {
    const c1 = w.migrateCase({ needs: [{ member: "本人", incomeComp: 40_000 }] });
    const snap = JSON.stringify(c1.needs[0]);
    w.migrateCase(c1);
    w.migrateCase(c1);
    expect(JSON.stringify(c1.needs[0])).toBe(snap);
  });

  it("已經拆過的資料不會被舊欄位覆寫", () => {
    const c = w.migrateCase({ needs: [{ member: "本人", incomeCompDay: 2_000, incomeCompMonth: 50_000 }] });
    expect(c.needs[0].incomeCompDay).toBe(2_000);
    expect(c.needs[0].incomeCompMonth).toBe(50_000);
    expect(c.needs[0].incomeCompLegacy).toBeUndefined();
  });

  it("沒過 migrateCase 的原始資料（伺服器端拿到的 plans.data）也要讀成月額", () => {
    const c = blank();
    c.needs = [{ member: "本人", protectYears: 0, incomeComp: 40_000 }];
    c.policies = [{ insured: "本人", name: "舊", premium: 0, incomeComp: 15_000 }];
    const g = E.coverageGaps(c);
    expect(row(g, "薪資補償（月）").need).toBe(40_000);
    expect(row(g, "薪資補償（月）").have).toBe(15_000);
    expect(row(g, "薪資補償（日）").need).toBe(0);
    expect(row(g, "薪資補償（日）").have).toBe(0);
  });

  it("UI 會出一行「請確認單位」的提示，而且只在 legacy 列出現", () => {
    expect(w.incomeCompLegacyHint({ incomeCompLegacy: true })).toContain("請確認單位是月額還是日額");
    expect(w.incomeCompLegacyHint({ incomeCompMonth: 60_000 })).toBe("");
  });
});

describe("B2 住院醫療日額需求的提示文字＝實際公式", () => {
  it("公式沒動：room + selfPay + nursing", () => {
    const nd = { room: 2_000, selfPay: 1_500, nursing: 1_500, incomeCompDay: 9_999, incomeCompMonth: 9_999 };
    expect(E.medicalDailyNeed(nd)).toBe(5_000);
    expect(w.medicalDailyNeed(nd)).toBe(5_000);
  });

  it("提示改成「病房費差額＋自付差額＋看護費」，不再寫薪資補償", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const med = w.NEED_BLOCKS.find((b: any) => b.key === "醫療");
    expect(med.hint).toContain("病房費差額＋自付差額＋看護費");
    expect(med.hint).not.toContain("＋薪資補償＝");
    // 三個輸入欄的 label 對得上公式的三個項
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labels = new Map<string, string>(med.fields.map((f: any) => [f[0], f[1]]));
    expect(labels.get("room")).toContain("病房費");
    expect(labels.get("selfPay")).toContain("自付差額");
    expect(labels.get("nursing")).toContain("看護費");
    for (const k of ["room", "selfPay", "nursing"]) expect(labels.get(k)).toContain("日額");
    // 薪資補償兩欄都在這一塊，而且各自標了單位
    expect(labels.get("incomeCompDay")).toContain("日額");
    expect(labels.get("incomeCompMonth")).toContain("月額");
  });
});

describe("B3 保障缺口總額：一次性給付 vs 定期給付，不相加", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mixed = (): any => {
    const c = blank();
    c.needs = [{
      member: "本人", protectYears: 0, funeral: 1_000_000, disability: 3_000_000,
      room: 2_000, selfPay: 500, nursing: 500, cancerHosp: 2_000,
      incomeCompDay: 1_000, incomeCompMonth: 40_000, monthCare: 30_000,
      firstCancer: 300_000, critical: 2_000_000, miscDaily: 100_000,
    }];
    return c;
  };

  it("三個總額各自加總，互不相干", () => {
    const gt = E.gapTotals(mixed());
    // 一次性：喪葬 100 萬 ＋ 傷殘 300 萬 ＋ 初次罹癌 30 萬 ＋ 重病 200 萬 ＋ 醫療雜費 10 萬
    expect(gt.lump).toBe(1_000_000 + 3_000_000 + 300_000 + 2_000_000 + 100_000);
    // 日額：住院醫療 3,000 ＋ 癌症住院 2,000 ＋ 薪資補償（日）1,000
    expect(gt.daily).toBe(3_000 + 2_000 + 1_000);
    // 月額：每月照護 30,000 ＋ 薪資補償（月）40,000
    expect(gt.monthly).toBe(30_000 + 40_000);
  });

  it("三個數字加起來不等於任何一個總額——它們不是同一種錢", () => {
    const gt = E.gapTotals(mixed());
    expect(gt.lump).not.toBe(gt.lump + gt.daily + gt.monthly);
    expect(gt.daily).toBeGreaterThan(0);
    expect(gt.monthly).toBeGreaterThan(0);
  });

  it("totalGap() 的向後相容呼叫方式＝一次性給付缺口（日額／月額不混進來）", () => {
    const c = mixed();
    expect(E.totalGap(c)).toBe(E.gapTotals(c).lump);
    expect(w.totalGap(JSON.parse(JSON.stringify(c)))).toBe(E.totalGap(c));
    // 把日額／月額需求拉到天上去，一次性給付缺口一位都不動
    const c2 = mixed();
    c2.needs[0].room = 500_000;
    c2.needs[0].monthCare = 900_000;
    expect(E.totalGap(c2)).toBe(E.totalGap(c));
  });

  it("health().riskCover 只吃 lump", () => {
    const c = mixed();
    const base = E.health(c).raw.riskCover;
    const c2 = mixed();
    c2.needs[0].room = 500_000;          // 日額需求暴增
    c2.needs[0].incomeCompMonth = 900_000; // 月額需求暴增
    expect(E.health(c2).raw.riskCover).toBeCloseTo(base, 10);
    expect(E.health(c2).parts.風險保全).toBe(E.health(c).parts.風險保全);

    const c3 = mixed();
    c3.policies = [{ insured: "本人", name: "定壽", premium: 0, life: 999_999_999 }];
    expect(E.health(c3).raw.riskCover).toBeGreaterThan(base);
  });

  it("gapNeedBase 的分母也只算同一堆（分子分母口徑一致）", () => {
    const nb = E.gapNeedBase(mixed());
    expect(nb.daily).toBe(3_000 + 2_000 + 1_000);
    expect(nb.monthly).toBe(30_000 + 40_000);
    expect(nb.lump).toBeGreaterThan(0);
  });

  it("advice() 的風險保全那一條把兩種缺口分開講、各自標單位", () => {
    const t = E.advice(mixed()).find((x: string[]) => x[0] === "風險保全規劃");
    expect(t).toBeTruthy();
    expect(t[1]).toContain("一次性給付缺口");
    expect(t[1]).toContain("元/日");
    expect(t[1]).toContain("元/月");
    expect(t[1]).toContain("刻意不相加");
    expect(t[1]).not.toContain("保障缺口合計");
  });

  it("gapLedger 的即時缺口每一列都帶自己的單位", () => {
    const c = mixed();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const now = E.gapLedger(c).now.filter((x: any) => x.kind === "保障");
    expect(now.length).toBeGreaterThan(0);
    for (const x of now) expect(["元", "元/日", "元/月"]).toContain(x.unit);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const care = now.find((x: any) => x.name === "保障・每月照護");
    expect(care.unit).toBe("元/月");
  });

  it("gapTotalsText：一次性一句、定期一句，永遠標單位", () => {
    const t = w.gapTotalsText(mixed());
    expect(t.lumpText).toContain("元");
    expect(t.periodText).toContain("元/日");
    expect(t.periodText).toContain("元/月");
    expect(t.hasPeriod).toBe(true);
    // 沒有定期給付缺口時是「—」，不是 0
    const c = blank();
    c.needs = [{ member: "本人", protectYears: 0, funeral: 1_000_000 }];
    expect(w.gapTotalsText(c).hasPeriod).toBe(false);
    expect(w.gapTotalsText(c).periodText).toBe("—");
  });
});
