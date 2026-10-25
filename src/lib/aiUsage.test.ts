import { describe, it, expect, vi } from "vitest";

vi.mock("@/Shared/db", () => ({ db: {} }));
vi.mock("@/Shared/db/schema", () => ({ aiUsage: { coachId: "coach_id", createdAt: "created_at", inputTokens: "i", outputTokens: "o", opsProposed: "p" } }));

import { monthStartTaipei } from "./aiUsage";

/** 月上限以台灣的月份為界：台北 11/1 00:30 已經是新的一個月，UTC 還是 10/31。 */
describe("monthStartTaipei", () => {
  it("UTC 10/31 16:30 ＝ 台北 11/1 00:30 → 月初是台北 11/1 00:00（UTC 10/31 16:00）", () => {
    const now = new Date("2026-10-31T16:30:00Z");
    expect(monthStartTaipei(now).toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });
  it("UTC 10/31 15:30 ＝ 台北 10/31 23:30 → 月初還是台北 10/1 00:00", () => {
    const now = new Date("2026-10-31T15:30:00Z");
    expect(monthStartTaipei(now).toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });
});
