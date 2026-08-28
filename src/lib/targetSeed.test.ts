import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 勾選／取消人生目標時，對應資料列的生死。
 *
 * 背景（2026/08/26 教練回饋）：Ray 不小心點到「孝親」與「休閒興趣」的 ＋，
 * 它們就跑進「此分頁必達的目標」也出現在「目標/資產/願望」，然後**刪不掉**——
 * 實際要走「意圖/生涯打叉 → 回目標/資產 → 再點最右邊的橘色箭頭」三步驟。
 *
 * 真因：勾選時 seedGoalRow() 會自動 push 一列，但取消勾選**沒有對應的移除**
 * （刻意的，怕刪掉教練已填的資料）。
 *
 * 修法：取消勾選時，只把「還是空的」那一列收走（＝seed 出來之後沒人動過），
 * 有填過金額的留下並提示。誤點的情況自己清乾淨，填過的不會被誤刪。
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
  // alert 會擋住 jsdom，換成記錄下來
  w.alert = (m: string) => { alerts.push(m); };
});

let alerts: string[] = [];
const fresh = () => {
  alerts = [];
  w.app.cases = [w.migrateCase(w.newCase())];
  w.app.activeId = w.app.cases[0].id;
  return w.app.cases[0];
};
const goalsOf = (type: string) =>
  (w.activeCase().goals || []).filter((g: { type: string }) => g.type === type);

beforeEach(() => { fresh(); });

describe("勾選目標會帶出一列可填的空白", () => {
  it("勾「孝親規劃」→ goals 多一列 type='孝親'", () => {
    expect(goalsOf("孝親").length).toBe(0);
    w.toggleTarget("孝親規劃");
    expect(goalsOf("孝親").length).toBe(1);
    expect(goalsOf("孝親")[0].present).toBe(0);
  });

  it("已經有那個類型的列就不再重複帶", () => {
    w.toggleTarget("孝親規劃");
    w.toggleTarget("孝親規劃"); // 取消
    w.toggleTarget("孝親規劃"); // 再勾
    expect(goalsOf("孝親").length).toBe(1);
  });
});

describe("取消勾選：空列自動收走，填過的留下", () => {
  it("誤點後取消 → 那一列自己消失（不必再走三步驟）", () => {
    w.toggleTarget("孝親規劃");
    expect(goalsOf("孝親").length).toBe(1);
    w.toggleTarget("孝親規劃");
    expect(goalsOf("孝親").length, "空的 seed 列應該被收走").toBe(0);
    expect(alerts.length, "沒填過東西就不要打擾教練").toBe(0);
  });

  it("填過金額的不會被誤刪，而且會明講留在哪裡", () => {
    w.toggleTarget("孝親規劃");
    const c = w.activeCase();
    c.goals.find((g: { type: string }) => g.type === "孝親").present = 1200000;
    w.toggleTarget("孝親規劃");
    expect(goalsOf("孝親").length, "有金額就不能動它").toBe(1);
    expect(goalsOf("孝親")[0].present).toBe(1200000);
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain("孝親規劃");
    expect(alerts[0]).toContain("1 筆");
  });

  it("同一類型混著空列與有金額的列 → 只收走空的", () => {
    w.toggleTarget("購車規劃");
    const c = w.activeCase();
    c.goals.push({ on: true, name: "第二台車", type: "購車", present: 800000, minPresent: 0, start: 50, end: 50, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0 });
    expect(goalsOf("購車").length).toBe(2);
    w.toggleTarget("購車規劃");
    expect(goalsOf("購車").length).toBe(1);
    expect(goalsOf("購車")[0].name).toBe("第二台車");
  });

  it("只動被取消的那個目標，別的類型一列都不能碰", () => {
    w.toggleTarget("孝親規劃");
    w.toggleTarget("購車規劃");
    expect(goalsOf("孝親").length).toBe(1);
    expect(goalsOf("購車").length).toBe(1);
    w.toggleTarget("孝親規劃");
    expect(goalsOf("孝親").length).toBe(0);
    expect(goalsOf("購車").length, "購車不該受影響").toBe(1);
  });

  it("seededRowEmpty 同時看得懂 goals 與生活願望兩種欄位名", () => {
    // goals 用 present/minPresent/prepared；travel/hobby/luxury 用 amount/minAmount
    expect(w.seededRowEmpty({ present: 0, minPresent: 0, prepared: 0 })).toBe(true);
    expect(w.seededRowEmpty({ present: 100, minPresent: 0, prepared: 0 })).toBe(false);
    expect(w.seededRowEmpty({ amount: 0, minAmount: 0 })).toBe(true);
    expect(w.seededRowEmpty({ amount: 3000, minAmount: 0 })).toBe(false);
  });
});

describe("退休是例外", () => {
  it("取消退休會先問一次（它幾乎是必然會發生的）", () => {
    let asked = "";
    w.confirm = (m: string) => { asked = m; return false; };
    const before = ((w.activeCase().intent || {}).mustHave || []).slice();
    w.toggleTarget("退休生活規劃");
    expect(asked).toContain("退休");
    expect(w.activeCase().intent.mustHave, "按取消就不該真的取消").toEqual(before);
  });
});
