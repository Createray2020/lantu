import { describe, it, expect } from "vitest";
import { calcReceipt, payoutsOf, normReceipt, normParams, calcMonth, type AcctItem, calcTarget, compareMonth, suggestQty, calcData, normItems as normItems2, unitOf, breakeven, goalSolve, leverSensitivity, prevYm, nextYm, normItems, normMonth, normTarget, type AcctState } from "./acctEngine";

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
  params: { vatRate: 5, poolTiers: [[30], [25, 5]] },
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
const P: AcctState["params"] = { vatRate: 5, poolTiers: [[30], [25, 5]] };
const ITEMS: Record<"annual" | "train" | "academy" | "event", AcctItem> = {
  annual: { id: "annual", name: "年度合作費（報聘）", price: 6000, splits: [{ to: "創造共好", mode: "amt", v: 4800 }, { to: "分潤", mode: "pool", v: 0 }] },
  train: { id: "train", name: "培訓費", price: 9800, splits: [{ to: "分潤", mode: "pool", v: 0 }, { to: "公司", mode: "keep", v: 20 }, { to: "創造共好", mode: "amt", v: 600 }, { to: "講師一", mode: "rest", v: 80 }, { to: "講師二", mode: "rest", v: 20 }] },
  academy: { id: "academy", name: "學院・年度方案", price: 4800, cat: "嵐途學院", splits: [{ to: "分潤", mode: "pool", v: 0 }] },
  event: { id: "event", name: "8/8 一日培訓", price: 600, cat: "活動", splits: [{ to: "講師車馬費", mode: "pct", v: 37.5 }, { to: "場地", mode: "pct", v: 62.5 }] },
};
const two = [{ name: "陳昱豪" }, { name: "邱浩軍" }];

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
    const r = calcReceipt(ITEMS.train, 9800, [{ name: "邱浩軍" }], {}, P);
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
    const t = calcReceipt(ITEMS.academy, 300, [{ name: "謝采恩" }, { name: "邱浩軍" }], {}, P);
    expect(t.rows.map((x) => x.v)).toEqual([75, 15]);
    expect(t.company).toBe(210);
  });
  it("8/8 一日培訓：600 × 3000/8000 講師車馬費、× 5000/8000 場地，公司 0", () => {
    const r = calcReceipt(ITEMS.event, 600, [], {}, P);
    expect(r.rows.map((x) => x.v)).toEqual([225, 375]);
    expect(r.company).toBe(0);
  });
  it("三位分潤人但切法表只到兩人：用兩人那一階、第三位 0，並給警示", () => {
    const r = calcReceipt(ITEMS.academy, 4800, [...two, { name: "第三位" }], {}, P);
    expect(r.rows.map((x) => x.v)).toEqual([1200, 240, 0]);
    expect(r.warn).toContain("3 位");
    const r3 = calcReceipt(ITEMS.academy, 4800, [...two, { name: "第三位" }], {}, { ...P, poolTiers: [[30], [25, 5], [20, 5, 5]] });
    expect(r3.rows.map((x) => x.v)).toEqual([960, 240, 240]);
    expect(r3.warn).toBeNull();
  });
  it("what-if 拆分點數只動 pct 列，不動 pool／amt／keep", () => {
    const r = calcReceipt(ITEMS.event, 600, [], {}, P, { split: -5 });
    expect(r.rows.map((x) => x.v)).toEqual([195, 345]);
    const t = calcReceipt(ITEMS.train, 9800, two, {}, P, { split: -5 });
    expect(t.rows[0].v).toBeCloseTo(2450);
  });
});

describe("收款進月結與匯款對帳", () => {
  const rc = (id: string, itemId: string, on: string, amount: number, payer: string, sharers: { name: string }[] = [], payees = {}) =>
    normReceipt({ itemId, on, amount, payer, sharers, payees }, id);
  const S2: AcctState = {
    items: [ITEMS.annual, ITEMS.train, ITEMS.academy, ITEMS.event],
    months: { "2026-09": { qty: {}, fixed: [{ name: "記帳費", amt: 3000 }] } },
    targets: {}, draft: null, params: P, goal: { netTarget: 0 },
    receipts: { "2026-09": [
      rc("r1", "annual", "2026-09-02", 6000, "李沛瑄"),
      rc("r2", "annual", "2026-09-02", 6000, "王忠岳"),
      rc("r3", "train", "2026-09-22", 9800, "林祐丞", two, { 講師一: "王老師" }),
      rc("r4", "train", "2026-09-24", 9800, "Sabrina", [{ name: "邱浩軍" }], { 講師一: "王老師" }),
      rc("r5", "academy", "2026-09-30", 4800, "許家瑜", two),
      { ...rc("r6", "annual", "2026-09-23", 6000, "退費的人"), void: true },
    ] },
    payouts: { "2026-09": { 邱浩軍: { paidOn: "2026-10-05", amount: 3000, note: "" } } },
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
    expect(r.payees).toEqual({ 講師一: "王老師" });
    expect(normReceipt({ on: "2026/08/18" }, "id2").on).toBe("");
  });
  it("normParams：切法表壞值歸零、尾端空階砍掉、沒有就用預設", () => {
    expect(normParams({ vatRate: 5 }).poolTiers).toEqual([[30], [25, 5]]);
    expect(normParams({ vatRate: 5, poolTiers: [[30], ["25", "x"], [], []] }).poolTiers).toEqual([[30], [25, 0]]);
  });
});
