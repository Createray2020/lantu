import { describe, it, expect } from "vitest";
import { calcMonth, calcTarget, compareMonth, suggestQty, calcData, normItems as normItems2, unitOf, breakeven, goalSolve, leverSensitivity, prevYm, nextYm, normItems, normMonth, normTarget, type AcctState } from "./acctEngine";

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
  params: { vatRate: 5 },
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
