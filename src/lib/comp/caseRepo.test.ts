import { describe, it, expect } from "vitest";
import { computePayouts } from "./caseRepo";
import { V4_PRESET } from "./preset";
import type { AdvisorRow } from "./chain";

// computePayouts 是「案件 → 分潤明細」的完整路徑（解析輔導鏈＋代管 → 引擎）。
// 這一層要保證：後台看到的數字＝辦法算出來的數字，且退費後按實收重算。

const P = V4_PRESET;
const ORG: AdvisorRow[] = [
  { id: "chief", name: "首席", rankCode: "CHIEF", uplineId: null },
  { id: "s2", name: "阿凱", rankCode: "S2", uplineId: "chief" },
  { id: "c1", name: "小陳", rankCode: "C1", uplineId: "s2" },
  { id: "s1", name: "家慶", rankCode: "S1", uplineId: "chief" },
  { id: "c2a", name: "推薦人", rankCode: "C2", uplineId: "s1" },
  { id: "c2b", name: "新人", rankCode: "C2", uplineId: "c2a" },
];

const base = { fee: 60_000, isCompanyLead: false, refundAmount: 0 };
const pctOf = (r: ReturnType<typeof computePayouts>, id: string | null) =>
  r.lines.find((l) => l.payeeId === id)?.totalPct ?? null;
const amtOf = (r: ReturnType<typeof computePayouts>, id: string | null) =>
  r.lines.find((l) => l.payeeId === id)?.amount ?? null;

describe("computePayouts", () => {
  it("自推自執：對上辦法範例一", () => {
    const r = computePayouts({ ...base, promoterId: "c1", executorId: "c1" }, ORG, P);
    expect(pctOf(r, "c1")).toBe(45);
    expect(amtOf(r, "c1")).toBe(27_000);
    expect(pctOf(r, "s2")).toBe(31);
    expect(pctOf(r, "chief")).toBe(14);
    expect(r.balanced).toBe(true);
  });

  it("公司派案：推廣端全歸公司（範例二）", () => {
    const r = computePayouts(
      { ...base, isCompanyLead: true, promoterId: null, executorId: "s1" }, ORG, P,
    );
    expect(pctOf(r, "s1")).toBe(43);
    expect(pctOf(r, "chief")).toBe(17);
    const company = r.lines.filter((l) => l.payeeId === null).reduce((a, l) => a + l.totalPct, 0);
    expect(company).toBe(40);
  });

  it("代管：推薦人不在分潤名單，改由代管者計算（附錄 D），並在 skipped 說明原因", () => {
    const r = computePayouts({ ...base, promoterId: "c2b", executorId: "c2b" }, ORG, P);
    expect(pctOf(r, "c2b")).toBe(51);
    expect(pctOf(r, "s1")).toBe(16);
    expect(pctOf(r, "chief")).toBe(23);
    expect(pctOf(r, "c2a")).toBeNull();
    expect(r.skipped[0]).toContain("代管");
  });

  it("推廣與執案分屬不同人時各走各的鏈（附錄 B）", () => {
    const org: AdvisorRow[] = [
      { id: "chief", name: "首席", rankCode: "CHIEF", uplineId: null },
      { id: "s3", name: "浩軍", rankCode: "S3", uplineId: "chief" },
      { id: "s2", name: "阿凱", rankCode: "S2", uplineId: "s3" },
      { id: "c1", name: "小陳", rankCode: "C1", uplineId: "s2" },
    ];
    const r = computePayouts({ ...base, promoterId: "c1", executorId: "s3" }, org, P);
    expect(pctOf(r, "c1")).toBe(15);
    expect(pctOf(r, "s2")).toBe(11);
    expect(pctOf(r, "s3")).toBe(59);
    expect(pctOf(r, "chief")).toBe(5);
    expect(r.balanced).toBe(true);
  });

  it("部分退費：以實收金額重算，比例不變、金額等比縮小", () => {
    const full = computePayouts({ ...base, promoterId: "c1", executorId: "c1" }, ORG, P);
    const half = computePayouts(
      { ...base, promoterId: "c1", executorId: "c1", refundAmount: 30_000 }, ORG, P,
    );
    expect(pctOf(half, "c1")).toBe(pctOf(full, "c1"));
    expect(amtOf(half, "c1")).toBe(13_500);
    expect(half.lines.reduce((a, l) => a + l.amount, 0)).toBe(30_000);
  });

  it("全額退費：分潤歸零但仍平衡（不會產生負數或殘留金額）", () => {
    const r = computePayouts(
      { ...base, promoterId: "c1", executorId: "c1", refundAmount: 60_000 }, ORG, P,
    );
    expect(r.lines.every((l) => l.amount === 0)).toBe(true);
    expect(r.balanced).toBe(true);
  });

  it("找不到執案顧問時回錯誤而不是丟例外", () => {
    const r = computePayouts({ ...base, promoterId: null, executorId: "ghost" }, ORG, P);
    expect(r.lines).toEqual([]);
    expect(r.warnings[0]).toContain("找不到");
  });

  it("制度全空白時不會炸，只是把警告帶出來", () => {
    const r = computePayouts(
      { ...base, promoterId: "c1", executorId: "c1" }, ORG,
      { settings: {}, ranks: [], thresholds: [] },
    );
    expect(r.warnings.join()).toContain("未設定");
  });
});
