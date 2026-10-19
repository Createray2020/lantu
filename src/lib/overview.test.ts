import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";
import { clientOverviewOf } from "./clientOverview";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
const TS = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");

// 從兩份實作各剪出 overview 這一段（從區塊註解到 overviewVisionText 結束），逐字比對。
function slice(src: string): string {
  const a = src.indexOf("/* ===== 健診總覽 overview(c)");
  const b = src.indexOf("\n}\n", src.indexOf("function overviewVisionText(ov){", a));
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b + 3);
}

describe("overview(c)：健診總覽（2026/10/20）", () => {
  it("雙實作對拍：engine.ts 與 lantu-app.html 的 overview 區塊逐字相同", () => {
    expect(slice(TS)).toBe(slice(HTML));
  });

  it("sampleCase：階段是旅程命名、站穩／優先各最多三件、願景句要嘛空要嘛講得出延後幾年", () => {
    const c = E.sampleCase();
    const ov = E.overview(c);
    expect(["整裝期", "啟程期", "前行期", "遠行期"]).toContain(ov.stage);
    expect(ov.stage).toBe(E.stageName(E.health(c).grade));
    expect(ov.good.length).toBeLessThanOrEqual(3);
    expect(ov.todo.length).toBeLessThanOrEqual(3);
    expect(ov.good.length + ov.todo.length).toBeGreaterThan(0);
    const txt = E.overviewVisionText(ov);
    if (ov.vision) {
      expect(txt).toContain(ov.vision.name);
      expect(txt).toContain(String(ov.vision.age));
      if (ov.vision.delay) expect(ov.vision.to).toBe(ov.vision.age + ov.vision.delay);
    } else {
      expect(txt).toBe("");
    }
  });

  it("延後掃描不寫回 c（只動 clone）", () => {
    const c = E.sampleCase();
    const before = JSON.stringify(c);
    E.overview(c);
    expect(JSON.stringify(c)).toBe(before);
  });

  it("有開著的方案動作時，優先動的三件從動作清單來", () => {
    const c = E.sampleCase();
    c.actions = [{ id: "a1", on: true, name: "補緊急預備金" }, { id: "a2", on: false, name: "不該出現" }, { id: "a3", on: true, name: "增加定期定額" }];
    const ov = E.overview(c);
    expect(ov.todo[0]).toBe("補緊急預備金");
    expect(ov.todo[1]).toBe("增加定期定額");
    expect(ov.todo).not.toContain("不該出現");
  });

  it("clientOverviewOf：壞資料回 null，正常資料回可顯示的形狀", () => {
    expect(clientOverviewOf(null)).toBeNull();
    expect(clientOverviewOf({})).toBeNull();
    const r = clientOverviewOf(E.sampleCase());
    expect(r).not.toBeNull();
    expect(r!.stage).toBe(E.overview(E.sampleCase()).stage);
  });

  it("壓力測試與報告書總覽的掛點都在 html 裡", () => {
    expect(HTML).toContain("stressTest:function(c){return stressDerivedHTML(c);}");
    expect(HTML).toContain("tab('check',policyCheckupSec(c)+stressSec(c)+");
    expect(HTML).toContain("var body=rOverview(c)+'<h2>§、財務健康總覽</h2>'+");
    expect(HTML).toContain("<div id=\"anHeroVerdict\">");
  });
});

// ── 畫面層：在 jsdom 裡把三個落點真的畫出來 ──
import { JSDOM } from "jsdom";
describe("落點真的畫得出來（jsdom）", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  async function boot(tab: string, dataTab?: string) {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    w.app.role = "coach"; w.app.activeTab = tab; if (dataTab) w.app.dataTab = dataTab;
    w.app.cases = [w.migrateCase(w.sampleCase())]; w.app.activeId = w.app.cases[0].id;
    w.render();
    return w.document.querySelector("#app").innerHTML as string;
  }
  it("保障中心：壓力測試卡在健檢籤裡、預設收合、改月數只重畫 data-calc 區", async () => {
    const h = await boot("data", "coverage");
    expect(h).toContain("壓力測試 · 如果明天沒收入");
    const d = w.document.querySelector('details[data-fk="stress"]');
    expect(d).not.toBeNull();
    expect(d.hasAttribute("open")).toBe(false);
    expect(w.document.querySelector('[data-calc="stressTest"] svg')).not.toBeNull();
    const before = w.document.querySelector('[data-calc="stressTest"]').innerHTML;
    w.setMeta("params", "stressMonths", 6, "num");
    expect(w.app.cases[0].params.stressMonths).toBe(6);
    const after = w.document.querySelector('[data-calc="stressTest"]').innerHTML;
    expect(after).not.toBe(before);
    expect(after).toContain("收入中斷 6 個月");
  });
  it("分析頁首屏：結論句掛在 KPI 下方（有受影響願景才有字）", async () => {
    const h = await boot("analysis");
    expect(h).toContain('id="anHeroVerdict"');
    const ov = w.overview(w.app.cases[0]);
    const el = w.document.getElementById("anHeroVerdict");
    if (ov.vision) expect(el.textContent).toContain(ov.vision.name); else expect(el.textContent).toBe("");
  });
  it("報告書：第一章是本次健診總覽，含階段與站穩／優先", async () => {
    const h = w.reportHTML(w.app.cases[0]) as string;
    expect(h).toContain("本次健診總覽");
    expect(h).toContain("已經站穩的");
    expect(h).toContain("優先動的三件");
    expect(h.indexOf("本次健診總覽")).toBeLessThan(h.indexOf("財務健康總覽"));
  });
});
