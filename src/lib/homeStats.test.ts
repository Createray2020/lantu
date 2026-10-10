import { describe, it, expect } from "vitest";
import { memberMoney, promoProgress, termInfo, teamMoney, applyFunnel, companyMonth, periodOf, rangeOptions, payoutsOver, monthsOver, hasReceipts } from "./homeStats";
import { normReceipt, type AcctState, type AcctItem, type PayeeRec } from "./acctEngine";
import type { CompParams } from "./comp/types";

// 首頁彙總層（2026/10/09）：錢從分潤匯款、晉升從制度門檻、到期從合作期限、報聘從申請表。
const P: AcctState["params"] = { vatRate: 5, poolTiers: [[30], [25, 5]], tax: { withholdRate: 10, nhiRate: 2.11, threshold: 20000 }, referralRates: { INTERN: 10, PARTNER: 10, C1: 20, C2: 20, C3: 20, S1: 25, S2: 25, S3: 25, CHIEF: 30 }, referralCap: 30, annualFee: {}, earlyApplyFee: 6000 };
const items: AcctItem[] = [
  { id: "train", name: "培訓費", price: 9800, splits: [{ to: "分潤", mode: "pool", v: 0 }, { to: "公司", mode: "keep", v: 20 }, { to: "創造共好", mode: "amt", v: 600 }, { to: "講師一", mode: "rest", v: 100 }] },
  { id: "consult", name: "顧問費", price: 0, source: "case", splits: [] },
];
const chiu = { id: "c-chiu", name: "邱浩軍", rankCode: "CHIEF", uplineId: null, licenseUntil: "2027-08-31", status: "active" };
const chen = { id: "c-chen", name: "陳昱豪", rankCode: "S3", uplineId: "c-chiu", licenseFrom: "2026-09-08", licenseUntil: "2027-09-07", status: "active" };
const intern = { id: "c-int", name: "小實", rankCode: "INTERN", uplineId: "c-chen", licenseFrom: "2026-09-01", licenseUntil: "2027-02-27", status: "active" };
const book: PayeeRec[] = [{ id: "pa", coachId: "c-chiu", name: "邱浩軍", bankCode: "808", bankName: "玉山", branch: "", accountName: "邱", accountNo: "123", taxMode: "withhold", note: "" }];
const rc = (id: string, itemId: string, on: string, amount: number, payer: string, extra: Record<string, unknown> = {}) => normReceipt({ itemId, on, amount, payer, ...extra }, id);
const S: AcctState = {
  items, months: { "2026-08": { qty: {}, fixed: [{ name: "記帳費", amt: 3000 }] }, "2026-09": { qty: {}, fixed: [{ name: "記帳費", amt: 3000 }] } }, targets: {}, draft: null, params: P, goal: { netTarget: 0 },
  coachList: [chiu, chen, intern].map((c) => ({ id: c.id, name: c.name, rankCode: c.rankCode, uplineId: c.uplineId })), payeeBook: book,
  receipts: { "2026-09": [
    rc("r1", "train", "2026-09-22", 9800, "A", { sharers: [{ name: "陳昱豪", coachId: "c-chen", rankCode: "S3" }, { name: "邱浩軍", coachId: "c-chiu", rankCode: "CHIEF" }] }),
    rc("r2", "consult", "2026-09-25", 60000, "客戶甲", { clientId: "k1", execCoachId: "c-chen", promoCoachId: "c-chen", verified: true, allocs: [{ to: "陳昱豪", v: 51000, mode: "pct", label: "85%", coachId: "c-chen" }, { to: "邱浩軍", v: 3000, mode: "pct", label: "5%", coachId: "c-chiu" }, { to: "公司營運", v: 6000, mode: "keep", label: "公司營運" }] }),
    rc("r3", "consult", "2026-09-28", 30000, "客戶乙", { clientId: "k2", execCoachId: "c-chen", verified: false }),   // 待查帳
  ], "2026-08": [
    rc("r0", "train", "2026-08-10", 9800, "B", { sharers: [{ name: "邱浩軍", coachId: "c-chiu", rankCode: "CHIEF" }] }),
  ] },
  payouts: { "2026-09": { "p:pa": { paidOn: "2026-10-05", amount: 1000, note: "" } } },
};
const params: CompParams = { settings: { applyMinCases: 1, applyMinFees: 30000 }, ranks: [], thresholds: [
  { kind: "promotion_a", toCode: "S2", fromCode: "S1", cases: 15, fees: 450000 },
  { kind: "promotion_a", toCode: "CHIEF", fromCode: "S3", cases: 35, fees: 1050000 },
] };

describe("教練：我的錢", () => {
  it("本月應付／扣繳／實匯、已匯狀態、近 6 月、待查帳、收款設定", () => {
    const m = memberMoney(S, chiu, "2026-09");
    expect(m.due).toBe(490 + 3000);            // 培訓差階 5% ＋ 顧問費差階
    expect(m.withhold).toBe(0);                // 未達 20,000
    expect(m.net).toBe(3490);
    expect(m.status).toBe("partial");
    expect(m.paid).toBe(1000);
    expect(m.months.map((x) => x.ym)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(m.months[4].net).toBe(2940);
    expect(m.payeeReady).toBe(true);
    expect(m.taxMode).toBe("withhold");
    expect(m.payDate).toBe("2026-10-05");
    const c = memberMoney(S, chen, "2026-09");
    expect(c.net).toBe(2450 + 51000);
    expect(c.status).toBe("pending");
    expect(c.payeeReady).toBe(false);
    expect(c.unverified).toEqual({ n: 1, amount: 30000 });   // r3 待查帳不算錢，但要提醒
  });
});

describe("晉升進度（V7.2）", () => {
  it("正式職級看 A 軌門檻；件數＝已確認的顧問費收款、同客戶同年一案", () => {
    const p = promoProgress(S, params, chen);
    expect(p.kind).toBe("promote");
    expect(p.nextCode).toBe("CHIEF");
    expect(p.cases).toBe(1);               // r3 待查帳不算
    expect(p.fees).toBe(60000);
    expect(p.pct).toBe(Math.min(Math.round(1 / 35 * 100), Math.round(60000 / 1050000 * 100)));
    expect(p.met).toBe(false);
  });
  it("實習／結業看報聘門檻（1 件 30,000）", () => {
    const p = promoProgress(S, params, intern);
    expect(p.kind).toBe("apply");
    expect(p.needFees).toBe(30000);
    expect(p.met).toBe(false);
    const S2: AcctState = { ...S, receipts: { "2026-09": [rc("x", "consult", "2026-09-01", 30000, "客", { clientId: "k9", execCoachId: "c-int", verified: true })] } };
    expect(promoProgress(S2, params, intern).met).toBe(true);
  });
  it("最高職級／未定級", () => {
    expect(promoProgress(S, { ...params, thresholds: [] }, chiu).kind).toBe("top");
    expect(promoProgress(S, params, { id: "z", name: "z", rankCode: null }).kind).toBe("unranked");
  });
});

describe("到期倒數", () => {
  it("實習 180 天從起算日算；正式看年度合作到期；30 天內警示", () => {
    const t = termInfo(intern, "2027-02-01");
    expect(t.kind).toBe("intern");
    expect(t.until).toBe("2027-02-27");
    expect(t.daysLeft).toBe(26);
    expect(t.warn).toBe(true);
    const l = termInfo(chen, "2026-10-09");
    expect(l.kind).toBe("license");
    expect(l.warn).toBe(false);
    expect(termInfo({ id: "n", name: "n" }, "2026-10-09").kind).toBe("none");
  });
});

describe("主管：團隊", () => {
  it("成員實匯排序、待查帳、接近晉升人數", () => {
    const t = teamMoney(S, params, [chen, intern], "2026-09");
    expect(t.rows[0].id).toBe("c-chen");
    expect(t.total).toBe(2450 + 51000);
    expect(t.unverified).toEqual({ n: 1, amount: 30000 });
    expect(t.nearPromo).toBe(0);
  });
});

describe("報聘漏斗", () => {
  it("申請中／等推薦人／待審核，只算範圍內的", () => {
    const apps = [{ coachId: "p1", introducerId: "c-chen", introducerState: "pending" }, { coachId: "p2", introducerId: "c-chen", introducerState: "confirmed" }];
    const pend = [{ id: "p1", name: "新人一", uplineId: "c-chen" }, { id: "p2", name: "新人二", uplineId: "c-chen" }, { id: "p3", name: "別隊", uplineId: "zzz" }];
    const f = applyFunnel(apps, pend, new Set(["c-chen", "c-int"]), "c-chen");
    expect(f.steps.map((s) => s.value)).toEqual([2, 1, 1]);
    expect(f.referredByMe).toBe(2);
    expect(f.pending.map((p) => p.tag)).toEqual(["推薦人", "審核"]);
  });
});

describe("核心成員：公司", () => {
  it("損益接本月帳務、趨勢 8 個月、身分結構、到期、健康度", () => {
    const c = companyMonth(S, [chiu, chen, intern], "2026-09", "2026-10-09", { maintainPass: 1, maintainTotal: 2, checkinDone: 3, checkinTotal: 4, chains: [{ id: "c-chen", name: "陳團隊", memberIds: ["c-chen", "c-int"] }] });
    expect(c.r!.rev).toBe(9800 + 60000);
    expect(c.r!.gp).toBe(1960 + 6000);
    expect(c.trend).toHaveLength(8);
    expect(c.trend[7].ym).toBe("2026-09");
    expect(c.bodies.map((b) => b.n)).toEqual([1, 0, 0, 1, 1]);
    expect(c.expired).toBe(0);
    expect(c.chains[0]).toMatchObject({ name: "陳團隊", net: 2450 + 51000, headcount: 2 });
    expect(c.health.map((h) => h.label)).toEqual(["合作有效", "維持資格", "推薦動能", "回訪完成", "對帳完成"]);
    expect(c.health[1].pct).toBe(50);
    expect(c.health[3].pct).toBe(75);
    expect(c.payouts.pending).toEqual({ n: 1, amount: 30000 });
  });
});

// 2026/10/10 Ray：首頁可切本月／第一～四季（本季）／上下半年／全年。
describe("期間（本月／本季／半年／全年）", () => {
  it("periodOf：鍵對到月份串；不認得的鍵退回本月", () => {
    expect(periodOf("month", "2026-10-10")).toMatchObject({ key: "month", yms: ["2026-10"], label: "2026年10月", multi: false, current: true });
    expect(periodOf("q4", "2026-10-10")).toMatchObject({ key: "q4", yms: ["2026-10", "2026-11", "2026-12"], label: "2026 第四季", from: "2026-10", to: "2026-12", multi: true, current: true });
    expect(periodOf("q1", "2026-10-10")).toMatchObject({ yms: ["2026-01", "2026-02", "2026-03"], current: false });
    expect(periodOf("h1", "2026-10-10").yms).toHaveLength(6);
    expect(periodOf("h2", "2026-10-10")).toMatchObject({ from: "2026-07", to: "2026-12", current: true });
    expect(periodOf("year", "2026-10-10")).toMatchObject({ yms: Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`), label: "2026 全年" });
    expect(periodOf("zzz", "2026-10-10").key).toBe("month");
    expect(periodOf(undefined, "2026-03-05").yms).toEqual(["2026-03"]);
  });
  it("rangeOptions：本季標出來", () => {
    const o = rangeOptions("2026-10-10");
    expect(o.map((x) => x.key)).toEqual(["month", "q1", "q2", "q3", "q4", "h1", "h2", "year"]);
    expect(o.find((x) => x.key === "q4")!.label).toBe("第四季（本季）");
    expect(o.find((x) => x.key === "q3")!.label).toBe("第三季");
    expect(rangeOptions("2026-02-01").find((x) => x.key === "q1")!.label).toBe("第一季（本季）");
  });
  it("payoutsOver：跨月同一受款人併一條、已匯加總、發放日取最後一個月", () => {
    const q3 = payoutsOver(S, ["2026-07", "2026-08", "2026-09"]);
    const chiuLine = q3.lines.find((l) => l.key === "p:pa")!;
    expect(chiuLine.due).toBe(2940 + 3490);
    expect(chiuLine.tax.net).toBe(6430);
    expect(chiuLine.mark).toMatchObject({ amount: 1000 });
    expect(chiuLine.srcs).toHaveLength(3);
    expect(q3.payDate).toBe("2026-10-05");
    expect(q3.received).toBe(9800 + 9800 + 60000);
    expect(q3.pending).toEqual({ n: 1, amount: 30000 });
    // 單月就是 payoutsOf
    expect(payoutsOver(S, "2026-09").lines.find((l) => l.key === "p:pa")!.due).toBe(3490);
  });
  it("monthsOver：損益跨月相加；沒帳的月份略過；整段沒帳回 null", () => {
    const r = monthsOver(S, ["2026-07", "2026-08", "2026-09"])!;
    expect(r.rev).toBe(9800 + 9800 + 60000);
    expect(r.fixed).toBe(6000);
    expect(r.gp).toBe(1960 + 1960 + 6000);
    expect(r.gm).toBeCloseTo(r.gp / r.rev);
    expect(r.byItem.find((x) => x.it.id === "train")!.rcN).toBe(2);
    expect(monthsOver(S, ["2026-01", "2026-02"])).toBeNull();
    expect(hasReceipts(S, ["2026-07", "2026-08"])).toBe(true);
    expect(hasReceipts(S, ["2026-01"])).toBe(false);
  });
  it("memberMoney／teamMoney／companyMonth 吃期間：錢加總、逐月圖只畫期間內的月份", () => {
    const yms = ["2026-07", "2026-08", "2026-09"];
    const m = memberMoney(S, chiu, yms);
    expect(m.net).toBe(6430);
    expect(m.paid).toBe(1000);
    expect(m.status).toBe("partial");
    expect(m.ym).toBe("2026-09");
    expect(m.months.map((x) => x.ym)).toEqual(yms);
    expect(m.months.map((x) => x.net)).toEqual([0, 2940, 3490]);
    const t = teamMoney(S, params, [chen, intern], yms);
    expect(t.total).toBe(2450 + 51000);
    const c = companyMonth(S, [chiu, chen, intern], yms, "2026-10-09");
    expect(c.ym).toBe("2026-09");
    expect(c.r!.rev).toBe(79600);
    expect(c.trend.map((x) => x.ym)).toEqual(yms);
    expect(c.trend[1].rev).toBe(9800);
    expect(c.health[2].pct).toBe(Math.round(2 / 3 * 100));   // 推薦動能：Q3 內陳＋邱當過推薦人
  });
});
