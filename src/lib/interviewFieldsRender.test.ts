import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/* eslint-disable @typescript-eslint/no-explicit-any -- jsdom 的 window 是動態全域，同 reportCodeUI.test.ts */

/**
 * 這一波四個欄位的「真的渲染得出來」測試（2026-09-10）。
 *
 * ⚠️ 純字串比對（interviewFields.drift.test.ts）擋得住欄位被刪，
 *    但擋不住執行期錯誤——衍生函式裡少一個 esc()／n() 就整個分頁白掉，
 *    而字串測試照樣全綠。所以這裡真的把三個分頁 render 出來跑一次。
 */
describe("訪談欄位：實際渲染", () => {
  const html = readFileSync("public/lantu-app.html", "utf8");

  async function boot() {
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/lantu-app.html?embed=1" });
    const w = dom.window as any;
    await new Promise((r) => w.addEventListener("load", r));
    const c = w.migrateCase(w.newCase());
    w.app.cases = [c];
    w.app.activeId = c.id;
    return { w, c };
  }

  it("空白新案：三個衍生區都渲染得出來，且各自給出「還沒問」的提示", async () => {
    const { w, c } = await boot();
    expect(w.readinessHint(c)).toContain("兩題都問完才判讀得出來");
    expect(w.decisionHint(c)).toContain("財務決策分工還沒問");
    expect(w.deferHint(c)).toContain("先把「起始歲」填上");
  });

  it("改變的準備度：四種象限各給不同的下一步", async () => {
    const { w, c } = await boot();
    const ms = (c.moneyStyle = {} as any);
    ms.willing = 8; ms.confidence = 8;
    expect(w.readinessHint(c)).toContain("可以直接進方案");
    ms.willing = 8; ms.confidence = 2;
    expect(w.readinessHint(c)).toContain("缺的是方法與陪伴");
    ms.willing = 2; ms.confidence = 8;
    expect(w.readinessHint(c)).toContain("缺的是動機");
    ms.willing = 2; ms.confidence = 2;
    expect(w.readinessHint(c)).toContain("先不要給方案");
  });

  it("只填一題不判讀，並且指名還缺哪一題", async () => {
    const { w, c } = await boot();
    c.moneyStyle = { willing: 7 } as any;
    expect(w.readinessHint(c)).toContain("你相信自己做得到的程度");
    c.moneyStyle = { confidence: 7 } as any;
    expect(w.readinessHint(c)).toContain("這件事你想做的程度");
  });

  it("⚠️ 0 分是有效答案，不能被當成沒填", async () => {
    const { w, c } = await boot();
    c.moneyStyle = { willing: 0, confidence: 0 } as any;
    const out = w.readinessHint(c);
    expect(out).not.toContain("兩題都問完才判讀得出來");
    expect(out).toContain("先不要給方案");
  });

  it("財務決策分工：認領後列出負責人，未認領的面向要被標出來", async () => {
    const { w, c } = await boot();
    c.members[0].name = "王大明";
    c.members[0].decides = ["日常支出", "保險"];
    c.members[0].jointConfirm = true;
    const out = w.decisionHint(c);
    expect(out).toContain("王大明");
    expect(out).toContain("還有 4 個面向沒有人負責");
    expect(out).toContain("需共同確認");
  });

  it("最晚實現：算得出可延年數，沒填的目標要被點名", async () => {
    const { w, c } = await boot();
    c.goals = [
      { on: true, name: "換屋", type: "購屋", start: 45, latest: 50 },
      { on: true, name: "孝親", type: "孝親", start: 42 },
    ];
    const out = w.deferHint(c);
    expect(out).toContain("換屋");
    expect(out).toContain("可延 5 年");
    expect(out).toContain("還有 1 個目標沒問");
    expect(out).toContain("已問 1 / 2 個目標");
  });

  it("最晚＝理想時間時，要說出「時間這條路走不通」而不是留白", async () => {
    const { w, c } = await boot();
    c.goals = [{ on: true, name: "購車", type: "購車", start: 45, latest: 45 }];
    expect(w.deferHint(c)).toContain("都沒有延後空間");
  });

  it("家庭分頁與意圖分頁整段 render 不炸，且看得到新區塊", async () => {
    const { w, c } = await boot();
    const people = w.peopleSec(c);
    expect(people).toContain("誰決定這個家的錢");
    expect(people).toContain("財務決策分工");
    expect(people).toContain("現居地");
    const intent = w.intentSec(c);
    expect(intent).toContain("改變的準備度");
  });
});
