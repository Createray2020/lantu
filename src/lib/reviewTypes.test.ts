import { describe, it, expect } from "vitest";
import { REVIEW_TYPES, REVIEW_TYPE_LABEL, REVIEW_TYPE_DESC } from "@/app/dashboard/format";

/**
 * 會談類型 6 → 10（2026/08/26 教練回饋）。
 *
 * 教練列了他實務上的十種會談，順序就是服務流程：從還沒成交的非正式接觸，
 * 一路到年度重製與臨時諮詢。
 *
 * ⚠️ 既有資料存的是 key，所以「初談 → 首次面談／正式諮詢」是改顯示名、不是換 key。
 * ⚠️ annual 維持「年度重製」——系統裡那是「年度版本重製」那個動作的專有名詞，
 *    換成教練寫的「重置」會跟那個功能混淆（Ray 拍板）。
 */
describe("十種會談類型", () => {
  it("順序就是教練的服務流程", () => {
    expect([...REVIEW_TYPES]).toEqual([
      "casual", "intro", "proposal", "deep", "report",
      "review", "quarter", "half", "annual", "adhoc",
    ]);
  });

  it("每一種都有顯示名與定義（十種看起來差不多，沒定義教練會選錯）", () => {
    for (const t of REVIEW_TYPES) {
      expect(REVIEW_TYPE_LABEL[t], `${t} 缺顯示名`).toBeTruthy();
      expect((REVIEW_TYPE_DESC[t] ?? "").length, `${t} 缺定義`).toBeGreaterThan(8);
    }
  });

  it("⚠️ 舊的六個 key 一個都不能少（既有資料存的是 key）", () => {
    for (const k of ["intro", "review", "quarter", "half", "annual", "adhoc"]) {
      expect(REVIEW_TYPES).toContain(k);
    }
  });

  it("intro 改顯示名、key 不動；annual 維持「年度重製」", () => {
    expect(REVIEW_TYPE_LABEL.intro).toBe("首次面談／正式諮詢");
    expect(REVIEW_TYPE_LABEL.annual).toBe("年度重製");
    expect(REVIEW_TYPE_LABEL.annual).not.toContain("重置");
  });

  it("顯示名不重複——重複的話教練在下拉裡分不出來", () => {
    const labels = REVIEW_TYPES.map((t) => REVIEW_TYPE_LABEL[t]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("label 表沒有多出 REVIEW_TYPES 以外的孤兒", () => {
    expect(Object.keys(REVIEW_TYPE_LABEL).sort()).toEqual([...REVIEW_TYPES].sort());
    expect(Object.keys(REVIEW_TYPE_DESC).sort()).toEqual([...REVIEW_TYPES].sort());
  });
});
