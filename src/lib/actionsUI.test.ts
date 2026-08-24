import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 調整動作清單 c.actions[]（區塊 1B，2026/08/24）。
 *
 * 動作經由 projection() 的**分離池**進試算：被動作指定的錢用該動作自己的 growth 滾，
 * 全域 rate 只管沒被指定的剩餘資產。最重要的一條斷言是
 * 「**沒有任何動作時，數字與改版前一位不差**」——分離池的實作必須在 acts 為空時
 * 完全退化成改版前的算式。
 *
 * 另外釘住三件容易走鐘的事：
 *   ① 一致性規則：所有流出走 pay*、所有流入走 get*
 *   ② 刪減支出／資產變現必須指到明細的某一列（不能自由填金額）
 *   ③ 動作 id 不撞號（批次新增時 uid() 會撞，見家庭成員那次）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = "plan";
});

function fresh() {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.render();
  return c;
}
const pane = () => w.document.querySelector("#app").innerHTML as string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const last = () => w.app.cases[0].actions[w.app.cases[0].actions.length - 1] as any;

function addOf(cat: string) {
  w.addRow("actions");
  const a = last();
  w.setActionCat(w.app.cases[0].actions.length - 1, cat);
  return a;
}

describe("資料層", () => {
  it("actions 進了 CASE_ARRAYS，migrateCase 保得住", () => {
    const c = fresh();
    expect(Array.isArray(c.actions)).toBe(true);
    w.addRow("actions");
    expect(w.migrateCase(w.app.cases[0]).actions.length).toBe(1);
  });

  it("新增列帶齊欄位，且預設啟用", () => {
    fresh();
    w.addRow("actions");
    const a = last();
    ["id", "on", "cat", "name", "tool", "ref", "payFrom", "payTo", "payMonthly", "payLump",
     "getFrom", "getTo", "getMonthly", "getLump", "divYear", "divMode", "growth",
     "cover", "coverKind", "src", "startY", "note"].forEach((k) => {
      expect(a).toHaveProperty(k);
    });
    expect(a.on).toBe(true);
  });

  it("批次新增時 id 不撞號", () => {
    fresh();
    for (let i = 0; i < 12; i++) w.addRow("actions");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = w.app.cases[0].actions.map((a: any) => a.id);
    expect(new Set(ids).size).toBe(12);
  });
});

describe("七個類別各自的欄位", () => {
  it("流入走 get*、流出走 pay*，換類別後年期不會落空", () => {
    fresh();
    // 流入型
    ["income", "expense"].forEach((k) => {
      const a = addOf(k);
      expect(a.cat).toBe(k);
      expect(w.n(a.getFrom)).toBeGreaterThan(0);
      expect(w.n(a.getTo)).toBeGreaterThan(0);
    });
    // 流出型
    ["regular", "insure", "loan"].forEach((k) => {
      const a = addOf(k);
      expect(w.n(a.payFrom)).toBeGreaterThan(0);
      expect(w.n(a.payTo)).toBeGreaterThan(0);
    });
    // 單點型
    ["lump", "liquidate"].forEach((k) => {
      const a = addOf(k);
      expect(w.n(a.payFrom)).toBeGreaterThan(0);
    });
  });

  it("換類別會清掉指向的明細（原本指的那一列一定不再適用）", () => {
    fresh();
    const a = addOf("expense");
    a.ref = "expenses:0";
    w.setActionCat(0, "regular");
    expect(w.app.cases[0].actions[0].ref).toBe("");
  });

  it("每個類別都畫得出來、不丟錯", () => {
    fresh();
    ["income", "expense", "regular", "lump", "liquidate", "loan", "insure"].forEach((k) => addOf(k));
    w.render();
    expect(w.app.cases[0].actions.length).toBe(7);
    expect(pane()).toContain("調整動作清單");
  });
});

describe("必填提醒", () => {
  it("刪減支出／資產變現沒指到明細時會出現警示", () => {
    fresh();
    addOf("expense");
    w.render();
    expect(pane()).toContain("尚未指到明細的某一列");
  });

  it("資產變現一定提醒要填淨額（租金消失／貸款清償／交易稅費）", () => {
    fresh();
    addOf("liquidate");
    w.render();
    expect(pane()).toContain("淨額");
  });

  it("指到明細之後警示消失", () => {
    fresh();
    addOf("expense");
    w.setAction(0, "ref", "expenses:0");
    expect(pane()).not.toContain("尚未指到明細的某一列");
  });
});

describe("啟用開關", () => {
  it("toggleAction 切換 on，畫面標成停用", () => {
    fresh();
    addOf("regular");
    expect(w.app.cases[0].actions[0].on).toBe(true);
    w.toggleAction(0);
    expect(w.app.cases[0].actions[0].on).toBe(false);
    expect(pane()).toContain("actrow off");
    w.toggleAction(0);
    expect(w.app.cases[0].actions[0].on).toBe(true);
  });
});

describe("動作真的進試算（分離池）", () => {
  it("沒有任何動作時，數字與改版前一位不差", () => {
    const c = fresh();
    const gap0 = w.gapPV(c);
    w.addRow("actions");
    w.toggleAction(0); // 停用
    expect(w.gapPV(w.app.cases[0])).toBeCloseTo(gap0, 6);
  });

  it("加一筆定期定額，缺口下降；停用後回到原值", () => {
    const c = fresh();
    const gap0 = w.gapPV(c);
    const a = addOf("regular");
    a.payMonthly = 30000;
    a.growth = 6;
    w.render();
    const after = w.gapPV(w.app.cases[0]);
    expect(after).toBeLessThan(gap0);
    w.toggleAction(0);
    expect(w.gapPV(w.app.cases[0])).toBeCloseTo(gap0, 6);
  });

  it("增加工作收入與刪減支出都讓缺口下降", () => {
    ["income", "expense"].forEach((k) => {
      const c = fresh();
      const gap0 = w.gapPV(c);
      const a = addOf(k);
      a.getMonthly = 20000;
      w.render();
      expect(w.gapPV(w.app.cases[0])).toBeLessThan(gap0);
    });
  });

  it("分離池用動作自己的報酬率：growth 越高、缺口越小", () => {
    function gapAt(g: number) {
      fresh();
      const a = addOf("regular");
      a.payMonthly = 30000;
      a.growth = g;
      return w.gapPV(w.app.cases[0]);
    }
    expect(gapAt(8)).toBeLessThan(gapAt(2));
  });

  it("買保障是支出：缺口變大（保額的價值走保障缺口，不走現金流）", () => {
    const c = fresh();
    const gap0 = w.gapPV(c);
    const a = addOf("insure");
    a.payMonthly = 8000;
    a.cover = 10000000;
    w.render();
    expect(w.gapPV(w.app.cases[0])).toBeGreaterThan(gap0);
  });

  it("願景事件會被標記可否負擔，並找得出第一個做不到的", () => {
    const c = fresh();
    const p = w.projection(c);
    expect(Array.isArray(p.events)).toBe(true);
    expect(p.events.length).toBeGreaterThan(0);
    p.events.forEach((e: { age: number; ok: boolean; name: string }) => {
      expect(typeof e.ok).toBe("boolean");
      expect(typeof e.name).toBe("string");
    });
    // 事件依年齡排序，firstFail 是第一個 ok=false 的
    const ages = p.events.map((e: { age: number }) => e.age);
    expect(ages.slice().sort((x: number, y: number) => x - y)).toEqual(ages);
    const firstBad = p.events.filter((e: { ok: boolean }) => !e.ok)[0] || null;
    expect(p.firstFail).toEqual(firstBad);
  });
});
