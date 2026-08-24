import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 調整動作清單 c.actions[]（區塊 1B，2026/08/24）。
 *
 * 本階段只做資料層與輸入介面，**完全不進任何試算**——所以這支測試最重要的一條是
 * 「不管填了多少動作，既有的缺口與健康度一位不動」。動作要進 projection() 的
 * 分離池是區塊 2 的事，屆時這條斷言會被改寫成「有動作才會變」。
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

describe("⚠️ 區塊 1B 不進試算：填再多動作，既有數字一位不動", () => {
  it("缺口／需求現值／健康度等級都與沒有動作時相同", () => {
    const c = fresh();
    const gap0 = w.gapPV(c);
    const need0 = w.projection(c).needPV;
    const grade0 = w.health(c).grade;

    ["income", "expense", "regular", "lump", "liquidate", "loan", "insure"].forEach((k) => {
      const a = addOf(k);
      a.payMonthly = 30000;
      a.getMonthly = 30000;
      a.payLump = 3000000;
      a.getLump = 3000000;
      a.growth = 8;
      a.cover = 10000000;
    });

    const after = w.app.cases[0];
    expect(w.gapPV(after)).toBeCloseTo(gap0, 6);
    expect(w.projection(after).needPV).toBeCloseTo(need0, 6);
    expect(w.health(after).grade).toBe(grade0);
  });
});
