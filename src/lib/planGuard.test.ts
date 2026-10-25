import { describe, it, expect } from "vitest";
import { assertPlanDataSafe, PlanDataRejected } from "./planGuard";

const ok = (d: unknown) => expect(() => assertPlanDataSafe(d)).not.toThrow();
const bad = (d: unknown, reason: string) => {
  try { assertPlanDataSafe(d); } catch (e) {
    expect(e).toBeInstanceOf(PlanDataRejected);
    expect((e as PlanDataRejected).reason).toBe(reason);
    return;
  }
  throw new Error("expected rejection");
};

describe("assertPlanDataSafe", () => {
  it("正常規劃內容放行，含 < 符號、引號、長備註", () => {
    ok({ profile: { name: "王小明", note: "年收 < 100 萬，想 5 年內買房 \"自住\"" }, goals: [{ name: "購屋 <2030>", amount: 1e7 }] });
    ok({ note: "a".repeat(4000) });
    ok({ members: [{ role: "本人" }, { role: "配偶" }], expenses: [{ cat: "生活", amount: 1 }] });
    ok({ x: null, y: undefined, z: 0, w: false });
  });
  it("擋 script / iframe / 事件屬性 / javascript:", () => {
    bad({ goals: [{ name: "<script>alert(1)</script>" }] }, "bad-markup");
    bad({ needs: [{ member: "<img src=x onerror=alert(1)>" }] }, "bad-markup");
    bad({ a: "<IFRAME src=//evil>" }, "bad-markup");
    bad({ a: "<a href=javascript:alert(1)>x</a>" }, "bad-markup");
    bad({ a: "<svg onload=alert(1)>" }, "bad-markup");
  });
  it("擋超長字串與超深巢狀", () => {
    bad({ note: "a".repeat(4001) }, "too-long");
    let deep: unknown = "x";
    for (let i = 0; i < 70; i++) deep = [deep];
    bad({ deep }, "too-deep");
  });
  it("擋原型污染鍵", () => {
    const o = JSON.parse('{"__proto__": {"polluted": 1}}');
    bad(o, "bad-markup");
  });
  it("錯誤訊息以 bad-plan-data 開頭並帶路徑", () => {
    try { assertPlanDataSafe({ goals: [{ name: "<script>" }] }); } catch (e) {
      expect((e as Error).message).toMatch(/^bad-plan-data:bad-markup@\$\.goals\[0\]\.name$/);
    }
  });
});
