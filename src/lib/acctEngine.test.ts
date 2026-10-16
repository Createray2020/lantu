import { describe, it, expect } from "vitest";
import { calcReceipt, payoutsOf, netOf, annualFeeOf, settlementDate, referralChain, taxOf, resolvePayee, statementOf, statementMonths, normPayee, type PayeeRec, normReceipt, normParams, calcMonth, type AcctItem, calcTarget, compareMonth, suggestQty, calcData, normItems as normItems2, unitOf, breakeven, goalSolve, leverSensitivity, prevYm, nextYm, normItems, normMonth, normTarget, cashLedger, cashFixedStatus, unpaidPayouts, unpaidCsvRows, UNPAID_CSV_HEADERS, isEachSplit, type AcctState } from "./acctEngine";

// 原型（docs/帳務後台_原型.html）的示範資料——2026-09 那一個月。
const S: AcctState = {
  items: [
    { id: "a", name: "個人財務規劃諮詢", price: 12000, splits: [{ to: "教練分潤", mode: "pct", v: 60 }, { to: "推薦人", mode: "pct", v: 5 }, { to: "金流手續費", mode: "pct", v: 2.5 }] },
    { id: "b", name: "企業財務健檢", price: 45000, splits: [{ to: "教練分潤", mode: "pct", v: 55 }, { to: "外聘會計師", mode: "amt", v: 8000 }, { to: "金流手續費", mode: "pct", v: 2.5 }] },
    { id: "c", name: "共創講座（單場）", price: 2400, splits: [{ to: "講師費", mode: "amt", v: 600 }, { to: "場地分攤", mode: "amt", v: 300 }, { to: "金流手續費", mode: "pct", v: 2.5 }] },
    { id: "d", name: "教練培育課程", price: 38000, splits: [{ to: "講師費", mode: "pct", v: 30 }, { to: "推薦人", mode: "pct", v: 5 }, { to: "教材製作", mode: "amt", v: 1500 }] },
  ],
  months: {
    "2026-09": { qty: { a: 19, b: 5, c: 96, d: 4 }, fixed: [{ name: "辦公室租金", amt: 35000 }, { name: "系統與雲端費用", amt: 12000 }, { name: "行政人員薪資", amt: 42000 }, { name: "行銷投放", amt: 15000 }, { name: "保險與雜支", amt: 6000 }] },
  },
  targets: {},
  draft: null,
  params: { vatRate: 5, poolTiers: [[30], [25, 5]], tax: { withholdRate: 10, nhiRate: 2.11, threshold: 20000 }, referralRates: { INTERN: 10, PARTNER: 10, C1: 20, C2: 20, C3: 20, S1: 25, S2: 25, S3: 25, CHIEF: 30 }, referralCap: 30, annualFee: { C1: 6000, C2: 6000, C3: 6000, S1: 12000, S2: 12000, S3: 18000, CHIEF: 24000 }, earlyApplyFee: 6000 },
  goal: { netTarget: 200000 },
};

describe("acctEngine 單筆", () => {
  it("比例與固定金額拆分並用，扣完＝毛利", () => {
    const u = unitOf(S.items[1]);
    expect(u.split).toBeCloseTo(45000 * 0.575 + 8000);
    expect(u.gp).toBeCloseTo(45000 - 25875 - 8000);
    expect(u.gm).toBeCloseTo(u.gp / 45000);
  });
  it("拆分比例 what-if 只動比例列、固定額不動；比例不會被拉成負", () => {
    const u = unitOf(S.items[2], { split: -5 });
    expect(u.rows[0].v).toBe(600);
    expect(u.rows[2].v).toBe(0);   // 2.5 − 5 → 夾 0
  });
});

describe("acctEngine 月結", () => {
  const r = calcMonth(S, "2026-09")!;
  it("營業額＝Σ單價×筆數；營業稅＝營業額×5%", () => {
    expect(r.rev).toBe(12000 * 19 + 45000 * 5 + 2400 * 96 + 38000 * 4);
    expect(r.vat).toBeCloseTo(r.rev * 0.05);
  });
  it("三層口徑：毛利＝營業額−拆分；淨利＝毛利−固定−稅", () => {
    expect(r.gp).toBeCloseTo(r.rev - r.split);
    expect(r.fixed).toBe(110000);
    expect(r.net).toBeCloseTo(r.gp - r.fixed - r.vat);
    expect(r.nm).toBeCloseTo(r.net / r.rev);
  });
  it("拆分按對象彙總，總和＝拆分合計", () => {
    const sum = Object.values(r.byTo).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(r.split);
    expect(r.byTo["教練分潤"]).toBeCloseTo(12000 * 0.6 * 19 + 45000 * 0.55 * 5);
  });
  it("沒有那個月回 null；數量 what-if 等比放大營業額", () => {
    expect(calcMonth(S, "2025-01")).toBeNull();
    expect(calcMonth(S, "2026-09", { qty: 10 })!.rev).toBeCloseTo(r.rev * 1.1);
  });
  it("損益兩平＝固定支出÷(毛利率−稅率)", () => {
    expect(breakeven(r, 5)).toBeCloseTo(110000 / (r.gm - 0.05));
    expect(breakeven({ ...r, gm: 0.03 }, 5)).toBe(Infinity);
  });
});

describe("acctEngine 目標與槓桿", () => {
  const r = calcMonth(S, "2026-09")!;
  it("目標淨利反推：need＝目標＋固定；等比倍率乘上去剛好到", () => {
    const g = goalSolve(S, r);
    expect(g.need).toBe(310000);
    expect(g.gap).toBeCloseTo(310000 - (r.gp - r.vat));
    const scaled = calcMonth(S, "2026-09", { qty: (g.k - 1) * 100 })!;
    expect(scaled.gp - scaled.vat).toBeCloseTo(g.need);
    for (const p of g.perItem) expect(p.needQ).toBeGreaterThanOrEqual(p.q);
  });
  it("已達標時 gap≤0、單靠某一項要補的筆數＝0", () => {
    const g = goalSolve({ ...S, goal: { netTarget: 1 } }, r);
    expect(g.gap).toBeLessThanOrEqual(0);
    expect(g.perItem.every((p) => p.aloneQ === 0)).toBe(true);
  });
  it("四根槓桿的邊際：拆分降 1 點 ≈ 營業額×1%（只有比例列）", () => {
    const s = leverSensitivity(S, "2026-09");
    expect(s.split1).toBeGreaterThan(0);
    expect(s.price1).toBeGreaterThan(0);
    expect(s.qty1).toBeCloseTo((r.gp - r.vat) / 100);
    expect(s.fix1).toBeCloseTo(1100);
  });
});

describe("acctEngine 工具", () => {
  it("月份前後推跨年正確", () => {
    expect(prevYm("2026-01")).toBe("2025-12");
    expect(nextYm("2026-12")).toBe("2027-01");
  });
  it("normItems／normMonth 擋掉壞資料、負數夾 0、mode 只認 pct/amt", () => {
    const items = normItems([{ id: "x", name: " 講座 ", price: "1,200", splits: [{ to: "a", mode: "xx", v: -3 }, null] }, "junk", { name: "no id" }]);
    expect(items).toEqual([{ id: "x", name: "講座", price: 1200, splits: [{ to: "a", mode: "pct", v: 0 }] }]);
    expect(normMonth({ qty: { x: "7", y: -1 }, fixed: [{ name: "租金", amt: "35,000" }, 3] })).toEqual({ qty: { x: 7, y: 0 }, fixed: [{ name: "租金", amt: 35000 }] });
    expect(normMonth(null)).toEqual({ qty: {}, fixed: [] });
  });
});

describe("acctEngine 目標與對照（目標另存，不動實際）", () => {
  const T: AcctState = {
    ...S,
    targets: { "2026-09": { qty: { a: 22, b: 5, c: 96, d: 6 }, fixed: [{ name: "辦公室租金", amt: 35000 }, { name: "系統與雲端費用", amt: 12000 }, { name: "行政人員薪資", amt: 42000 }, { name: "行銷投放", amt: 8000 }, { name: "保險與雜支", amt: 6000 }], net: 250000 } },
  };
  it("calcTarget 用目標筆數算、實際不受影響；沒目標回 null", () => {
    const rt = calcTarget(T, "2026-09")!;
    expect(rt.rev).toBe(12000 * 22 + 45000 * 5 + 2400 * 96 + 38000 * 6);
    expect(calcMonth(T, "2026-09")!.rev).toBe(calcMonth(S, "2026-09")!.rev);
    expect(calcTarget(S, "2026-09")).toBeNull();
  });
  it("compareMonth：逐項筆數差 × 每筆淨貢獻＝對淨利影響；固定支出同名合併；差最大的當 drivers", () => {
    const c = compareMonth(T, "2026-09")!;
    const a = c.items.find((x) => x.key === "a")!;
    expect(a.diff).toBe(19 - 22);
    const u = unitOf(S.items[0]);
    expect(a.netEffect).toBeCloseTo(-3 * (u.gp - u.price * 0.05));
    const mk = c.fixedRows.find((x) => x.name === "行銷投放")!;
    expect(mk.diff).toBe(15000 - 8000);
    expect(mk.netEffect).toBe(-7000);
    expect(c.net.target).toBe(250000);
    expect(c.net.actual).toBeCloseTo(calcMonth(S, "2026-09")!.net);
    expect(c.drivers.length).toBeGreaterThan(0);
    expect(c.drivers.join("")).toContain("少賣 3 筆");
    expect(c.drivers.join("")).toContain("行銷投放多花 7,000");
    expect(compareMonth(S, "2026-09")).toBeNull();
  });
  it("normTarget 帶 net、負數夾 0", () => {
    expect(normTarget({ qty: { a: "3" }, fixed: [], net: -5 })).toEqual({ qty: { a: 3 }, fixed: [], net: 0 });
    expect(normTarget(null).net).toBe(0);
  });
});

describe("acctEngine 目標工作台 suggestQty", () => {
  it("等比放大到目標淨利；已達標時維持基準筆數", () => {
    const base = S.months["2026-09"];
    const q = suggestQty(S.items, base, 400000, S.params);
    for (const it of S.items) expect(q[it.id]).toBeGreaterThanOrEqual(base.qty[it.id]);
    const r = calcData(S.items, { ...base, qty: q }, S.params);
    expect(r.net).toBeGreaterThanOrEqual(400000);
    expect(suggestQty(S.items, base, 1, S.params)).toEqual(base.qty);
  });
});

describe("acctEngine 系統入帳（acct_entries）", () => {
  const sysRows = [
    { id: "e1", itemId: "a", coachId: "c1", coachName: "甲", source: "apply" as const, amount: 6000, void: false, createdAt: "2026-09-03T00:00:00Z" },
    { id: "e2", itemId: "a", coachId: "c2", coachName: "乙", source: "apply" as const, amount: 5000, void: false, createdAt: "2026-09-10T00:00:00Z" },
    { id: "e3", itemId: "a", coachId: "c3", coachName: "丙", source: "apply" as const, amount: 6000, void: true, createdAt: "2026-09-12T00:00:00Z" },
    { id: "e4", itemId: "zzz", coachId: "c4", coachName: "丁", source: "license" as const, amount: 9000, void: false, createdAt: "2026-09-12T00:00:00Z" },
  ];
  const T: AcctState = { ...S, months: { "2026-09": { qty: { a: 2 }, fixed: [] } }, sys: { "2026-09": sysRows } };
  it("筆數＝手填＋系統（作廢不算）；營業額用每筆快照金額；找不到項目的事件不算", () => {
    const r = calcMonth(T, "2026-09")!;
    const a = r.byItem.find((b) => b.it.id === "a")!;
    expect(a.manualQ).toBe(2); expect(a.sysN).toBe(2); expect(a.q).toBe(4);
    expect(a.rev).toBe(12000 * 2 + 6000 + 5000);
    // 拆分規則套在快照金額上：全比例 67.5%
    expect(a.gp).toBeCloseTo((12000 * 2 + 6000 + 5000) * (1 - 0.675));
    expect(r.rev).toBe(a.rev);
  });
  it("目標不吃系統入帳；對照的實際筆數含系統", () => {
    const U: AcctState = { ...T, targets: { "2026-09": { qty: { a: 5 }, fixed: [], net: 0 } } };
    expect(calcTarget(U, "2026-09")!.byItem[0].q).toBe(5);
    const c = compareMonth(U, "2026-09")!;
    expect(c.items.find((x) => x.key === "a")!.actual).toBe(4);
  });
  it("normItems 只認 apply／license 當自動來源", () => {
    const it = normItems2([{ id: "x", name: "報聘", price: 6000, splits: [], source: "apply" }, { id: "y", name: "y", price: 1, splits: [], source: "junk" }]);
    expect(it[0].source).toBe("apply");
    expect(it[1].source).toBeUndefined();
  });
});

// ---------- 2026/10/08 對帳表（嵐途_財務對帳表.xlsx）逐字對拍 ----------
const P: AcctState["params"] = { vatRate: 5, poolTiers: [[30], [25, 5]], tax: { withholdRate: 10, nhiRate: 2.11, threshold: 20000 }, referralRates: { INTERN: 10, PARTNER: 10, C1: 20, C2: 20, C3: 20, S1: 25, S2: 25, S3: 25, CHIEF: 30 }, referralCap: 30, annualFee: { C1: 6000, C2: 6000, C3: 6000, S1: 12000, S2: 12000, S3: 18000, CHIEF: 24000 }, earlyApplyFee: 6000 };
const ITEMS: Record<"annual" | "train" | "academy" | "event", AcctItem> = {
  annual: { id: "annual", name: "年度合作費（報聘）", price: 6000, splits: [{ to: "創造共好", mode: "amt", v: 4800 }, { to: "分潤", mode: "pool", v: 0 }] },
  train: { id: "train", name: "培訓費", price: 9800, splits: [{ to: "分潤", mode: "pool", v: 0 }, { to: "公司", mode: "keep", v: 20 }, { to: "創造共好", mode: "amt", v: 600 }, { to: "講師一", mode: "rest", v: 80 }, { to: "講師二", mode: "rest", v: 20 }] },
  academy: { id: "academy", name: "學院・年度方案", price: 4800, cat: "嵐途學院", splits: [{ to: "分潤", mode: "pool", v: 0 }] },
  event: { id: "event", name: "8/8 一日培訓", price: 600, cat: "活動", splits: [{ to: "講師車馬費", mode: "pct", v: 37.5 }, { to: "場地", mode: "pct", v: 62.5 }] },
};
const two = [{ name: "陳昱豪", rankCode: "S3" }, { name: "邱浩軍", rankCode: "CHIEF" }];

describe("對帳表公式對拍", () => {
  it("年度合作費：系統 4,800 固定、無分潤人 → 公司 1,200（J=B−SUM(F:I)）", () => {
    const r = calcReceipt(ITEMS.annual, 6000, [], {}, P);
    expect(r.rows.map((x) => [x.to, x.v])).toEqual([["創造共好", 4800]]);
    expect(r.company).toBe(1200);
    expect(r.payout).toBe(4800);
  });
  it("年度合作費有兩位分潤人：25／5 之後公司剩 −600 也照算（讓人看得到不夠分）", () => {
    const r = calcReceipt(ITEMS.annual, 6000, two, {}, P);
    expect(r.rows.map((x) => x.v)).toEqual([4800, 1500, 300]);
    expect(r.company).toBe(-600);
  });
  it("培訓費兩位分潤人：F=25%、G=5%、公司 20%、系統 600、講師＝餘額×80／20", () => {
    const r = calcReceipt(ITEMS.train, 9800, two, { 講師一: "王老師" }, P);
    const by = Object.fromEntries(r.rows.map((x) => [x.to, x.v]));
    expect(by["陳昱豪"]).toBeCloseTo(2450);
    expect(by["邱浩軍"]).toBeCloseTo(490);
    expect(by["公司"]).toBeCloseTo(1960);
    expect(by["創造共好"]).toBe(600);
    expect(by["王老師"]).toBeCloseTo(3440);   // (9800−2450−490−1960−600)×80%
    expect(by["講師二"]).toBeCloseTo(860);
    expect(r.keep).toBeCloseTo(1960);
    expect(r.company).toBeCloseTo(1960);     // 公司實收＝自留那 20%
    expect(r.payout).toBeCloseTo(9800 - 1960);
  });
  it("培訓費一位分潤人：F=30%，講師 3,440／860 不變", () => {
    const r = calcReceipt(ITEMS.train, 9800, [{ name: "邱浩軍", rankCode: "CHIEF" }], {}, P);
    const by = Object.fromEntries(r.rows.map((x) => [x.to, x.v]));
    expect(by["邱浩軍"]).toBeCloseTo(2940);
    expect(by["講師一"]).toBeCloseTo(3440);
    expect(by["講師二"]).toBeCloseTo(860);
  });
  it("培訓費沒有分潤人：池不扣，餘額變大，講師拿更多", () => {
    const r = calcReceipt(ITEMS.train, 9800, [], {}, P);
    const by = Object.fromEntries(r.rows.map((x) => [x.to, x.v]));
    expect(by["講師一"]).toBeCloseTo((9800 - 1960 - 600) * 0.8);
    expect(r.company).toBeCloseTo(1960);
  });
  it("學院年度方案 4,800 兩位分潤人：1,200／240，公司 3,360；單場票 300：75／15，公司 210", () => {
    const r = calcReceipt(ITEMS.academy, 4800, two, {}, P);
    expect(r.rows.map((x) => x.v)).toEqual([1200, 240]);
    expect(r.company).toBe(3360);
    const t = calcReceipt(ITEMS.academy, 300, [{ name: "謝采恩", rankCode: "S3" }, { name: "邱浩軍", rankCode: "CHIEF" }], {}, P);
    expect(t.rows.map((x) => x.v)).toEqual([75, 15]);
    expect(t.company).toBe(210);
  });
  it("8/8 一日培訓：600 × 3000/8000 講師車馬費、× 5000/8000 場地，公司 0", () => {
    const r = calcReceipt(ITEMS.event, 600, [], {}, P);
    expect(r.rows.map((x) => x.v)).toEqual([225, 375]);
    expect(r.company).toBe(0);
  });
  it("V7.2 §14：推薦端沿輔導鏈逐層正差額——實習 10 → C1 20 → S1 25 → CHIEF 30（辦法範例 980／980／490／490）", () => {
    const chain = [{ name: "實習", rankCode: "INTERN" }, { name: "C1", rankCode: "C1" }, { name: "S1", rankCode: "S1" }, { name: "首席", rankCode: "CHIEF" }];
    const r = calcReceipt(ITEMS.train, 9800, chain, {}, P);
    const pool = r.rows.filter((x) => x.mode === "pool");
    expect(pool.map((x) => x.v)).toEqual([980, 980, 490, 490]);
    expect(pool.reduce((a, x) => a + x.v, 0)).toBe(2940);   // 整條 30%
    expect(r.warn).toBeNull();
  });
  it("平階／倒掛那一層 0，上層承接較高比例；整條不超過上限", () => {
    const r = calcReceipt(ITEMS.academy, 4800, [{ name: "a", rankCode: "S2" }, { name: "b", rankCode: "S3" }, { name: "c", rankCode: "C1" }, { name: "d", rankCode: "CHIEF" }], {}, P);
    expect(r.rows.map((x) => x.v)).toEqual([1200, 0, 0, 240]);   // S2 25、S3 平階 0、C1 倒掛 0、CHIEF 30−25＝5
    const capped = calcReceipt(ITEMS.academy, 4800, [{ name: "a", rankCode: "CHIEF" }, { name: "b", rankCode: "CHIEF" }], {}, { ...P, referralCap: 20 });
    expect(capped.rows.map((x) => x.v)).toEqual([960, 0]);
  });
  it("沒有職級快照的舊資料退回切法表並給警示", () => {
    const r = calcReceipt(ITEMS.academy, 4800, [{ name: "甲" }, { name: "乙" }], {}, P);
    expect(r.rows.map((x) => x.v)).toEqual([1200, 240]);
    expect(r.warn).toContain("切法表");
  });
  it("退款：以最終實收重算；金額整數元四捨五入", () => {
    expect(netOf({ amount: 9800, refund: 1800 })).toBe(8000);
    const r = calcReceipt(ITEMS.train, netOf({ amount: 9800, refund: 1800 }), [{ name: "邱", rankCode: "CHIEF" }], {}, P);
    expect(r.rows.find((x) => x.to === "邱")!.v).toBe(2400);
    const odd = calcReceipt(ITEMS.academy, 333, [{ name: "邱", rankCode: "CHIEF" }], {}, P);
    expect(Number.isInteger(odd.rows[0].v)).toBe(true);
    expect(odd.rows[0].v).toBe(100);   // 99.9 → 100
  });
  it("案件帶入：allocs 照單全收，公司列算留在公司", () => {
    const r = calcReceipt(ITEMS.annual, 60000, [], {}, P, {}, [
      { to: "C1", v: 27000, mode: "pct", label: "推廣＋執案 45%" }, { to: "S2", v: 18600, mode: "pct", label: "差階" }, { to: "首席", v: 8400, mode: "pct", label: "差階" }, { to: "公司營運", v: 6000, mode: "keep", label: "公司營運" },
    ]);
    expect(r.payout).toBe(54000);
    expect(r.company).toBe(6000);
  });
  it("年度合作費依職級、提前報聘首期；結算發放日＝次月 5 日遇假日提前", () => {
    expect(annualFeeOf(P, "C2")).toBe(6000);
    expect(annualFeeOf(P, "S3")).toBe(18000);
    expect(annualFeeOf(P, "CHIEF")).toBe(24000);
    expect(annualFeeOf(P, "INTERN")).toBe(0);
    expect(annualFeeOf(P, "S3", true)).toBe(6000);
    expect(settlementDate("2026-09")).toBe("2026-10-05");   // 週一
    expect(settlementDate("2026-11")).toBe("2026-12-04");   // 12/5 週六 → 12/4
    expect(settlementDate("2026-03")).toBe("2026-04-03");   // 4/5 週日 → 4/3
  });
  it("referralChain：本人在前、沿 uplineId 到頂、帶職級快照；成環會停", () => {
    const list = [{ id: "a", name: "甲", rankCode: "INTERN", uplineId: "b" }, { id: "b", name: "乙", rankCode: "C1", uplineId: "c" }, { id: "c", name: "丙", rankCode: "CHIEF", uplineId: "a" }];
    expect(referralChain("a", list).map((x) => `${x.name}:${x.rankCode}`)).toEqual(["甲:INTERN", "乙:C1", "丙:CHIEF"]);
    expect(referralChain("zzz", list)).toEqual([]);
  });
  it("what-if 拆分點數只動 pct 列，不動 pool／amt／keep", () => {
    const r = calcReceipt(ITEMS.event, 600, [], {}, P, { split: -5 });
    expect(r.rows.map((x) => x.v)).toEqual([195, 345]);
    const t = calcReceipt(ITEMS.train, 9800, two, {}, P, { split: -5 });
    expect(t.rows[0].v).toBeCloseTo(2450);
  });
});

describe("收款進月結與匯款對帳", () => {
  const rc = (id: string, itemId: string, on: string, amount: number, payer: string, sharers: { name: string; rankCode?: string }[] = [], payees = {}) =>
    normReceipt({ itemId, on, amount, payer, sharers, payees }, id);
  const S2: AcctState = {
    items: [ITEMS.annual, ITEMS.train, ITEMS.academy, ITEMS.event],
    months: { "2026-09": { qty: {}, fixed: [{ name: "記帳費", amt: 3000 }] } },
    targets: {}, draft: null, params: P, goal: { netTarget: 0 },
    receipts: { "2026-09": [
      rc("r1", "annual", "2026-09-02", 6000, "李沛瑄"),
      rc("r2", "annual", "2026-09-02", 6000, "王忠岳"),
      rc("r3", "train", "2026-09-22", 9800, "林祐丞", two, { 講師一: "王老師" }),
      rc("r4", "train", "2026-09-24", 9800, "Sabrina", [{ name: "邱浩軍", rankCode: "CHIEF" }], { 講師一: "王老師" }),
      rc("r5", "academy", "2026-09-30", 4800, "許家瑜", two),
      { ...rc("r6", "annual", "2026-09-23", 6000, "退費的人"), void: true },
    ] },
    payouts: { "2026-09": { "n:邱浩軍": { paidOn: "2026-10-05", amount: 3000, note: "" } } },
  };
  it("營業額＝Σ收款（作廢不算）；拆分給別人＝Σ匯出去；毛利＝公司實收", () => {
    const r = calcMonth(S2, "2026-09")!;
    expect(r.rev).toBe(6000 * 2 + 9800 * 2 + 4800);
    expect(r.gp).toBeCloseTo(1200 * 2 + 1960 * 2 + 3360);
    expect(r.split).toBeCloseTo(r.rev - r.gp);
    expect(r.byItem.find((b) => b.it.id === "annual")!.q).toBe(2);
    expect(r.byItem.find((b) => b.it.id === "annual")!.rcN).toBe(2);
    expect(r.byTo["王老師"]).toBeCloseTo(3440 * 2);
    expect(r.byTo["公司"]).toBeUndefined();   // keep 不是匯款
    expect(r.net).toBeCloseTo(r.gp - 3000 - r.rev * 0.05);
  });
  it("匯款對帳：按受款人彙總、來源可追、已匯扣掉", () => {
    const p = payoutsOf(S2, "2026-09");
    const by = Object.fromEntries(p.lines.map((l) => [l.payee, l]));
    expect(by["創造共好"].due).toBe(4800 * 2 + 600 * 2);
    expect(by["創造共好"].srcs.length).toBe(4);
    expect(by["邱浩軍"].due).toBeCloseTo(490 + 2940 + 240);
    expect(by["邱浩軍"].remaining).toBeCloseTo(490 + 2940 + 240 - 3000);
    expect(by["陳昱豪"].due).toBeCloseTo(2450 + 1200);
    expect(by["王老師"].due).toBeCloseTo(3440 * 2);
    expect(by["講師二"].due).toBeCloseTo(860 * 2);
    expect(p.lines[0].due).toBeGreaterThanOrEqual(p.lines[1].due);   // 大的在前
    expect(p.received).toBe(6000 * 2 + 9800 * 2 + 4800);
    expect(p.company).toBeCloseTo(1200 * 2 + 1960 * 2 + 3360);
    expect(p.due).toBeCloseTo(p.received - p.company);
    expect(p.paid).toBe(3000);
    expect(p.remaining).toBeCloseTo(p.due - 3000);
  });
  it("normReceipt：ym 由日期推、分潤人字串也收、壞日期變空", () => {
    const r = normReceipt({ itemId: "x", on: "2026-08-18", amount: "4,800", sharers: ["陳昱豪", { name: "邱浩軍", coachId: "c1" }], payees: { 講師一: " 王老師 ", 講師二: "" } }, "id1");
    expect(r.ym).toBe("2026-08");
    expect(r.amount).toBe(4800);
    expect(r.sharers).toEqual([{ name: "陳昱豪" }, { name: "邱浩軍", coachId: "c1" }]);
    expect(r.refund).toBe(0);
    expect(r.source).toBe("manual");
    expect(r.payees).toEqual({ 講師一: "王老師" });
    expect(normReceipt({ on: "2026/08/18" }, "id2").on).toBe("");
  });
  it("normParams：切法表壞值歸零、尾端空階砍掉、沒有就用預設", () => {
    expect(normParams({ vatRate: 5 }).poolTiers).toEqual([[30], [25, 5]]);
    expect(normParams({ vatRate: 5, poolTiers: [[30], ["25", "x"], [], []] }).poolTiers).toEqual([[30], [25, 0]]);
  });
});

describe("受款人簿與扣繳", () => {
  const book: PayeeRec[] = [
    { id: "pa", coachId: "c-chiu", name: "邱浩軍", bankCode: "808", bankName: "玉山", branch: "", accountName: "邱浩軍", accountNo: "1234567890", taxMode: "withhold", note: "" },
    { id: "pb", coachId: null, name: "創造共好", bankCode: "", bankName: "", branch: "", accountName: "", accountNo: "", taxMode: "invoice", note: "" },
    { id: "pc", coachId: "c-chen", name: "陳昱豪", bankCode: "", bankName: "", branch: "", accountName: "", accountNo: "", taxMode: "withhold", note: "" },
  ];
  const coachList = [{ id: "c-chiu", name: "邱浩軍" }, { id: "c-chen", name: "陳昱豪" }];
  it("名字對受款人簿：coachId 優先、再名字、再經名冊", () => {
    expect(resolvePayee(book, "隨便", "c-chiu", coachList)?.id).toBe("pa");
    expect(resolvePayee(book, "創造共好", null, coachList)?.id).toBe("pb");
    expect(resolvePayee(book, "陳昱豪", null, coachList)?.id).toBe("pc");
    expect(resolvePayee(book, "講師二", null, coachList)).toBeNull();
  });
  it("扣繳：扣執行業務所得且達起扣點才扣 10%＋2.11%；開發票與未設定不扣", () => {
    const t = { withholdRate: 10, nhiRate: 2.11, threshold: 20000 };
    expect(taxOf("withhold", 25000, t)).toEqual({ mode: "withhold", withhold: 2500, nhi: 528, net: 25000 - 2500 - 528, applied: true });
    expect(taxOf("withhold", 19999, t).applied).toBe(false);
    expect(taxOf("withhold", 19999, t).net).toBe(19999);
    expect(taxOf("invoice", 25000, t).net).toBe(25000);
    expect(taxOf("", 25000, t).net).toBe(25000);
  });
  it("對帳：同一個人跨多筆合併成一條、鍵用受款人 id；已匯用同一把鍵；實匯扣繳後", () => {
    const rc = (id: string, itemId: string, on: string, amount: number, payer: string, sharers: { name: string; coachId?: string; rankCode?: string }[] = []) => normReceipt({ itemId, on, amount, payer, sharers }, id);
    const S3: AcctState = {
      items: [ITEMS.train, ITEMS.annual], months: {}, targets: {}, draft: null, params: P, goal: { netTarget: 0 },
      coachList, payeeBook: book,
      receipts: { "2026-09": [
        // 三筆培訓都只有邱浩軍一人分潤（30%＝2,940）→ 合計 8,820；年度合作費一筆兩人（名字對、沒 coachId）
        rc("r1", "train", "2026-09-22", 9800, "A", [{ name: "邱浩軍", coachId: "c-chiu", rankCode: "CHIEF" }]),
        rc("r2", "train", "2026-09-23", 9800, "B", [{ name: "邱浩軍", rankCode: "CHIEF" }]),
        rc("r3", "train", "2026-09-24", 9800, "C", [{ name: "浩軍", coachId: "c-chiu", rankCode: "CHIEF" }]),
        rc("r4", "annual", "2026-09-25", 6000, "D", [{ name: "陳昱豪", rankCode: "S3" }, { name: "邱浩軍", rankCode: "CHIEF" }]),
      ] },
      payouts: { "2026-09": { "p:pb": { paidOn: "2026-10-01", amount: 1000, note: "" } } },
    };
    const p = payoutsOf(S3, "2026-09");
    const chiu = p.lines.find((l) => l.key === "p:pa")!;
    expect(chiu.payee).toBe("邱浩軍");
    expect(chiu.srcs.length).toBe(4);
    expect(chiu.due).toBeCloseTo(2940 * 3 + 300);
    expect(chiu.tax.applied).toBe(false);     // 9,120 未達 20,000
    expect(chiu.tax.net).toBeCloseTo(chiu.due);
    const sys = p.lines.find((l) => l.key === "p:pb")!;   // 創造共好：3×600＋4,800
    expect(sys.due).toBe(6600);
    expect(sys.mark?.amount).toBe(1000);
    expect(sys.remaining).toBe(5600);
    expect(p.lines.find((l) => l.key === "n:講師一")!.rec).toBeNull();
    expect(p.net).toBeCloseTo(p.due);
    expect(statementOf(S3, "2026-09", "p:pa")!.due).toBeCloseTo(chiu.due);
    expect(statementMonths(S3, "p:pa")).toEqual(["2026-09"]);
    expect(statementMonths(S3, "p:none")).toEqual([]);
  });
  it("達起扣點：三十筆培訓一人分潤 → 扣繳後實匯", () => {
    const rcs = Array.from({ length: 10 }, (_, i) => normReceipt({ itemId: "train", on: `2026-09-${String(i + 1).padStart(2, "0")}`, amount: 9800, payer: `P${i}`, sharers: [{ name: "邱浩軍", coachId: "c-chiu", rankCode: "CHIEF" }] }, `r${i}`));
    const S4: AcctState = { items: [ITEMS.train], months: {}, targets: {}, draft: null, params: P, goal: { netTarget: 0 }, coachList, payeeBook: book, receipts: { "2026-09": rcs } };
    const l = payoutsOf(S4, "2026-09").lines.find((x) => x.key === "p:pa")!;
    expect(l.due).toBeCloseTo(29400);
    expect(l.tax.withhold).toBe(2940);
    expect(l.tax.nhi).toBe(Math.round(29400 * 0.0211));
    expect(l.tax.net).toBe(29400 - 2940 - Math.round(29400 * 0.0211));
    expect(l.remaining).toBe(l.tax.net);
  });
  it("normPayee：帳號只留數字與連字號、稅務方式壞值歸空；normParams 沒給 tax 用預設", () => {
    const r = normPayee({ coachId: "c1", name: " 王 ", bankCode: "8-08", accountNo: "12 34-56ab", taxMode: "x" }, "id");
    expect(r).toMatchObject({ id: "id", coachId: "c1", name: "王", bankCode: "808", accountNo: "1234-56", taxMode: "" });
    expect(normParams({ vatRate: 5 }).tax).toEqual({ withholdRate: 10, nhiRate: 2.11, threshold: 20000 });
    expect(normParams({ vatRate: 5 }).referralRates.CHIEF).toBe(30);
    expect(normParams({ vatRate: 5, referralRates: { CHIEF: 35 }, referralCap: 40, annualFee: { S3: 20000 } })).toMatchObject({ referralCap: 40, referralRates: { CHIEF: 35, S3: 25 }, annualFee: { S3: 20000, C1: 6000 } });
    expect(normParams({ vatRate: 5, tax: { withholdRate: "x", nhiRate: 2.11, threshold: 0 } }).tax).toEqual({ withholdRate: 10, nhiRate: 2.11, threshold: 0 });
  });
});

describe("現金帳與尚未匯款總表（2026/10/16）", () => {
  const rc = (id: string, itemId: string, on: string, amount: number, payer: string, extra: Record<string, unknown> = {}) => normReceipt({ itemId, on, amount, payer, sharers: [], payees: {}, ...extra }, id);
  const book: PayeeRec[] = [
    { id: "pa", coachId: "c-chiu", name: "邱浩軍", bankCode: "808", bankName: "玉山", branch: "中和", accountName: "邱浩軍", accountNo: "0012345678", taxMode: "withhold", note: "" },
  ];
  const S5: AcctState = {
    items: [ITEMS.annual, ITEMS.train], months: { "2026-09": { qty: {}, fixed: [{ name: "記帳費", amt: 3000 }, { name: "商業登記", amt: 2000 }] } },
    targets: {}, draft: null, params: P, goal: { netTarget: 0 }, payeeBook: book, coachList: [{ id: "c-chiu", name: "邱浩軍" }],
    receipts: {
      "2026-08": [rc("r0", "annual", "2026-08-20", 6000, "八月的人")],
      "2026-09": [
        rc("r1", "annual", "2026-09-02", 6000, "A"),
        rc("r2", "train", "2026-09-22", 9800, "B", { sharers: [{ name: "邱浩軍", coachId: "c-chiu", rankCode: "CHIEF" }] }),
        rc("r3", "annual", "2026-09-10", 6000, "待查的", { execCoachId: "c-chiu", verified: false }),
        { ...rc("r4", "annual", "2026-09-11", 6000, "作廢的"), void: true },
      ],
    },
    payouts: { "2026-08": { "n:創造共好": { paidOn: "2026-09-05", amount: 4800, note: "" } }, "2026-09": { "p:pa": { paidOn: "", amount: 1000, note: "" } } },
    cash: { opening: { amount: 10000, from: "2026-08-01" }, entries: [
      { id: "e1", on: "2026-09-15", kind: "out", amount: 3000, cat: "固定支出", name: "記帳費", note: "" },
      { id: "e2", on: "2026-09-03", kind: "in", amount: 500, cat: "其他收入", name: "利息", note: "" },
    ] },
  };
  it("normReceipt：沒帶 source 但有執案教練 → coach（待查帳的確認鈕靠這個出現）", () => {
    expect(normReceipt({ itemId: "annual", on: "2026-09-10", amount: 6000, execCoachId: "c-x" }, "x").source).toBe("coach");
    expect(normReceipt({ itemId: "annual", on: "2026-09-10", amount: 6000 }, "x").source).toBe("manual");
    expect(normReceipt({ itemId: "annual", on: "2026-09-10", amount: 6000, source: "case", execCoachId: "c-x" }, "x").source).toBe("case");
  });
  it("日記帳：已確認收款流入、已匯流出、手記列；作廢與待查帳不進；按日期累計餘額", () => {
    const L = cashLedger(S5);
    expect(L.rows.map((r) => r.id)).toEqual(["r:r0", "r:r1", "e2", "p:2026-08:n:創造共好", "e1", "r:r2", "p:2026-09:p:pa"]);
    expect(L.rows.find((r) => r.id === "p:2026-09:p:pa")!.on).toBe("2026-10-05");   // 沒填匯款日＝發放日
    expect(L.rows.find((r) => r.id === "p:2026-09:p:pa")!.name).toContain("邱浩軍");
    expect(L.inflow).toBe(6000 + 6000 + 500 + 9800);
    expect(L.outflow).toBe(4800 + 3000 + 1000);
    expect(L.balance).toBe(10000 + L.inflow - L.outflow);
    expect(L.rows[L.rows.length - 1].balance).toBe(L.balance);
    expect(L.warns).toEqual([]);
  });
  it("逐月現金流量：期初接上月期末、流入流出分開、期末＝最後一筆餘額", () => {
    const L = cashLedger(S5);
    expect(L.months.map((m) => m.ym)).toEqual(["2026-08", "2026-09", "2026-10"]);
    const [aug, sep, oct] = L.months;
    expect(aug.opening).toBe(10000); expect(aug.inflow).toBe(6000); expect(aug.outflow).toBe(0); expect(aug.closing).toBe(16000);
    expect(sep.opening).toBe(16000); expect(sep.inflow).toBe(6000 + 500 + 9800); expect(sep.outflow).toBe(4800 + 3000);
    expect(sep.closing).toBe(16000 + 16300 - 7800);
    expect(sep.byCat["固定支出"]).toBe(-3000);
    expect(oct.opening).toBe(sep.closing); expect(oct.closing).toBe(sep.closing - 1000);
  });
  it("固定支出實付狀態：同月同名的固定支出手記＝已付", () => {
    const f = cashFixedStatus(S5, "2026-09");
    expect(f.map((x) => [x.name, !!x.paid])).toEqual([["記帳費", true], ["商業登記", false]]);
    expect(cashFixedStatus(S5, "2026-10")).toEqual([]);
  });
  it("期初日之後才有進出才不警示；有更早的列就提醒", () => {
    const L = cashLedger({ ...S5, cash: { opening: { amount: 0, from: "2026-09-01" }, entries: [] } });
    expect(L.warns.length).toBe(1);
  });
  it("尚未匯款總表：跨月、只列還要匯 > 0 的、按結算月排、帶發放日；匯出列帶帳號與扣繳", () => {
    const u = unpaidPayouts(S5);
    // 2026-08：創造共好 4,800 已全匯 → 不列；2026-09：創造共好 4,800＋600、講師一 3,440、邱浩軍 2,940 − 已匯 1,000、講師二 860（同月按應付高→低）
    expect(u.rows.map((r) => [r.ym, r.line.payee, Math.round(r.line.remaining)])).toEqual([["2026-09", "創造共好", 5400], ["2026-09", "講師一", 3440], ["2026-09", "邱浩軍", 1940], ["2026-09", "講師二", 860]]);
    expect(u.byYm).toEqual([{ ym: "2026-09", payDate: "2026-10-05", n: 4, total: u.total }]);
    expect(Math.round(u.total)).toBe(11640);
    const rows = unpaidCsvRows(S5);
    expect(rows.length).toBe(4);
    expect(rows[0].length).toBe(UNPAID_CSV_HEADERS.length);
    expect(rows[2]).toEqual(["2026-09", "2026-10-05", "邱浩軍", "808", "玉山", "中和", "邱浩軍", "0012345678", "扣執行業務所得", "2940", "0", "2940", "1000", "1940"]);
    expect(rows[0][8]).toBe("未建受款人");
  });
});

describe("拆分列：角色＋預設受款人（2026/10/16）", () => {
  const lecture: AcctItem = { id: "lec", name: "每月講座", price: 10000, splits: [{ to: "", role: "講師費", mode: "pct", v: 40 }, { to: "場地公司", role: "場地費", mode: "amt", v: 1000 }, { to: "公司", mode: "keep", v: 10 }, { to: "", role: "助教費", mode: "rest", v: 20 }] };
  it("沒預設受款人、這筆也沒指定 → 列標「未指定」並警示；金額照算", () => {
    const r = calcReceipt(lecture, 10000, [], {}, P);
    expect(r.rows.map((x) => [x.to, x.v, x.key])).toEqual([["（講師費 未指定）", 4000, "講師費"], ["場地公司", 1000, "場地費"], ["公司", 1000, "公司"], ["（助教費 未指定）", 800, "助教費"]]);
    expect(r.warn).toBe("講師費、助教費 還沒指定匯給誰");
    expect(r.rows[1].label).toBe("場地費 固定");
  });
  it("每筆指定用角色當鍵；有預設的可以蓋過；舊資料用受款人名當鍵也認", () => {
    const r = calcReceipt(lecture, 10000, [], { 講師費: "王老師", 場地費: "另一間", 助教費: "小陳" }, P);
    expect(r.rows.map((x) => x.to)).toEqual(["王老師", "另一間", "公司", "小陳"]);
    expect(r.warn).toBeNull();
    const legacy: AcctItem = { id: "t", name: "培訓", price: 9800, splits: [{ to: "講師一", mode: "rest", v: 100 }] };
    expect(calcReceipt(legacy, 1000, [], { 講師一: "王老師" }, P).rows[0].to).toBe("王老師");
    expect(calcReceipt(legacy, 1000, [], {}, P).rows[0].to).toBe("講師一");
    // 角色改名前記的收款（鍵＝舊受款人名）：拆回角色後照樣對得到
    const renamed: AcctItem = { id: "t", name: "培訓", price: 9800, splits: [{ to: "邱浩軍", role: "講師一", mode: "rest", v: 100 }] };
    expect(calcReceipt(renamed, 1000, [], { 邱浩軍: "王老師" }, P).rows[0].to).toBe("王老師");
    expect(calcReceipt(renamed, 1000, [], {}, P).rows[0].to).toBe("邱浩軍");
  });
  it("normItems 保留 role、去空白；keep 列沒名字算公司", () => {
    const it = normItems([{ id: "x", name: "x", price: 1, splits: [{ to: " 甲 ", role: " 講師費 ", mode: "pct", v: 10 }, { to: "", mode: "keep", v: 5 }] }])[0];
    expect(it.splits[0]).toEqual({ to: "甲", role: "講師費", mode: "pct", v: 10 });
    expect(it.splits[1].role).toBeUndefined();
    expect(calcReceipt(it, 100, [], {}, P).rows[1].to).toBe("公司");
    expect(unitOf(it).rows[0].key).toBe("講師費");
  });
});

describe("個別型拆分 each（2026/10/16 Ray：常態型／個別型兩區塊）", () => {
  it("each 列即使有 to 也不當預設；normItems 清掉 to、保留 each；isEachSplit 判定", () => {
    const it = normItems([{ id: "x", name: "x", price: 1, splits: [{ to: "舊的人", role: "講師費", mode: "pct", v: 40, each: true }, { to: "甲", role: "場地費", mode: "amt", v: 100 }, { to: "", mode: "keep", v: 5 }] }])[0];
    expect(it.splits[0]).toEqual({ to: "", role: "講師費", each: true, mode: "pct", v: 40 });
    expect(it.splits.map(isEachSplit)).toEqual([true, false, false]);
    expect(calcReceipt(it, 1000, [], {}, P).warn).toBe("講師費 還沒指定匯給誰");
    expect(calcReceipt(it, 1000, [], { 講師費: "王老師" }, P).rows[0].to).toBe("王老師");
  });
});
