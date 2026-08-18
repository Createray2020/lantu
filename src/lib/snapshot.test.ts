import { describe, it, expect } from "vitest";
import { planSnapshot, planMetrics, newCaseData } from "./snapshot";

/**
 * snapshot.ts 是**唯一會把計算結果寫進 DB 的那一層**（plans.health_grade / net_worth），
 * 稽核前整支零測試。
 *
 * plans.data 是無型別 jsonb，實際上可能是 null／空物件／舊版結構；引擎對這些一律丟例外，
 * 而舊版的 catch 把例外吞掉後 planMetrics 回 net:0 —— 版本比較頁會顯示「淨值 0 元」
 * 而不是「無法計算」，教練完全看不出資料壞掉。
 */
describe("planSnapshot / planMetrics 的髒資料契約", () => {
  const bad: unknown[] = [null, undefined, {}, [], "not an object", 42, { profile: null }];

  it.each(bad.map((v) => [JSON.stringify(v) ?? String(v), v]))(
    "壞掉的 plan.data（%s）不丟例外，且回 null 而不是 0",
    (_label, data) => {
      expect(() => planSnapshot(data)).not.toThrow();
      expect(planSnapshot(data)).toEqual({ netWorth: null, healthGrade: null });

      expect(() => planMetrics(data)).not.toThrow();
      const m = planMetrics(data);
      expect(m.grade).toBeNull();
      expect(m.net).toBeNull();
      expect(m.gap).toBeNull();
      expect(m.safety).toBeNull();
    },
  );

  it("新客戶的空白 case：算得出快照，淨值 0、階段落在 A~D", () => {
    const d = newCaseData("測試客戶");
    const s = planSnapshot(d);
    expect(["A", "B", "C", "D"]).toContain(s.healthGrade);
    expect(s.netWorth).toBe(0);
    expect((d as { profile: { name: string } }).profile.name).toBe("測試客戶");
  });

  it("新客戶不會憑空帶到示範資料的信用評分", () => {
    // newCase() 由 sampleCase() 複製而來；舊版漏了清 profile.credit，
    // 新客戶一開始就顯示 700 分，並白送約 12.5 分財務安全度。
    const d = newCaseData("測試客戶") as { profile: { credit?: unknown }; credit?: { score?: unknown } };
    expect(d.profile.credit === "" || d.profile.credit === 0 || d.profile.credit == null).toBe(true);
    expect(d.credit?.score === "" || d.credit?.score == null).toBe(true);
  });

  it("快照是純函式：同一份 data 連算兩次結果相同", () => {
    const d = newCaseData("測試客戶");
    expect(planSnapshot(d)).toEqual(planSnapshot(d));
    expect(planMetrics(d)).toEqual(planMetrics(d));
  });

  it("寫進 DB 的 safety 永遠在 0~100（舊版 sampleCase 會寫出 183）", () => {
    const d = newCaseData("測試客戶");
    const m = planMetrics(d);
    expect(m.safety).not.toBeNull();
    expect(m.safety!).toBeGreaterThanOrEqual(0);
    expect(m.safety!).toBeLessThanOrEqual(100);
  });
});
