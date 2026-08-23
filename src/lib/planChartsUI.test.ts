import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 調整方案分頁的「看得懂」測試。
 *
 * 2026/08/23 Ray 的回饋：「有點難看得懂，很多東西不夠簡化，沒有圖表會看得很辛苦。」
 * 病因是把求解器的內部狀態整片攤成表格。這一支測試把修正後的**版面決策**釘住，
 * 免得日後有人「順手再加一張表」就把首屏塞回去：
 *   ・首屏只有三個區塊是展開的，其餘一律 <details> 收合
 *   ・主圖一定畫得出零線標籤與缺口區（這張圖的全部意義就是「有沒有掉到零以下」）
 *   ・六根槓桿的狀態不靠顏色，一定同時有圖示與文字
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
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

const cur = () => w.app.cases[0];
const pane = () => w.document.querySelector("#app").innerHTML as string;

describe("座標刻度：一定給得出好看的數字，而且零線一定在", () => {
  it("跨越零的區間必定包含 0", () => {
    expect(w.niceTicks(-8_900_000, 1_090_000, 3)).toContain(0);
    expect(w.niceTicks(-500, 500, 3)).toContain(0);
  });

  it("刻度是 1／2／2.5／5 × 10^k 的整數，不是把區間硬均分", () => {
    const ts: number[] = w.niceTicks(0, 45_000_000, 3);
    expect(ts.length).toBeGreaterThan(1);
    const step = ts[1] - ts[0];
    const mag = Math.pow(10, Math.floor(Math.log10(step)));
    expect([1, 2, 2.5, 5, 10]).toContain(+(step / mag).toFixed(4));
  });

  it("退化輸入（區間為 0）不會爆、不會回 NaN", () => {
    const ts = w.niceTicks(0, 0, 3);
    expect(Array.isArray(ts)).toBe(true);
    ts.forEach((v: number) => expect(Number.isFinite(v)).toBe(true));
  });
});

describe("主圖：一張圖說完「差多少」", () => {
  it("有缺口時畫得出零線標籤、缺口區與缺口金額", () => {
    const c = cur();
    const svg = w.gapChartSVG(c, {}, "dark", null) as string;
    expect(w.gapPV(c)).toBeGreaterThan(0);
    expect(svg).toContain(">0</text>");          // 零線的刻度標籤
    expect(svg).toContain("#ef6f6f");            // 缺口區的紅
    expect(svg).toContain("缺口 ");               // 缺口金額直接註記在圖上
    expect(svg).toContain("歲轉負");
  });

  it("兩條線都在線末端直接標名字，不靠顏色分辨", () => {
    const svg = w.gapChartSVG(cur(), { expense: 12 }, "dark", null) as string;
    expect(svg).toContain(">未調整</text>");
    expect(svg).toContain(">調整後</text>");
  });

  it("沒有套用任何槓桿時只畫一條線", () => {
    const svg = w.gapChartSVG(cur(), {}, "dark", null) as string;
    expect(svg).toContain(">未調整</text>");
    expect(svg).not.toContain(">調整後</text>");
  });

  it("深淺兩版是同一支函式，淺色版不會帶進深色的線色", () => {
    const light = w.gapChartSVG(cur(), { expense: 12 }, "light", null) as string;
    expect(light).toContain("#b07d3d");          // 淺色版的「調整後」
    expect(light).not.toContain("#f0c34e");      // 深色版的「調整後」不該出現
  });

  it("補不平的個案：缺口區塞滿整張圖也不會畫壞（座標仍是有限數）", () => {
    const c = cur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 0.3; });
    const svg = w.gapChartSVG(c, {}, "dark", null) as string;
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount / 0.3; });
  });
});

describe("六根槓桿量表：狀態不靠顏色", () => {
  it("每一根都同時有圖示與文字說明，而且列出上限", () => {
    const solo = w.soloSolve(cur());
    const h = w.leverBarsHTML(cur(), solo, "dark", false) as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.LEVERS.forEach((L: any) => expect(h).toContain(L.name));
    expect(h).toContain("上限");
    expect(/🟢|🔴|⚪/.test(h)).toBe(true);
  });

  it("階段閘門鎖住的那一根會寫出理由，不是只有變灰", () => {
    const c = cur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 0.3; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.expenses.forEach((e: any) => { e.amount = e.amount * 1.4; });
    const solo = w.soloSolve(c);
    expect(solo.gate.grade).toBe("D");
    const h = w.leverBarsHTML(c, solo, "dark", false) as string;
    expect(h).toContain("整裝期");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount / 0.3; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.expenses.forEach((e: any) => { e.amount = e.amount / 1.4; });
  });
});

describe("缺口組成與變化卡", () => {
  it("組成用長條，依金額由大到小", () => {
    const c = cur();
    const led = w.gapLedger(c);
    const h = w.gapBarsHTML(led, "dark") as string;
    const idx = led.flow.map((f: { name: string }) => h.indexOf(f.name));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });

  it("變化卡用箭頭表達方向，並把調整前的數字劃掉", () => {
    const h = w.deltaCardsHTML(cur(), { expense: 12 }, "dark") as string;
    expect(h).toContain("現值缺口");
    expect(h).toContain("願景達成度");
    expect(/[↗↘＝]/.test(h)).toBe(true);
    expect(h).toContain("line-through");
  });
});

describe("版面：首屏必須是圖，不是報表", () => {
  it("收合區塊維持三塊，不會有人偷偷把明細塞回首屏", () => {
    w.app.dataTab = "plan"; w.render();
    const h = pane();
    const folds = (h.match(/<details>/g) || []).length;   // foldSec 產生的都不帶 open
    expect(folds).toBe(3);                                 // 缺口組成／方案比較／其他參數
  });

  it("展開的區塊依序是：缺口(含拉桿) → 該解什麼 → 三個處方 → 配置與對帳", () => {
    const h = pane();
    const order = ["曲線掉到零線以下", "該解什麼", "三個處方", "配置與對帳"];
    let prev = -1;
    order.forEach((t) => {
      const i = h.indexOf(t);
      expect(i).toBeGreaterThan(prev);
      prev = i;
    });
    // 四塊都要在第一個收合區之前
    expect(prev).toBeLessThan(h.indexOf("<details>"));
  });

  it("首屏就有主圖與拉桿，兩者在同一個區塊裡（拉了要當場看到線動）", () => {
    const h = pane();
    const heroStart = h.indexOf("曲線掉到零線以下");
    const slider = h.indexOf('type="range"');
    const firstFold = h.indexOf("<details>");
    expect(heroStart).toBeGreaterThanOrEqual(0);
    expect(slider).toBeGreaterThan(heroStart);
    expect(slider).toBeLessThan(firstFold);                // 拉桿在第一個收合區塊之前
  });

  it("拉桿改值會寫進 plan.draft，且主圖跟著多一條線", () => {
    w.setLever("expense", 12);
    expect(w.n(cur().plan.draft.expense)).toBe(12);
    expect(pane()).toContain(">調整後</text>");
    w.clearDraft();
    expect(pane()).not.toContain(">調整後</text>");
  });
});
