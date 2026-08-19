import { describe, it, expect } from "vitest";
import { mergePreset, V4_RANKS, V4_THRESHOLDS } from "./preset";
import { emptyParams } from "./types";

// 「載入 V4 辦法數值」的合約：只填空白，不覆蓋公司已經自己調過的數字。
// 這顆按鈕會被反覆按（每次新增條文都可能再按一次），覆寫既有設定是最容易讓人不敢按的事。

describe("mergePreset", () => {
  it("空白制度：整包帶入辦法數值", () => {
    const r = mergePreset(emptyParams());
    expect(r.settings.splitPromoPct).toBe(30);
    expect(r.settings.splitExecPct).toBe(60);
    expect(r.settings.peerBonusPct).toBe(50);
    expect(r.ranks).toHaveLength(V4_RANKS.length);
    expect(r.thresholds).toHaveLength(V4_THRESHOLDS.length);
  });

  it("已填的數字不被覆蓋，只補空白的", () => {
    const r = mergePreset({
      settings: { splitPromoPct: 35, payoutDay: 10 },
      ranks: [],
      thresholds: [],
    });
    expect(r.settings.splitPromoPct).toBe(35); // 自訂值保留
    expect(r.settings.payoutDay).toBe(10);
    expect(r.settings.splitExecPct).toBe(60);  // 空白的才補
    expect(r.settings.trainHours).toBe(8);
  });

  it("已有自訂職級表時不塞入辦法的七職級（避免長出不存在的階級）", () => {
    const mine = [{ code: "X1", seq: 1, promoPct: 10, execPct: 20 }];
    const r = mergePreset({ settings: {}, ranks: mine, thresholds: [] });
    expect(r.ranks).toEqual(mine);
    // 門檻仍然是空的 → 一併帶入
    expect(r.thresholds).toHaveLength(V4_THRESHOLDS.length);
  });

  it("A 軌六列、B 軌三列、真除四列，且 B 軌不含認證顧問階段", () => {
    const t = V4_THRESHOLDS;
    expect(t.filter((x) => x.kind === "promotion_a")).toHaveLength(6);
    expect(t.filter((x) => x.kind === "promotion_b")).toHaveLength(3);
    expect(t.filter((x) => x.kind === "tenure")).toHaveLength(4);
    expect(t.filter((x) => x.kind === "promotion_b").every((x) => x.fromCode?.startsWith("S"))).toBe(true);
  });

  it("辦法未明定的項目維持未設定（退費後是否降級）", () => {
    const r = mergePreset(emptyParams());
    expect(r.settings.refundDemote).toBeUndefined();
  });
});
