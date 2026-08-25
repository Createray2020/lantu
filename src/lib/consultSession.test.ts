import { describe, it, expect } from "vitest";
import { buildSummary, ymdTaipei } from "./consultSession";

/**
 * 摘要文字與日期。
 *
 * 摘要開頭那句是整個功能的重點：Ray 定的評判標準是「比原本更優化」而不是「補平」，
 * 所以第一行必須是「改善了多少」，不是「還差多少」。
 */
const N = (kind: string, body: string, visible = false, authorName: string | null = null) =>
  ({ kind, body, visible, authorName });

describe("摘要：第一行講的是改善多少", () => {
  it("缺口變小 → 印出改善金額", () => {
    const s = buildSummary([], { shortPV: 4_860_000, net: 0, gap: null }, { shortPV: 3_240_000, net: 0, gap: null });
    expect(s).toMatch(/由 486 萬元降至 324 萬元/);
    expect(s).toMatch(/改善 162 萬元/);
  });

  it("缺口變大 → 不說「改善」，只陳述變化", () => {
    const s = buildSummary([], { shortPV: 3_000_000, net: 0, gap: null }, { shortPV: 5_000_000, net: 0, gap: null });
    expect(s).toMatch(/由 300 萬元變為 500 萬元/);
    expect(s).not.toMatch(/改善/);
  });

  it("沒有前值（例如場次是自動封的）→ 只報現況", () => {
    const s = buildSummary([], null, { shortPV: 3_240_000, net: 0, gap: null });
    expect(s).toMatch(/目前總缺口 324 萬元/);
  });

  it("缺口為 0 → 講「無現值缺口」，不是「缺口 0 萬元」", () => {
    const s = buildSummary([], null, { shortPV: 0, net: 0, gap: null });
    expect(s).toBe("目前無現值缺口。");
  });

  it("前後相同 → 不硬湊一句改善 0 萬", () => {
    const s = buildSummary([], { shortPV: 100, net: 0, gap: null }, { shortPV: 100, net: 0, gap: null });
    expect(s).not.toMatch(/改善/);
  });
});

describe("摘要：三類分段，決定排最前面", () => {
  const notes = [
    N("todo", "請客戶提供公司團保保單影本"),
    N("basis", "客戶說公司 65 歲一定要退"),
    N("decision", "壽險缺口分兩年補足", true),
  ];

  it("順序永遠是 決定 → 依據 → 待辦（客戶要看的排最前面）", () => {
    const s = buildSummary(notes, null, null);
    expect(s.indexOf("◆ 這次的決定")).toBeLessThan(s.indexOf("◆ 依據"));
    expect(s.indexOf("◆ 依據")).toBeLessThan(s.indexOf("◆ 接下來要做的"));
  });

  it("每一段自己從 1 開始編號", () => {
    const s = buildSummary(notes, null, null);
    expect(s).toMatch(/◆ 這次的決定\n1\. 壽險缺口分兩年補足/);
    expect(s).toMatch(/◆ 接下來要做的\n1\. 請客戶提供公司團保保單影本/);
  });

  it("沒有內容的分段不會留下空標題", () => {
    const s = buildSummary([N("decision", "只有一則決定")], null, null);
    expect(s).toMatch(/◆ 這次的決定/);
    expect(s).not.toMatch(/◆ 依據/);
    expect(s).not.toMatch(/◆ 接下來要做的/);
  });

  it("協作教練寫的會標名字（誰講的很重要）", () => {
    const s = buildSummary([N("basis", "這個假設偏樂觀", false, "林教練")], null, null);
    expect(s).toMatch(/這個假設偏樂觀（林教練）/);
  });

  it("完全沒有註記也不會產出殘缺的空字串結構", () => {
    expect(buildSummary([], null, null)).toBe("");
  });
});

describe("日期用台北時區", () => {
  it("UTC 的深夜在台北已經是隔天——用 UTC 會把諮詢記到前一天", () => {
    expect(ymdTaipei(new Date("2026-08-25T17:30:00Z"))).toBe("2026-08-26");
  });

  it("台北的白天不受影響", () => {
    expect(ymdTaipei(new Date("2026-08-25T04:00:00Z"))).toBe("2026-08-25");
  });

  it("跨月也要對", () => {
    expect(ymdTaipei(new Date("2026-08-31T16:00:00Z"))).toBe("2026-09-01");
  });
});
