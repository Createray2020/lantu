import { describe, it, expect, vi } from "vitest";


// ⚠️ 這一支只驗「還沒答完就不該碰 DB」那道閘：db 的任何呼叫都直接炸掉，
//    所以測試通過本身就證明了那條路徑一次 DB 都沒打。
const boom = () => { throw new Error("不該打到 DB"); };
vi.mock("@/Shared/db", () => ({
  db: { select: boom, insert: boom, update: boom, delete: boom },
}));
vi.mock("@/Shared/db/schema", () => ({ clientRiskQuiz: {} }));
vi.mock("drizzle-orm", () => ({ and: boom, eq: boom, isNull: boom, isNotNull: boom }));

const { submitClientQuiz } = await import("./clientRiskQuiz");
const { RISK_QUESTIONS } = await import("./riskQuiz");

describe("客戶送出風險測驗", () => {
  it("⚠️ 沒答完就退回，而且一次 DB 都不打（存半成品會讓教練以為他填過了）", async () => {
    const r = await submitClientQuiz("c1", { "0": 3, "1": 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(RISK_QUESTIONS.length - 2));
  });

  it("整包不是物件時也算沒答完，不會炸掉", async () => {
    for (const bad of [null, undefined, "x", 42, []]) {
      const r = await submitClientQuiz("c1", bad);
      expect(r.ok).toBe(false);
    }
  });

  it("⚠️ 送了一堆超出範圍的索引仍然算沒答完（洗過之後就沒有有效作答了）", async () => {
    const dirty = Object.fromEntries(RISK_QUESTIONS.map((_, i) => [String(i), 99]));
    const r = await submitClientQuiz("c1", dirty);
    expect(r.ok).toBe(false);
  });
});
