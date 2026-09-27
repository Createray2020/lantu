import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import * as EngineExports from "./engine";
import { JSDOM } from "jsdom";

/**
 * 購屋③（2026/09/27 Ray）：三種屋況的付款時程進投影。
 *   預售：簽約年訂簽開 → 工程期款分年 → 交屋年交屋自備＋雜費，貸款從交屋年起算
 *   新成屋：頭期＋雜費；中古：頭期＋仲介費＋雜費
 *   ⚠️ 沒選屋況的舊目標＝2026/08/30 版一模一樣（頭期＝總價−貸款、當年起貸），既有客戶數字一位不動。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

function caseWith(over: Record<string, unknown>) {
  const c = E.sampleCase();
  c.goals = [];   // 只留這一筆，投影的 goal 欄才不會混到示範資料的購車
  c.goals.push({ on: true, name: "買房", type: "購屋", present: 12_000_000, minPresent: 0, start: 45, end: 45, freq: 0, growth: "固定",
    appreciation: 0, loanRatio: 75, loanRate: 2.2, loanYears: 30, imp: 4, prepared: 0, ...over });
  return c;
}
const paysOf = (c: unknown) => E.goalLoans(c)[0];

describe("付款時程", () => {
  it("舊目標（沒屋況）：一筆頭期＝總價−貸款、當年起貸、沒有任何費用", () => {
    const L = paysOf(caseWith({}));
    expect(L.pays.length).toBe(1);
    expect(L.pays[0]).toMatchObject({ age: 45, amount: 3_000_000 });
    expect(L.handoverAge).toBe(45);
    expect(L.liab.startAge).toBe(45);
    expect(L.down).toBe(3_000_000);
  });
  it("預售：訂簽開 15％ → 工程期款 10％ 分 3 年 → 交屋年（48）自備＋雜費；貸款從 48 歲起算；期款不被成數再算一次", () => {
    const L = paysOf(caseWith({ condition: "預售" }));
    const labels = L.pays.map((p: { age: number; label: string; amount: number }) => [p.age, p.label, Math.round(p.amount)]);
    expect(labels).toEqual([
      [45, "訂簽開", 1_800_000], [45, "工程期款", 400_000], [46, "工程期款", 400_000], [47, "工程期款", 400_000],
      [48, "交屋自備＋雜費", 120_000 + 0],   // 自備 25％＝300 萬已經在訂簽開＋期款付完 → 交屋只剩雜費 1％
    ]);
    expect(L.handoverAge).toBe(48);
    expect(L.liab.startAge).toBe(48);
    expect(L.liab.balance).toBe(9_000_000);
    expect(Math.round(L.down)).toBe(3_120_000);
  });
  it("預售成數低（60％）：交屋自備補到 40％", () => {
    const L = paysOf(caseWith({ condition: "預售", loanRatio: 60 }));
    const last = L.pays[L.pays.length - 1];
    expect(Math.round(last.amount)).toBe(12_000_000 * 0.4 - 3_000_000 + 120_000);
  });
  it("新成屋：頭期＋雜費 1％；中古：頭期＋仲介 2％＋雜費 1.5％", () => {
    const a = paysOf(caseWith({ condition: "新成屋" }));
    expect(a.pays.length).toBe(1); expect(Math.round(a.pays[0].amount)).toBe(3_000_000 + 120_000);
    const b = paysOf(caseWith({ condition: "中古" }));
    expect(Math.round(b.pays[0].amount)).toBe(3_000_000 + 240_000 + 180_000);
    expect(b.pays[0].label).toContain("仲介");
  });
  it("每筆目標可覆寫範本（g.pay）：工程期款改分 2 年 → 交屋 47 歲；訂簽開改 20％", () => {
    const L = paysOf(caseWith({ condition: "預售", pay: { progressYears: 2, deposit: 20 } }));
    expect(L.handoverAge).toBe(47);
    expect(Math.round(L.pays[0].amount)).toBe(2_400_000);
    expect(L.pays.filter((p: { label: string }) => p.label === "工程期款").length).toBe(2);
  });
  it("投影：預售的錢分年扣、交屋前已付期款算固定資產、交屋年才進房子", () => {
    const c = caseWith({ condition: "預售" });
    const rows = E.projection(c).rows;
    const at = (age: number) => rows.find((r: { age: number }) => r.age === age);
    expect(Math.round(at(45).goal)).toBe(2_200_000);
    expect(Math.round(at(46).goal)).toBe(400_000);
    expect(Math.round(at(48).goal)).toBe(120_000);
    // 46 歲：已付 260 萬當固定資產；48 歲：整棟 1,200 萬進固定資產、貸款 900 萬起
    expect(at(48).net).toBeGreaterThan(at(47).net - 1);   // 交屋年進房子，淨值不會掉一大塊
  });
  it("engine.ts ↔ lantu-app.html：三種屋況的投影每一年結餘與淨值一致；函式逐字對拍", async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    const w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    for (const cond of [undefined, "預售", "新成屋", "中古"]) {
      const c = caseWith(cond ? { condition: cond } : {});
      const a = E.projection(c).rows, b = w.projection(JSON.parse(JSON.stringify(c))).rows;
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].bal, `${cond} 第 ${i} 年結餘`).toBeCloseTo(a[i].bal, 2);
        expect(b[i].net, `${cond} 第 ${i} 年淨值`).toBeCloseTo(a[i].net, 2);
      }
    }
    expect(HTML).toContain("function housePayAt(L,age){");
    expect(HTML).toContain("  var closing=Math.max(0,equity-dep-prog);");
    expect(HTML).toContain("  var goalOut=sum(gLoans,function(L){return housePayAt(L,age)});");
  });
});
