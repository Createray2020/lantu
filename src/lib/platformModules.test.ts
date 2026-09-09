import { describe, it, expect, vi } from "vitest";

/**
 * 模組開關的合併語意（2026/09/09 Ray：先關掉學習區，架好再開）。
 *
 * ⚠️⚠️ 這裡釘的是一條與 clientDashStore **相反**的規則：沒有列 ≠ 開啟。
 *    要是哪天有人「順手統一」成「沒設定＝開」，這包一部署上去學習區就會自己打開，
 *    而畫面上完全看不出來是誰開的。
 */
vi.mock("next/cache", () => ({
  unstable_cache: (f: unknown) => f,
  updateTag: () => {},
}));
vi.mock("@/Shared/db", () => ({ db: {} }));
vi.mock("@/Shared/db/schema", () => ({ platformModules: { key: "key" } }));

import { MODULES, mergeModules, moduleDef } from "./platformModules";

describe("mergeModules", () => {
  it("完全沒設定過 → 回到各模組的 defaultEnabled，學習區是關的", () => {
    const s = mergeModules([]);
    expect(s.learn.enabled).toBe(false);
    expect(s.learn.configured).toBe(false);
  });

  it("後台開過就以 DB 為準", () => {
    expect(mergeModules([{ key: "learn", enabled: true, notice: null }]).learn.enabled).toBe(true);
    expect(mergeModules([{ key: "learn", enabled: false, notice: null }]).learn.enabled).toBe(false);
  });

  it("說明留空（含只打空白）→ 回到預設文案，不要給使用者一片空白", () => {
    expect(mergeModules([{ key: "learn", enabled: false, notice: "   " }]).learn.notice)
      .toBe(moduleDef("learn")!.defaultNotice);
    expect(mergeModules([{ key: "learn", enabled: false, notice: "課程整理中，下週開放" }]).learn.notice)
      .toBe("課程整理中，下週開放");
  });

  it("程式端不認得的 key 一律忽略，不讓死資料變成看不見的開關", () => {
    const s = mergeModules([{ key: "ghost", enabled: false, notice: null }]);
    expect(Object.keys(s)).toEqual(MODULES.map((m) => m.key));
  });

  it("每個模組都要有關閉時的預設文案（不然關掉會是一片空白）", () => {
    for (const m of MODULES) expect(m.defaultNotice.trim().length).toBeGreaterThan(0);
  });
});
