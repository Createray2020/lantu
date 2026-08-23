import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 調整方案：缺口求解器。
 *
 * 這一組測試守的是四件事：
 *  1) 現值缺口的封閉解真的是「填得平的最小一筆錢」（用暴力二分法對拍）。
 *  2) 六根槓桿都是單調的——不單調的話反解會給出胡說八道的答案。
 *  3) 上限與階段閘門真的會擋（紅綠燈的意義全在這裡）。
 *  4) 降級路徑：資料沒填、槓桿沒得動時不會爆、不會靜靜地算出 NaN。
 */

// 造一個「補不平」的個案：收入砍到 45%、支出加 35%、流動資產只剩兩成。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poorCase(): any {
  const c = E.sampleCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 0.45; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.expenses.forEach((e: any) => { e.amount = e.amount * 1.35; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.assets.forEach((a: any) => { if (a.cls === "流動") a.value = (a.value || 0) * 0.2; });
  return c;
}

describe("現值缺口 shortPV", () => {
  it("是「讓一生現金流不轉負的最小一筆錢」——與暴力二分法一致", () => {
    const c = poorCase();
    const closed = E.projection(c).shortPV;
    // 暴力法：對 lump 二分，找最小的「無條件複利路徑全程 ≥ 0」的值
    let lo = 0, hi = 1e10;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (E.projection(c, mid).shortPV > 1e-6) lo = mid; else hi = mid;
    }
    expect(closed).toBeGreaterThan(0);
    expect(Math.abs(closed - hi) / closed).toBeLessThan(1e-6);
  });

  it("放進去剛好那一筆之後，缺口歸零；少一塊錢就補不平", () => {
    const c = poorCase();
    const g = E.projection(c).shortPV;
    expect(E.projection(c, g * 1.000001).shortPV).toBeLessThan(1e-3);
    expect(E.projection(c, g * 0.99).shortPV).toBeGreaterThan(0);
  });

  it("體質好的個案缺口為 0，而且不會變成負數", () => {
    const c = E.sampleCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 4; });
    expect(E.projection(c).shortPV).toBe(0);
    expect(E.gapPV(c)).toBe(0);
  });

  it("報酬率假設拉高，缺口一定變小——這就是它會自我實現的地方", () => {
    const c = poorCase();
    const at2 = E.gapPVAt(c, 2), at5 = E.gapPVAt(c, 5), at8 = E.gapPVAt(c, 8);
    expect(at2).toBeGreaterThan(at5);
    expect(at5).toBeGreaterThan(at8);
  });

  it("空個案不會爆，也不會算出 NaN", () => {
    const c = E.newCase();
    const p = E.projection(c);
    expect(Number.isFinite(p.shortPV)).toBe(true);
    expect(Number.isFinite(p.needPV)).toBe(true);
    expect(Number.isFinite(E.visionRate(c))).toBe(true);
  });
});

describe("願景達成度", () => {
  it("填得平＝100%，補不平＜100%，永遠落在 0~100", () => {
    const rich = E.sampleCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rich.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 4; });
    expect(E.visionRate(rich)).toBe(100);
    const poor = poorCase();
    const v = E.visionRate(poor);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(100);
    expect(E.health(poor).vision).toBe(v);
  });

  it("一生需求現值為 0（什麼都沒填）時回 100，不會除以零", () => {
    expect(E.visionRateOf({ needPV: 0, shortPV: 0 })).toBe(100);
    expect(E.visionRateOf(null)).toBe(100);
  });

  it("比率表的『願景達成率』與 health 的願景達成度是同一個數", () => {
    const c = poorCase();
    const r = E.ratios(c);
    expect(parseFloat(r["願景達成率"].v)).toBeCloseTo(E.health(c).vision, 6);
  });
});

describe("六根槓桿", () => {
  const IDS = ["income", "expense", "rate", "retire", "retireLevel", "vision"];

  it("六根都在 LEVERS 裡，而且延後退休是整數年", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(E.LEVERS.map((l: any) => l.id)).toEqual(IDS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(E.LEVERS.find((l: any) => l.id === "retire").step).toBe(1);
  });

  it.each(IDS)("『%s』對缺口是單調的（拉越大缺口越小）", (id) => {
    const c = poorCase();
    const gate = E.leverGate(c);
    const r = E.leverRange(c, id, gate);
    let prev = Infinity;
    for (let k = 0; k <= 5; k++) {
      const x = r.lo + (r.hi - r.lo) * (k / 5);
      const set: Record<string, number> = {}; set[id] = x;
      const g = E.gapWith(c, set);
      expect(g).toBeLessThanOrEqual(prev + 1e-6);
      prev = g;
    }
    expect(prev).toBeLessThan(E.gapPV(c) + 1e-6);
  });

  it("applyLevers 不會動到原本的個案", () => {
    const c = poorCase();
    const before = JSON.stringify(c);
    E.applyLevers(c, { income: 20, expense: 10, retire: 3, vision: 50, retireLevel: 10, rate: 7 });
    expect(JSON.stringify(c)).toBe(before);
  });

  it("延後退休會連配偶一起推，工作收入的結束歲跟著延長", () => {
    const c = E.sampleCase();
    // 範例個案本來就有配偶但沒填退休年齡（沒填＝不推，這是既有的降級路徑）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp = c.members.find((m: any) => m.role === "配偶");
    expect(sp).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(E.applyLevers(c, { retire: 4 }).members.find((m: any) => m.role === "配偶").retireAge)
      .toBe(sp.retireAge);          // 沒填就不動
    sp.retireAge = 60;
    const a = E.applyLevers(c, { retire: 4 });
    expect(a.profile.retireAge).toBe(E.n(c.profile.retireAge) + 4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(a.members.find((m: any) => m.role === "配偶").retireAge).toBe(64);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a.incomes.filter((i: any) => i.type === "工作").forEach((i: any) => expect(E.n(i.end)).toBeGreaterThanOrEqual(a.profile.retireAge));
  });

  it("調整願景吃的是既有的 minPresent / imp，不是新欄位", () => {
    const c = E.sampleCase();
    // 有填最低金額 → 壓到最低為止
    c.goals = [{ name: "換屋", type: "購屋", present: 12_000_000, minPresent: 10_000_000, start: 50, end: 50, freq: 0, growth: "固定", imp: 3 }];
    expect(E.goalFloor(c.goals[0])).toBe(10_000_000);
    expect(E.applyLevers(c, { vision: 100 }).goals[0].present).toBe(10_000_000);
    expect(E.applyLevers(c, { vision: 50 }).goals[0].present).toBe(11_000_000);
    // 沒填最低、重要度 5 → 不可動
    c.goals = [{ name: "非動不可", type: "其他", present: 5_000_000, minPresent: 0, imp: 5, start: 50, end: 50, freq: 0 }];
    expect(E.goalFloor(c.goals[0])).toBe(5_000_000);
    expect(E.applyLevers(c, { vision: 100 }).goals[0].present).toBe(5_000_000);
    // 沒填最低、重要度 3 → 可以歸零
    c.goals[0].imp = 3;
    expect(E.applyLevers(c, { vision: 100 }).goals[0].present).toBe(0);
  });

  it("願景沒有可壓縮空間時，這根槓桿會被標成沒得動", () => {
    const c = poorCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.goals.forEach((g: any) => { g.minPresent = 0; g.imp = 5; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [c.travel, c.hobby, c.luxury].forEach((arr: any) => (arr || []).forEach((w: any) => { w.minAmount = 0; w.imp = 5; }));
    expect(E.visionRoom(c)).toBe(0);
    const gate = E.leverGate(c);
    expect(gate.block.vision).toBeTruthy();
    expect(E.solveLever(c, "vision", {}, gate).blocked).toBe(true);
  });
});

describe("單槓桿反解", () => {
  it("解出來的值剛好填平：再少一點就補不平", () => {
    const c = E.sampleCase();
    const r = E.solveLever(c, "expense", {});
    expect(r.feasible).toBe(true);
    expect(r.needed).toBe(true);
    expect(E.gapWith(c, { expense: r.x })).toBeLessThanOrEqual(0.5);
    expect(E.gapWith(c, { expense: r.x * 0.9 })).toBeGreaterThan(0);
  });

  it("拉到上限仍補不平＝此路不通，並回報剩餘缺口", () => {
    const c = poorCase();
    const r = E.solveLever(c, "income", {});
    expect(r.feasible).toBe(false);
    expect(r.x).toBe(E.CAP_INCOME_UP);
    expect(r.gap).toBeGreaterThan(0);
    expect(r.gap).toBeLessThan(r.base);      // 有幫助，只是不夠
  });

  it("延後退休只會給整數年", () => {
    const c = poorCase();
    c.incomes[0].amount = c.incomes[0].amount * 2.0;
    const r = E.solveLever(c, "retire", {});
    if (r.feasible && r.needed) expect(r.x % 1).toBe(0);
  });

  it("缺口本來就是 0 時，六根都回 needed=false", () => {
    const c = E.sampleCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 4; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    E.soloSolve(c).rows.forEach((r: any) => {
      expect(r.needed).toBe(false);
      expect(r.feasible).toBe(true);
    });
  });
});

describe("財務階段閘門", () => {
  it("整裝期(D) 鎖住「提高報酬率」，而且會給理由", () => {
    const c = poorCase();
    expect(E.health(c).grade).toBe("D");
    const gate = E.leverGate(c);
    expect(gate.block.rate).toBeTruthy();
    expect(gate.reason.rate).toContain("整裝期");
    const r = E.solveLever(c, "rate", {}, gate);
    expect(r.blocked).toBe(true);
    expect(r.feasible).toBe(false);
  });

  it("啟程期(C) 不鎖，但報酬率上限收緊到 CAP_RATE_STARTER", () => {
    const c = E.sampleCase();
    expect(E.health(c).grade).toBe("C");
    const gate = E.leverGate(c);
    expect(gate.block.rate).toBeFalsy();
    expect(gate.rateCap).toBe(E.CAP_RATE_STARTER);
  });

  it("被鎖住的槓桿不會被任何處方採用", () => {
    const c = poorCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    E.prescriptions(c).forEach((rx: any) => expect(rx.levers.rate).toBeUndefined());
  });

  it("後台可以覆蓋上限；覆蓋壞值會被忽略（不會變成 NaN）", () => {
    const orig = E.CAP_RATE;
    E.applyPlanCaps({ CAP_RATE: "" });
    expect(E.CAP_RATE).toBe(orig);
    E.applyPlanCaps({ CAP_RATE: "abc" });
    expect(E.CAP_RATE).toBe(orig);
    E.applyPlanCaps({ CAP_RATE: 9 });
    expect(E.CAP_RATE).toBe(9);
    E.applyPlanCaps({ CAP_RATE: orig });   // 還原，免得污染其他測試
    expect(E.CAP_RATE).toBe(orig);
  });
});

describe("三個處方", () => {
  it("永遠只有三張，key 固定", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(E.RX_DEFS.map((d: any) => d.key)).toEqual(["stable", "growth", "vision"]);
    expect(E.prescriptions(E.sampleCase())).toHaveLength(3);
  });

  it("穩健型不會假設加薪、也不會拉報酬率", () => {
    const rx = E.prescriptions(poorCase())[0];
    expect(rx.levers.income).toBeUndefined();
    expect(rx.levers.rate).toBeUndefined();
  });

  it("調願景型一定先給出「願景要壓縮多少」——這是教練當場要回答的那一題", () => {
    const rx = E.prescriptions(poorCase())[2];
    expect(rx.key).toBe("vision");
    expect(rx.levers.vision).toBeGreaterThan(0);
  });

  it("處方標 ok=true 時，套用那組槓桿之後缺口真的是 0", () => {
    const c = E.sampleCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    E.prescriptions(c).forEach((rx: any) => {
      if (rx.ok) expect(E.gapWith(c, rx.levers)).toBeLessThanOrEqual(0.5);
      else expect(rx.gap).toBeGreaterThan(0);
    });
  });

  it("全部補不平時，三張都誠實標示剩餘缺口，不會假裝填平了", () => {
    const c = poorCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    E.prescriptions(c).forEach((rx: any) => {
      expect(rx.ok).toBe(false);
      expect(rx.gap).toBeGreaterThan(0);
      expect(rx.gap).toBeLessThan(E.gapPV(c));   // 至少要比什麼都不做好
    });
  });
});

describe("缺口帳", () => {
  it("現金流缺口各列加總＝總缺口（可以放心相加）", () => {
    const led = E.gapLedger(poorCase());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = led.flow.reduce((acc: number, f: any) => acc + f.pv, 0);
    expect(Math.abs(s - led.total) / led.total).toBeLessThan(1e-9);
  });

  it("保障缺口與預備金另列，不併入總額", () => {
    const led = E.gapLedger(poorCase());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nowSum = led.now.reduce((acc: number, x: any) => acc + x.amount, 0);
    expect(nowSum).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flowSum = led.flow.reduce((acc: number, f: any) => acc + f.pv, 0);
    expect(Math.abs(flowSum - led.total)).toBeLessThan(1);   // 總額裡沒有 now 的份
  });

  it("每年要補的錢是償債基金、不是直接除以年數", () => {
    const led = E.gapLedger(poorCase());
    if (led.years > 1) {
      const naive = led.total / led.years;
      expect(led.annual).toBeLessThan(naive);      // 有複利，所以每年要存的比直接除少
      const r = led.rate / 100;
      const fv = led.annual * ((Math.pow(1 + r, led.years) - 1) / r);
      expect(Math.abs(fv - led.total) / led.total).toBeLessThan(1e-6);
    }
  });

  it("保守情境永遠不會比樂觀情境樂觀", () => {
    const led = E.gapLedger(poorCase());
    expect(led.conservative).toBeGreaterThanOrEqual(led.total);
  });

  it("缺口為 0 時 flow 是空的、願景達成度 100", () => {
    const c = E.sampleCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 4; });
    const led = E.gapLedger(c);
    expect(led.total).toBe(0);
    expect(led.flow).toHaveLength(0);
    expect(led.visionRate).toBe(100);
  });
});

describe("相容性（既有客戶的數字不能被動到）", () => {
  it("effReturn 預設沿用 params.invReturn，配置只是畫面", () => {
    const c = E.sampleCase();
    c.plan = { allocations: [{ name: "股票", pct: 100, ret: 12 }] };
    expect(E.effReturn(c)).toBe(E.n(c.params.invReturn));
    expect(E.projection(c).rate).toBe(E.n(c.params.invReturn));
  });

  it("打開開關才跟著配置的加權報酬走", () => {
    const c = E.sampleCase();
    c.plan = { allocations: [{ name: "股票", pct: 60, ret: 10 }, { name: "債券", pct: 40, ret: 3 }], useAllocReturn: true };
    expect(E.effReturn(c)).toBeCloseTo(0.6 * 10 + 0.4 * 3, 6);
  });

  it("舊欄位 plan.retireDelay 仍然有效（planLevers 會接進來）", () => {
    const c = E.sampleCase();
    c.plan = { retireDelay: 3 };
    expect(E.planLevers(c).retire).toBe(3);
    expect(E.scenario(c).afterCase.profile.retireAge).toBe(E.n(c.profile.retireAge) + 3);
  });

  it("plan.levers 優先於舊欄位，而且 scenario 會吃到六根", () => {
    const c = E.sampleCase();
    c.plan = { retireDelay: 3, levers: { retire: 5, expense: 10 } };
    const s = E.scenario(c);
    expect(s.afterCase.profile.retireAge).toBe(E.n(c.profile.retireAge) + 5);
    expect(s.after.gap).toBeLessThanOrEqual(s.before.gap);
  });

  it("完全沒有 plan 的舊個案，scenario 不會爆", () => {
    const c = E.sampleCase();
    delete c.plan;
    expect(() => E.scenario(c)).not.toThrow();
    expect(E.planLevers(c)).toEqual({});
  });
});
