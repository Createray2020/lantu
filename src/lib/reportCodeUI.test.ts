import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/* eslint-disable @typescript-eslint/no-explicit-any -- jsdom 的 window 是動態全域，同 financeUI.test.ts */

// 客戶編號從父層（PlanEditor / ClientPlanFrame）經 lantu:init 送進 iframe，
// 只用來印在三份可交付文件的表頭。
// ⚠️ 這條線很容易在改 postMessage 欄位時被默默切斷（畫面不會壞，只是編號消失），
//    所以從「收訊息」到「印出來」整段都要有測試守著。
describe("報告書表頭的客戶編號", () => {
  const html = readFileSync("public/lantu-app.html", "utf8");

  // ⚠️ lantu:init 的接收端只在 embed 模式註冊（?embed=1）——不帶 query 的 jsdom
  //    會走一般模式，訊息根本沒人接，測試會以「編號沒進來」的形式失敗。
  async function boot(url = "https://lantu.test/lantu-app.html?embed=1") {
    const dom = new JSDOM(html, { runScripts: "dangerously", url });
    const w = dom.window as any;
    await new Promise((r) => w.addEventListener("load", r));
    return w;
  }

  function caseWith(w: any) {
    const c = w.migrateCase(w.newCase());
    w.app.cases = [c];
    w.app.activeId = c.id;
    return c;
  }

  it("客戶版報告書與調整方案書的表頭都印得出來", async () => {
    const w = await boot();
    w.LANTU_CLIENT_CODE = "2610005";
    const c = caseWith(w);
    for (const doc of ["family", "plan"]) {
      w.app.reportDoc = doc;
      expect(w.reportPane(c), doc).toContain("客戶編號 2610005");
    }
  });

  it("沒有編號時整段不出現（教練本機開的示範案例）", async () => {
    const w = await boot();
    w.LANTU_CLIENT_CODE = null;
    const c = caseWith(w);
    w.app.reportDoc = "family";
    expect(w.reportPane(c)).not.toContain("客戶編號");
  });

  it("編號有 escape，不會變成注入點", async () => {
    const w = await boot();
    w.LANTU_CLIENT_CODE = "<img src=x onerror=1>";
    expect(w.docCodeHTML()).not.toContain("<img");
  });

  it("lantu:init 會把 clientCode 收成全域，且不寫進 case 資料", async () => {
    const w = await boot();
    const before = JSON.stringify(w.app.cases);
    w.dispatchEvent(
      Object.assign(new w.Event("message"), {
        source: w.parent,
        origin: w.location.origin,
        data: { type: "lantu:init", data: w.newCase(), clientCode: "2610042" },
      }),
    );
    expect(w.LANTU_CLIENT_CODE).toBe("2610042");
    // 編號是 DB 欄位不是規劃內容：寫進 case 會被存回 plan.data，之後就有兩份真相。
    expect(JSON.stringify(w.app.cases[0])).not.toContain("2610042");
    expect(before).not.toBe(JSON.stringify(w.app.cases));
  });
});
