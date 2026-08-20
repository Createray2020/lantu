import { describe, it, expect } from "vitest";
import { diffParams } from "./diff";
import { V4_PRESET } from "./preset";
import type { CompParams } from "./types";

// 版本差異對照：發布前要看得到「這次改了哪些數字」。
// 沒有這個，版本管理只是個安心用的名詞——沒人知道按下發布後制度變成什麼樣。

const A = V4_PRESET;
const find = (cs: ReturnType<typeof diffParams>, label: string) =>
  cs.find((c) => c.label.includes(label));

describe("diffParams", () => {
  it("完全相同時沒有任何差異", () => {
    expect(diffParams(A, { ...A })).toEqual([]);
  });

  it("改參數：列出前後值", () => {
    const B: CompParams = { ...A, settings: { ...A.settings, payoutDay: 15 } };
    const cs = diffParams(A, B);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ group: "參數與開關", label: "payoutDay", before: "5", after: "15" });
  });

  it("開關與清單也看得懂（不是 true/false 或 [object]）", () => {
    const B: CompParams = {
      ...A,
      settings: { ...A.settings, promoManualReview: true, exemptReasons: ["育嬰", "兵役"] },
    };
    const cs = diffParams(A, B);
    expect(find(cs, "promoManualReview")).toMatchObject({ before: "關", after: "開" });
    expect(find(cs, "exemptReasons")?.after).toBe("育嬰／兵役");
  });

  it("設定被清空時顯示為「未設定」而不是空白", () => {
    const B: CompParams = { ...A, settings: { ...A.settings, trainHours: undefined } };
    expect(find(diffParams(A, B), "trainHours")).toMatchObject({ before: "8", after: "未設定" });
  });

  it("改職級分潤率", () => {
    const B: CompParams = {
      ...A,
      ranks: A.ranks.map((r) => (r.code === "C1" ? { ...r, execPct: 35 } : r)),
    };
    const cs = diffParams(A, B);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ group: "職級與分潤率", before: "30", after: "35" });
    expect(cs[0].label).toContain("C1");
  });

  it("模塊自訂職級表與預設表分開比對（同 code 不會互相蓋掉）", () => {
    const B: CompParams = {
      ...A,
      ranks: [...A.ranks, { code: "C1", seq: 1, moduleCode: "LEC", promoPct: 10, execPct: 20 }],
    };
    const cs = diffParams(A, B);
    expect(cs).toHaveLength(1);
    expect(cs[0].kind).toBe("added");
    expect(cs[0].label).toContain("LEC");
  });

  it("新增與刪除模塊", () => {
    const added: CompParams = {
      ...A,
      modules: [...(A.modules ?? []), { code: "LEC", seq: 3, name: "講座", splitMode: "flat" }],
    };
    expect(diffParams(A, added)[0]).toMatchObject({ kind: "added", after: "新增" });

    const removed: CompParams = { ...A, modules: (A.modules ?? []).slice(0, 1) };
    expect(diffParams(A, removed)[0]).toMatchObject({ kind: "removed", after: "已刪除" });
  });

  it("改門檻：分類與項目名稱看得出是哪一軌", () => {
    const B: CompParams = {
      ...A,
      thresholds: A.thresholds.map((t) =>
        t.kind === "promotion_b" && t.toCode === "S3" ? { ...t, teamCases: 50 } : t,
      ),
    };
    const cs = diffParams(A, B);
    expect(cs).toHaveLength(1);
    expect(cs[0].group).toBe("門檻");
    expect(cs[0].label).toContain("晉升 B 軌 → S3");
    expect(cs[0]).toMatchObject({ before: "40", after: "50" });
  });

  it("一次改多處：全部列得出來", () => {
    const B: CompParams = {
      ...A,
      settings: { ...A.settings, payoutDay: 10, peerBonusPct: 60 },
      ranks: A.ranks.map((r) => (r.code === "S2" ? { ...r, promoPct: 27 } : r)),
      modules: (A.modules ?? []).map((m) => (m.code === "SPOT" ? { ...m, price: 12_000 } : m)),
    };
    const cs = diffParams(A, B);
    expect(cs).toHaveLength(4);
    expect(new Set(cs.map((c) => c.group)))
      .toEqual(new Set(["參數與開關", "職級與分潤率", "服務模塊"]));
  });
});
