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
    expect(after).toContain("失業中斷 6 個月");
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

// ── 第二批（2026/10/20）：④ 方案頁三件摘要卡、⑦ 退休三情境、⑤ 階段說明參考來源、⑥ 報告書配色 ──
describe("第二批落點（jsdom）", () => {
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
  it("④ 方案頁：沒有動作時不出現；有三個以上動作時剛好三張卡、改善大的排前面、清單本體不動", async () => {
    let h = await boot("plan");
    expect(h).not.toContain('id="planTop3"');
    const c = w.app.cases[0];
    c.actions = [
      { id: "x1", on: true, cat: "regular", name: "定期定額 3 千", payMonthly: 3000, payFrom: 41, payTo: 60, growth: 5 },
      { id: "x2", on: true, cat: "regular", name: "定期定額 3 萬", payMonthly: 30000, payFrom: 41, payTo: 60, growth: 5 },
      { id: "x3", on: true, cat: "insure", name: "補壽險", payMonthly: 2000, cover: 5000000 },
      { id: "x4", on: false, cat: "income", name: "關掉的", getMonthly: 99999 },
    ];
    w.render(); h = w.document.querySelector("#app").innerHTML;
    expect(h).toContain('id="planTop3"');
    const cards = w.document.querySelectorAll("#planTop3 .kpi");
    expect(cards.length).toBe(3);
    expect(w.document.getElementById("planTop3").textContent).not.toContain("關掉的");   // 清單本體會列，摘要卡不會
    const top = w.planTop3(c);
    expect(top[0].a.name).not.toBe("定期定額 3 千");          // 3 萬的改善一定大於 3 千
    expect(JSON.stringify(c.actions).includes('"on":false')).toBe(true); // 沒寫回
    expect(h).toContain("調整動作清單（3 個）");
  });
  it("⑦ 退休分頁：三欄報酬率＝RISK_TIERS 前三檔，純唯讀", async () => {
    await boot("data", "retire");
    const c = w.app.cases[0];
    const before = JSON.stringify(c);
    const rows = w.retireScenarios(c);
    expect(rows.map((r: { rr: number }) => r.rr)).toEqual([3, 5, 6.5]);
    expect(JSON.stringify(c)).toBe(before);
    const html = w.retireHeroHTML(c) as string;
    expect(html).toContain('id="retireScen"');
    expect((html.match(/#retireScen|class="kpi"/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it("⑤ 階段說明：有參考來源連結與免責；報告書版也有免責", async () => {
    await boot("analysis");
    const c = w.app.cases[0];
    const h = w.stageBandInner(w.health(c)) as string;
    expect(h).toContain("判定依據與參考來源");
    expect(h).toContain("holdingkeys.org");
    expect(h).toContain("不構成投資、稅務或法律建議");
    expect(w.stageReportNote(w.health(c))).toContain("不構成投資、稅務或法律建議");
  });
  it("⑥ 報告書配色：經典原樣、高對比把 navy 換成黑；選擇記在 localStorage", async () => {
    await boot("report");
    const c = w.app.cases[0];
    const raw = w.reportHTML(c) as string;
    expect(raw).toContain("#0d2b45");
    expect(w.rTheme(raw)).toBe(raw);                      // classic
    w.localStorage.setItem("lantu.reportTheme", "hc");
    const hc = w.rTheme(raw) as string;
    expect(hc).not.toContain("#0d2b45");
    expect(hc).toContain("#000000");
    expect(hc.length).toBe(raw.length);                   // 只換色碼，長度不變＝沒碰到內容
    w.render();
    expect(w.document.querySelector("#app").innerHTML).toContain("報告配色");
    w.localStorage.removeItem("lantu.reportTheme");
  });
});

// ── 補充（2026/10/20）：壓力測試接保單、願景句進客戶端儀表 ──
describe("壓力測試接保單／客戶端儀表願景句（jsdom）", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  async function boot(role: string, tab: string, dataTab?: string) {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    w.app.role = role; w.app.activeTab = tab; if (dataTab) w.app.dataTab = dataTab;
    w.app.cases = [w.migrateCase(w.sampleCase())]; w.app.activeId = w.app.cases[0].id;
    w.render();
    return w.document.querySelector("#app").innerHTML as string;
  }
  it("失業不理賠、傷病吃薪資補償；兩者都讀 existingCover 同一個數字", async () => {
    await boot("coach", "data", "coverage");
    const c = w.app.cases[0];
    const pm = w.primaryMember(c).name;
    c.params.stressCause = "job";
    const job = w.stressCalc(c);
    expect(job.comp).toBe(0);
    c.params.stressCause = "ill";
    const ill = w.stressCalc(c);
    const expect_ = w.n(w.existingCover(c, pm, "薪資補償（月）")) + w.n(w.existingCover(c, pm, "薪資補償（日）")) * 30;
    expect(ill.comp).toBe(expect_);
    // 有給付時，中斷期間的水位一定不低於失業情境
    for (let i = 0; i < ill.rows.length; i++) expect(ill.rows[i].cash).toBeGreaterThanOrEqual(job.rows[i].cash);
    const h = w.stressSec(c) as string;
    expect(h).toContain("失業（保單不理賠）");
    expect(h).toContain("傷病（薪資補償給付）");
  });
  it("客戶端儀表 hero 裡有願景句（同一支 anVerdictHTML）", async () => {
    const h = await boot("client", "analysis");
    const c = w.app.cases[0];
    const txt = w.overviewVisionText(w.overview(c));
    if (txt) expect(h).toContain(txt.slice(0, 20)); else expect(h).not.toContain("最早受影響的願景");
  });
});
