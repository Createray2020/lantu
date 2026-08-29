import { describe, it, expect } from "vitest";
import { hasPaidPayout, isReversalKey, planReversals, REVERSAL_KEY_SEP } from "./reversal";

/**
 * 已發放案件的退費＝負數沖回列（Ray 2026/08 拍板）。
 *
 * 舊版是「標 void 再整批重算」，但 paid 列刻意不動，而 partial unique 是
 * `(case_id, payee_key) where status <> 'void'` —— paid 舊列與新 pending 列
 * (case_id, payee_key) 完全相同，必定衝突；更糟的是 void 先成功、insert 才炸，
 * 那批 pending 被永久標 void 而沒有新列補上，應付分潤憑空消失。
 *
 * 這一支守的是沖回列本身的形狀：金額、符號、唯一鍵。
 */

const paid = (payeeId: string | null, key: string, name: string, amount: number) => ({
  payeeId, payeeKey: key, payeeName: name, kind: "advisor",
  role: "執案", rankCode: "C1", amount, status: "paid",
});

// 顧問費 60,000 的一筆案件，全鏈已發放。
const PAYOUTS = [
  paid("c1", "c1", "小陳", 27_000),
  paid("s2", "s2", "阿凱", 18_600),
  paid("chief", "chief", "首席", 8_400),
  { ...paid(null, "company_ops", "公司", 6_000), kind: "company_ops", role: null },
];

describe("金額與符號", () => {
  it("部分退費：按比例、一律負數，合計等於退費金額", () => {
    const lines = planReversals(PAYOUTS, 60_000, 30_000);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.amount < 0)).toBe(true);
    expect(lines.map((l) => l.amount)).toEqual([-13_500, -9_300, -4_200, -3_000]);
    expect(lines.reduce((a, l) => a + l.amount, 0)).toBe(-30_000);
  });

  it("全額退費：沖回金額等於原本發出去的全部", () => {
    const lines = planReversals(PAYOUTS, 60_000, 60_000);
    expect(lines.reduce((a, l) => a + l.amount, 0)).toBe(-60_000);
    expect(lines.map((l) => l.amount)).toEqual([-27_000, -18_600, -8_400, -6_000]);
  });

  it("退費超過顧問費時比例封頂在 100%，不會沖回比發出去更多的錢", () => {
    const lines = planReversals(PAYOUTS, 60_000, 90_000);
    expect(lines.reduce((a, l) => a + l.amount, 0)).toBe(-60_000);
  });

  it("增量是 0 或負的（退費金額沒有往上調）就不產生任何列", () => {
    expect(planReversals(PAYOUTS, 60_000, 0)).toEqual([]);
    expect(planReversals(PAYOUTS, 60_000, -10_000)).toEqual([]);
  });

  it("顧問費是 0 的案件不會除以零", () => {
    expect(planReversals(PAYOUTS, 0, 10_000)).toEqual([]);
  });

  it("原金額 0 的列沒有東西可以沖回（不產生 -0 的空列）", () => {
    const lines = planReversals([paid("c1", "c1", "小陳", 0)], 60_000, 30_000);
    expect(lines).toEqual([]);
  });

  it("沖回列不帶百分比：驗算是「全鏈合計 100%」，沖回列摻進去就會誤報未平衡", () => {
    const [l] = planReversals(PAYOUTS, 60_000, 30_000);
    expect(l).not.toHaveProperty("totalPct");
    expect(l.trace.join()).toContain("退費沖回");
  });
});

describe("只沖已發放的列", () => {
  it("pending／batched 的錢還沒出去，不用負數列去抵", () => {
    const mixed = [
      paid("c1", "c1", "小陳", 27_000),
      { ...paid("s2", "s2", "阿凱", 18_600), status: "pending" },
      { ...paid("chief", "chief", "首席", 8_400), status: "batched" },
    ];
    const lines = planReversals(mixed, 60_000, 60_000);
    expect(lines.map((l) => l.payeeId)).toEqual(["c1"]);
  });

  it("一筆都沒發放時不產生沖回列（那條路要走重算）", () => {
    const none = PAYOUTS.map((p) => ({ ...p, status: "pending" }));
    expect(planReversals(none, 60_000, 60_000)).toEqual([]);
    expect(hasPaidPayout(none)).toBe(false);
    expect(hasPaidPayout(PAYOUTS)).toBe(true);
  });
});

describe("不撞 (case_id, payee_key) 的唯一鍵", () => {
  it("沖回列的 payeeKey 與原列不同，而且彼此不重複", () => {
    const lines = planReversals(PAYOUTS, 60_000, 30_000);
    const orig = new Set(PAYOUTS.map((p) => p.payeeKey));
    for (const l of lines) {
      expect(orig.has(l.payeeKey)).toBe(false);
      expect(isReversalKey(l.payeeKey)).toBe(true);
    }
    expect(new Set(lines.map((l) => l.payeeKey)).size).toBe(lines.length);
    expect(lines[0].payeeKey).toBe(`c1${REVERSAL_KEY_SEP}1`);
  });

  it("分次退費：第二次的序號接續下去，不會撞到第一次寫進去的沖回列", () => {
    const first = planReversals(PAYOUTS, 60_000, 20_000);
    // 第一批沖回列已經在 DB 裡（非 void，所以會被 listPayouts 撈回來）
    const after = [
      ...PAYOUTS,
      ...first.map((l) => ({
        payeeId: l.payeeId, payeeKey: l.payeeKey, payeeName: l.payeeName,
        kind: l.kind, role: l.role, rankCode: l.rankCode, amount: l.amount, status: "pending",
      })),
    ];
    const second = planReversals(after, 60_000, 10_000);
    expect(second.map((l) => l.payeeKey)).toEqual([
      `c1${REVERSAL_KEY_SEP}2`, `s2${REVERSAL_KEY_SEP}2`,
      `chief${REVERSAL_KEY_SEP}2`, `company_ops${REVERSAL_KEY_SEP}2`,
    ]);
    // 沖回列自己不會再被沖回一次
    expect(second).toHaveLength(4);
    // 兩次加起來＝累計退費 30,000
    expect([...first, ...second].reduce((a, l) => a + l.amount, 0)).toBe(-30_000);
  });

  it("公司列（payeeId 是 null）照樣沖得回來——唯一鍵走的是 payeeKey 不是 payeeId", () => {
    const lines = planReversals(PAYOUTS, 60_000, 60_000);
    const company = lines.find((l) => l.payeeId === null)!;
    expect(company.payeeKey).toBe(`company_ops${REVERSAL_KEY_SEP}1`);
    expect(company.amount).toBe(-6_000);
  });
});
