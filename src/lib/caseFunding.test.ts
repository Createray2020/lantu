import { describe, it, expect } from "vitest";
import { caseFunding, grossOf, normReceipt, PAYMENT_METHODS, isPaymentMethod } from "./acctEngine";

/** 收款門檻（2026/10/28 Ray 定案：一期全額確認；用客戶實付總額比應收，手續費另記）。 */
describe("收款案件門檻", () => {
  const R = (o: Partial<Parameters<typeof grossOf>[0]> & { void?: boolean; verified?: boolean }) => ({ amount: 0, gross: null, refund: 0, void: false, verified: true, ...o });
  it("gross 沒填＝amount；有填就用 gross；退款扣掉", () => {
    expect(grossOf(R({ amount: 30000 }))).toBe(30000);
    expect(grossOf(R({ amount: 29100, gross: 30000 }))).toBe(30000);
    expect(grossOf(R({ amount: 30000, refund: 5000 }))).toBe(25000);
  });
  it("只有已確認的算；待查帳另計；作廢不計；達門檻＝已確認 ≥ 應收", () => {
    const f = caseFunding([R({ amount: 10000 }), R({ amount: 20000, verified: false }), R({ amount: 999, void: true })], 30000);
    expect(f).toEqual({ confirmed: 10000, pending: 20000, met: false });
    expect(caseFunding([R({ amount: 29100, gross: 30000 })], 30000).met).toBe(true); // 刷卡扣手續費後淨入帳較少，不能判沒付清
    expect(caseFunding([R({ amount: 15000 }), R({ amount: 15000 })], 30000).met).toBe(true); // 分兩次匯
    expect(caseFunding([], 0).met).toBe(false); // 應收 0 又沒收到任何錢＝沒有門檻可過
    expect(caseFunding([R({ amount: 1 })], 0).met).toBe(true);
  });
  it("normReceipt 帶出案件欄位；舊資料預設 client_service", () => {
    const r = normReceipt({ on: "2026-10-28", itemId: "t", amount: 29100, gross: "30000", fee: 900, method: "card", methodFields: { txn: "ORD-1", "bad key!": "x", gateway: "藍新" }, caseType: "training", caseId: "enr-1" }, "id1");
    expect(r).toMatchObject({ caseType: "training", caseId: "enr-1", gross: 30000, fee: 900, method: "card", methodFields: { txn: "ORD-1", gateway: "藍新" } });
    const old = normReceipt({ on: "2026-01-01", itemId: "c", amount: 60000 }, "id2");
    expect(old).toMatchObject({ caseType: "client_service", gross: null, fee: 0, method: "", methodFields: {} });
    expect(normReceipt({ on: "2026-01-01", itemId: "c", amount: 1, method: "paypal" }, "x").method).toBe("");
    expect(normReceipt({ on: "2026-01-01", itemId: "c", amount: 30000, gross: 29000 }, "x").gross).toBeNull(); // 填反了＝沒填
  });
  it("付款方式表：每種都有欄位，分期有期數", () => {
    expect(PAYMENT_METHODS.map((m) => m.value)).toEqual(["bank", "card", "card_installment", "zero_installment", "other"]);
    expect(PAYMENT_METHODS.find((m) => m.value === "card_installment")!.fields.some((f) => f.key === "periods")).toBe(true);
    expect(isPaymentMethod("bank")).toBe(true);
    expect(isPaymentMethod("cash")).toBe(false);
  });
});
