import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 願景選定閘（2026/08/24）。
 *
 * Ray 的規劃邏輯：「最一開始就先設定好有哪些願景要執行，在選定的願景當中，
 * 按照時間先到的先支付。」→ 每個願景項目多一個 `on` 旗標，沒選的完全不進計算。
 *
 * ⚠️⚠️ 這組測試最重要的一條是「既有客戶數字一位不動」。
 *     舊資料完全沒有 on 欄位（undefined），`visionOn()` 必須把它當成「已選定」。
 *     若哪天有人把 `visionOn` 寫成 `!!x.on`，所有既有客戶的願景會一夜消失、
 *     缺口歸零、財務階段全部跳成「遠行期」——這裡會先紅。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clone = (c: any) => JSON.parse(JSON.stringify(c));

describe("visionOn()：undefined 一律視為已選定", () => {
  it("沒有 on 欄位、on 為 true / null / undefined 都算選定，只有 === false 才關閉", () => {
    expect(E.visionOn({})).toBe(true);
    expect(E.visionOn({ on: true })).toBe(true);
    expect(E.visionOn({ on: undefined })).toBe(true);
    expect(E.visionOn({ on: null })).toBe(true);
    expect(E.visionOn(null)).toBe(true);
    expect(E.visionOn({ on: false })).toBe(false);
  });

  it("字串 'false' 不算關閉（願景列走 checkbox 存真 boolean，不會有字串）", () => {
    expect(E.visionOn({ on: "false" })).toBe(true);
  });
});

describe("既有客戶數字一位不動", () => {
  it("沒有 on 欄位 ⇢ 與全部 on:true 的結果完全相同", () => {
    const bare = E.sampleCase(); // goals/travel/hobby/luxury 都沒有 on 欄位
    const filled = clone(bare);
    ["goals", "travel", "hobby", "luxury"].forEach((k) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (filled[k] || []).forEach((x: any) => (x.on = true));
    });

    expect(E.gapPV(filled)).toBeCloseTo(E.gapPV(bare), 6);
    expect(E.projection(filled).needPV).toBeCloseTo(E.projection(bare).needPV, 6);
    expect(E.visionRoom(filled)).toBeCloseTo(E.visionRoom(bare), 6);
    expect(E.health(filled).grade).toBe(E.health(bare).grade);
    expect(E.lifestyleFactor(filled, 50, 1)).toBeCloseTo(E.lifestyleFactor(bare, 50, 1), 6);
  });
});

describe("關掉願景 ⇢ 需求與缺口下降", () => {
  it("關掉一個目標，一生需求現值下降、缺口不會變大", () => {
    const on = E.sampleCase();
    const off = clone(on);
    off.goals[0].on = false;

    expect(E.projection(off).needPV).toBeLessThan(E.projection(on).needPV);
    expect(E.gapPV(off)).toBeLessThanOrEqual(E.gapPV(on));
  });

  it("關掉全部生活願望，lifestyleFactor 歸零", () => {
    const c = E.sampleCase();
    expect(E.lifestyleFactor(c, 50, 1)).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["travel", "hobby", "luxury"].forEach((k) => (c[k] || []).forEach((x: any) => (x.on = false)));
    expect(E.lifestyleFactor(c, 50, 1)).toBe(0);
  });

  it("全部願景關掉 ⇢ 需求現值嚴格小於全開", () => {
    const on = E.sampleCase();
    const off = clone(on);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ["goals", "travel", "hobby", "luxury"].forEach((k) => (off[k] || []).forEach((x: any) => (x.on = false)));
    expect(E.projection(off).needPV).toBeLessThan(E.projection(on).needPV);
  });
});

describe("沒選的願景不進壓縮槓桿", () => {
  it("visionRoom 不把關掉的項目算成可壓縮空間", () => {
    const on = E.sampleCase();
    const off = clone(on);
    off.goals[0].on = false;
    expect(E.visionRoom(off)).toBeLessThan(E.visionRoom(on));
  });

  it("applyLevers 的 vision 槓桿不會動到關掉的項目", () => {
    const c = E.sampleCase();
    c.goals[0].on = false;
    const before = c.goals[0].present;
    const after = E.applyLevers(c, { vision: 50 });
    expect(after.goals[0].present).toBe(before); // 關掉的原封不動
    expect(after.goals[1].present).toBeLessThan(c.goals[1].present); // 沒關的照壓
  });

  it("visionChanges 不列出關掉的項目", () => {
    const c = E.sampleCase();
    const all = E.visionChanges(c, 50);
    c.goals[0].on = false;
    const some = E.visionChanges(c, 50);
    expect(some.length).toBeLessThan(all.length);
    const name = c.goals[0].name || c.goals[0].type;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(some.some((x: any) => x.name === name)).toBe(false);
  });
});

describe("傳承是願景的一部分，可以勾選不處理", () => {
  it("legacy.on === false ⇢ legacyNeed 歸零；undefined 仍照算", () => {
    const c = E.sampleCase();
    const need = E.legacyNeed(c);
    expect(need).toBe(c.legacy.heirs * c.legacy.perHeirCash);
    expect(need).toBeGreaterThan(0);

    const bare = clone(c);
    delete bare.legacy.on; // 舊資料
    expect(E.legacyNeed(bare)).toBe(need);

    const off = clone(c);
    off.legacy.on = false;
    expect(E.legacyNeed(off)).toBe(0);
  });

  it("傳承目標金額沿用既有欄位，沒有新增 target 欄位", () => {
    const c = E.sampleCase();
    expect(c.legacy).toHaveProperty("perHeirCash");
    expect(c.legacy).not.toHaveProperty("target");
  });
});
