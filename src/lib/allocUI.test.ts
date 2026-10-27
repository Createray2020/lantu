/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { POOL_LOW_RET, POOL_MID_RET, POOL_HIGH_RET, POOL_CASH_RET, POOL_LOW_STD, POOL_MID_STD, POOL_HIGH_STD, POOL_CASH_STD, MIX_T1, MIX_T2, MIX_T3, MIX_T4 } from "./bizTax";

/**
 * C 批 資產配置台（2026/10/28 Ray 定案，原型 docs/資產配置台_原型.html）。
 *
 * 守的是：
 *  1. 歸池：資產表的「風險池」欄留空就依類別自動歸池；現金先扣預備金；自用資產不進池。
 *  2. 沒碰過配置台的客戶：allocView 回「目標＝現況、沒投入」，不建 plan.alloc，投影一位不動。
 *  3. 拉桿合計鎖 100%；加權報酬＝Σ比例×池報酬；P10 < P50 < P90；期末資產有投入 > 沒投入。
 *  4. 風險屬性旁註：有配偶且較保守 → 以配偶為尺。
 *  5. 採用：寫 invReturn／invReturnStd、useAllocReturn 關、定期定額／單筆變成 alloc:* 動作（重採用不重複長）；回到現況清掉。
 *  6. TS 後台參數預設值與 HTML 四池常數一致；applyAllocParams 吃得進後台值。
 *  7. 報告書：採用過才印四池；方案頁折疊「資產配置」存在、舊手填表不在方案頁。
 */
let w: any;
beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  w.confirm = () => true;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "plan";
});
const pane = () => w.document.querySelector("#app").innerHTML as string;
function fresh() {
  const c = w.migrateCase(w.newCase());
  c.profile.age = 40; c.profile.retireAge = 65;
  c.members = [{ name: "王大明", role: "本人", age: 40 }];
  c.incomes = [{ name: "薪資", amount: 100000, freq: "月" }];
  c.expenses = [{ name: "生活", cat: "日常生活", amount: 80000, freq: "月" }];
  c.params.emergencyMonths = 6;
  c.assets = [
    { name: "活存", mainCat: "可投資資產", type: "現金", cls: "流動", fxRate: 1, value: 1800000, movable: true },
    { name: "定存", mainCat: "可投資資產", type: "定存", cls: "流動", fxRate: 1, value: 1000000, movable: true },
    { name: "股票型基金", mainCat: "可投資資產", type: "基金", cls: "流動", fxRate: 1, value: 2000000, movable: true },
    { name: "個股", mainCat: "可投資資產", type: "股票", cls: "流動", fxRate: 1, value: 1200000, movable: true },
    { name: "自用住宅", mainCat: "自用資產", type: "不動產", cls: "固定", fxRate: 1, value: 15000000, movable: false },
  ];
  w.app.cases = [c]; w.app.activeId = c.id; w.FOLD_OPEN = {};
  w.render();
  return c;
}

describe("歸池與預設", () => {
  let c: any;
  beforeEach(() => { c = fresh(); });

  it("留空依類別自動歸池；現金扣預備金；自用不進池；手動指定優先", () => {
    const np = w.allocNowPools(c);
    const reserve = w.allocReserve(c);
    expect(reserve).toBeGreaterThan(0);
    expect(np[3]).toBe(Math.max(0, 1800000 - reserve));
    expect(np[0]).toBe(1000000);
    expect(np[1]).toBe(2000000);
    expect(np[2]).toBe(1200000);
    expect(w.assetPoolOf(c, c.assets[4])).toBe("none");
    c.assets[1].pool = "高度風險";
    expect(w.allocNowPools(c)[2]).toBe(2200000);
    expect(pane()).toContain("風險池");   // 資產歸池表在方案頁
  });

  it("沒碰過配置台：目標＝現況、沒投入、不建 plan.alloc；投影一位不動", () => {
    const before = w.projection(c).shortPV;
    const V = w.allocView(c);
    expect(c.plan.alloc).toBeUndefined();
    expect(V.target.reduce((s: number, x: number) => s + x, 0)).toBe(100);
    expect(V.dca).toEqual([0, 0, 0, 0]);
    expect(V.years).toBe(25);
    expect(V.touched).toBe(false);
    w.render();
    expect(c.plan.alloc).toBeUndefined();
    expect(w.projection(c).shortPV).toBe(before);
    expect(pane()).toContain("資產配置");
    expect(pane()).not.toContain("投資型配置（手填）");
  });
});

describe("拉桿、情境與旁註", () => {
  let c: any;
  beforeEach(() => { c = fresh(); });

  it("拉桿合計鎖 100%；加權報酬＝Σ比例×池報酬；P10<P50<P90；有投入的期末 > 沒投入", () => {
    w.allocSetTarget(2, 50);
    const V = w.allocView(c);
    expect(V.target.reduce((s: number, x: number) => s + x, 0)).toBe(100);
    expect(V.target[2]).toBe(50);
    const K = w.allocCalc(c);
    const mu = V.target.reduce((s: number, x: number, i: number) => s + x / 100 * V.ret[i] / 100, 0);
    expect(K.sT.mu).toBeCloseTo(mu, 9);
    expect(K.p10).toBeLessThan(K.p50);
    expect(K.p50).toBeLessThan(K.p90);
    const endNo = K.ser[1][K.N];
    w.allocSetIn("dca", 1, 10000);
    const K2 = w.allocCalc(c);
    expect(K2.ser[1][K2.N]).toBeGreaterThan(endNo);
    expect(K2.dcaM).toBe(10000);
    const h = pane();
    expect(h).toContain("最差 P10");
    expect(h).toContain('id="allocKpis"');       // 對照回全生涯財務流
  });

  it("風險屬性旁註：沒測驗提示去做；本人穩健、配偶保守 → 以配偶為尺", () => {
    expect(pane()).toContain("尚未完成風險屬性測驗");
    const all = (v: number) => { const a: Record<number, number> = {}; for (let i = 0; i < w.RISK_Q.length; i++) a[i] = v; return a; };
    c.riskQuiz = { ans: all(2) };                               // 穩健型
    c.members.push({ name: "王太太", role: "配偶", age: 38 });
    c.riskQuizSpouse = { ans: all(0) };                         // 保守型
    w.render();
    const R = w.allocRiskRef(c);
    expect(R.useSp).toBe(true);
    expect(R.tier).toBe("保守型");
    expect(R.mix).toEqual([...MIX_T1, 100 - MIX_T1[0] - MIX_T1[1] - MIX_T1[2]]);
    expect(pane()).toContain("配偶，較保守");
  });
});

describe("採用與回到現況", () => {
  it("採用：寫 invReturn／Std、關 useAllocReturn、長 alloc:* 動作；重採用不重複；回到現況清掉", () => {
    const c = fresh();
    c.plan.useAllocReturn = true;
    w.allocSetTarget(2, 60);
    w.allocSetIn("dca", 1, 10000);
    w.allocSetIn("lump", 0, 500000);
    const K = w.allocCalc(c);
    w.allocAdopt();
    expect(c.params.invReturn).toBeCloseTo(Math.round(K.sT.mu * 1000) / 10, 6);
    expect(c.params.invReturnStd).toBeCloseTo(Math.round(K.sT.sd * 1000) / 10, 6);
    expect(c.plan.useAllocReturn).toBe(false);
    expect(c.plan.alloc.adoptedAt).toBeTruthy();
    const acts = c.actions.filter((a: any) => String(a.flowKey || "").indexOf("alloc:") === 0);
    expect(acts.length).toBe(2);
    const dca = acts.find((a: any) => a.flowKey === "alloc:dca:mid");
    expect(dca.cat).toBe("regular"); expect(dca.payMonthly).toBe(10000); expect(dca.growth).toBe(POOL_MID_RET);
    const lump = acts.find((a: any) => a.flowKey === "alloc:lump:low");
    expect(lump.cat).toBe("lump"); expect(lump.payLump).toBe(500000);
    w.allocAdopt();
    expect(c.actions.filter((a: any) => String(a.flowKey || "").indexOf("alloc:") === 0).length).toBe(2);
    expect(w.reportHTML(c)).toContain("資產配置（四池）");
    // 存方案帶得走
    expect(w.trialSnap(c).plan.alloc.adoptedAt).toBeTruthy();
    w.allocReset();
    expect(c.plan.alloc).toBeUndefined();
    expect(c.actions.filter((a: any) => String(a.flowKey || "").indexOf("alloc:") === 0).length).toBe(0);
    expect(w.reportHTML(c)).not.toContain("資產配置（四池）");
  });
});

describe("後台參數鏡射", () => {
  it("HTML 四池預設＝bizTax.ts；applyAllocParams 吃得進後台值", () => {
    expect(w.ALLOC_POOLS.map((p: any) => p.ret)).toEqual([POOL_LOW_RET, POOL_MID_RET, POOL_HIGH_RET, POOL_CASH_RET]);
    expect(w.ALLOC_POOLS.map((p: any) => p.std)).toEqual([POOL_LOW_STD, POOL_MID_STD, POOL_HIGH_STD, POOL_CASH_STD]);
    const mixes = [MIX_T1, MIX_T2, MIX_T3, MIX_T4];
    ["保守型", "穩健型", "積極型", "進取型"].forEach((t, i) => {
      expect(w.ALLOC_TIER_MIX[t].slice(0, 3)).toEqual([...mixes[i]]);
      expect(w.ALLOC_TIER_MIX[t].reduce((s: number, x: number) => s + x, 0)).toBe(100);
    });
    w.applyAllocParams({ POOL_MID_RET: 6, MIX_T2_LOW: 30, MIX_T2_MID: 50, MIX_T2_HIGH: 10 });
    expect(w.ALLOC_POOLS[1].ret).toBe(6);
    expect(w.ALLOC_TIER_MIX["穩健型"]).toEqual([30, 50, 10, 10]);
    w.applyAllocParams({ POOL_MID_RET: POOL_MID_RET, MIX_T2_LOW: MIX_T2[0], MIX_T2_MID: MIX_T2[1], MIX_T2_HIGH: MIX_T2[2] });
  });
});
