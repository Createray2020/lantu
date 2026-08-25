import { describe, it, expect, vi } from "vitest";

// 只測純函式（合併語意），所以把會打 DB / Next 快取的相依整片擋掉。
vi.mock("@/Shared/db", () => ({ db: {} }));
vi.mock("@/Shared/db/schema", () => ({ anModuleDefaults: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (f: unknown) => f,
  updateTag: () => {},
}));

import { mergeAnDefaults, builtinAnDefaults, anBoardRows } from "./anDefaults";
import { AN_MODULE_KEYS } from "./analysisModules";

describe("後台預設的合併語意", () => {
  it("完全沒設定 → 就是程式內建順序、一個都不隱藏", () => {
    const p = mergeAnDefaults([]);
    expect(p.order).toEqual(AN_MODULE_KEYS);
    expect(p.hidden).toEqual([]);
    expect(p).toEqual(builtinAnDefaults());
  });

  it("DB 有設定的排前面，沒設定過的模組接在後面（新增模組不會消失）", () => {
    const p = mergeAnDefaults([
      { key: "mc", sortOrder: 0, hidden: false },
      { key: "retire", sortOrder: 1, hidden: false },
    ]);
    expect(p.order.slice(0, 2)).toEqual(["mc", "retire"]);
    expect(p.order.length).toBe(AN_MODULE_KEYS.length);
    expect(new Set(p.order).size).toBe(AN_MODULE_KEYS.length);
    // 其餘維持內建的相對順序
    const rest = AN_MODULE_KEYS.filter((k) => k !== "mc" && k !== "retire");
    expect(p.order.slice(2)).toEqual(rest);
  });

  it("sortOrder 亂序也照數字排，不看列的先後", () => {
    const p = mergeAnDefaults([
      { key: "tax", sortOrder: 5, hidden: false },
      { key: "mc", sortOrder: 1, hidden: false },
    ]);
    expect(p.order.slice(0, 2)).toEqual(["mc", "tax"]);
  });

  it("⚠️ 不認得的 key（模組已被刪掉）直接忽略，不讓死資料排進畫面", () => {
    const p = mergeAnDefaults([
      { key: "ghost_module", sortOrder: 0, hidden: true },
      { key: "mc", sortOrder: 1, hidden: false },
    ]);
    expect(p.order).not.toContain("ghost_module");
    expect(p.hidden).not.toContain("ghost_module");
    expect(p.order[0]).toBe("mc");
    expect(p.order.length).toBe(AN_MODULE_KEYS.length);
  });

  it("hidden 只收 DB 明確標記的那幾個", () => {
    const p = mergeAnDefaults([
      { key: "mc", sortOrder: 0, hidden: true },
      { key: "tax", sortOrder: 1, hidden: false },
    ]);
    expect(p.hidden).toEqual(["mc"]);
  });

  it("同一個 key 重複出現只算第一次（主鍵理論上擋掉了，但合併不該因此壞掉）", () => {
    const p = mergeAnDefaults([
      { key: "mc", sortOrder: 0, hidden: true },
      { key: "mc", sortOrder: 9, hidden: false },
    ]);
    expect(p.order.filter((k) => k === "mc").length).toBe(1);
    expect(p.order.length).toBe(AN_MODULE_KEYS.length);
  });
});

describe("後台面板的列", () => {
  it("每個模組都有標題，順序與 payload 一致", () => {
    const p = mergeAnDefaults([{ key: "mc", sortOrder: 0, hidden: true }]);
    const rows = anBoardRows(p);
    expect(rows.length).toBe(AN_MODULE_KEYS.length);
    expect(rows[0]).toMatchObject({ k: "mc", hidden: true });
    expect(rows.every((r) => r.t && r.t !== r.k)).toBe(true);
  });

  it("有條件才出現的模組帶著說明（後台才知道它為什麼有時候看不到）", () => {
    const rows = anBoardRows(builtinAnDefaults());
    expect(rows.find((r) => r.k === "biz")?.cond).toBeTruthy();
    expect(rows.find((r) => r.k === "property")?.cond).toBeTruthy();
  });
});
