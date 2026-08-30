import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 「七處版面重排」的守門員（Ray 2026/08/28 對版核可、2026/08/30 併入正式檔）。
 *
 * 病因一句話：教練端與客戶端把「診斷用的表」當成首屏，客戶看到的第一眼是一堆數字。
 * 這一輪把每一段的**結論改成圖**、逐項數字一律收進 <details>。
 * 這支測試釘的是**版面決策**，不是像素：
 *   ① 分析首屏＝一張英雄圖 ＋ 兩根拉桿 ＋ 三個數字（不是四個 KPI ＋ 一整排晶片）
 *   ② 規劃前/後＝成對長條，不再是純表格
 *   ③ 保障缺口＝每列各自滿刻度的長條（共用刻度會讓日額那幾列看不見）
 *   ④ 比率體檢＝bullet，而且**每一列都有文字狀態**（不可以只靠燈號顏色）
 *   ⑤ 退休金流＝堆疊柱；退休分頁首屏＝曲線 ＋ 三格（data-calc 機制原封不動）
 *   ⑥ 訪談清單＝依分頁分群，但 INTERVIEW_STEPS 一個字都不動
 *   ⑦ 退休與保障需求各有一行前置條件列
 *   ⑧ 客戶端藍圖首屏＝三個數字 ＋ 圖上移 ＋ 25 項指標收合
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
const PROTO = readFileSync(new URL("../../docs/版面原型_20260828.html", import.meta.url), "utf8");
const PORTAL = readFileSync(new URL("../app/portal/page.tsx", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  // jsdom 沒有 scrollIntoView，anJump() 會用到。
  w.Element.prototype.scrollIntoView = function () {};
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useSample(role: "coach" | "client", tab: string, dataTab?: string): any {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.role = role;
  w.app.activeTab = tab;
  if (dataTab) w.app.dataTab = dataTab;
  w.render();
  return c;
}
const pane = () => w.document.querySelector("#app").innerHTML as string;
const $ = (sel: string) => w.document.querySelector(sel);
const $$ = (sel: string) => [...w.document.querySelectorAll(sel)];

describe("① 分析分頁首屏：一張圖 ＋ 兩根拉桿 ＋ 三個數字", () => {
  it("首屏就是英雄圖，KPI 從 4 個砍成 3 個", () => {
    useSample("coach", "analysis");
    expect($("#anHero"), "分析分頁第一塊要是英雄圖").toBeTruthy();
    expect($("#anHeroChart svg"), "英雄圖要真的畫得出 SVG").toBeTruthy();
    const kpis = $$("#anHero .kpi").map((e: Element) => e.querySelector(".lb")!.textContent);
    expect(kpis).toEqual(["淨資產", "退休缺口", "可投資資產轉負"]);
    expect(kpis, "年結餘已經是圖上那一根一根的柱子，不重複列一格").not.toContain("年結餘");
  });

  it("拉桿緊貼在圖下方：投資報酬率、退休年齡，各一根，外加重設", () => {
    useSample("coach", "analysis");
    const tune = $("#anHero .antune");
    expect(tune).toBeTruthy();
    const ranges = [...tune.querySelectorAll('input[type="range"]')];
    expect(ranges.length).toBe(2);
    expect(tune.textContent).toContain("投資報酬率");
    expect(tune.textContent).toContain("退休年齡");
    expect(tune.textContent).toContain("重設");
    // 圖 → 拉桿 → 數字，順序不能亂（拉桿要在圖與 KPI 之間）
    const html = $("#anHero").innerHTML as string;
    expect(html.indexOf("anHeroChart")).toBeLessThan(html.indexOf("antune"));
    expect(html.indexOf("antune")).toBeLessThan(html.indexOf("anHeroKpis"));
  });

  it("拉了當場重畫圖與 KPI，而且**不寫回客戶的資料**", () => {
    const c = useSample("coach", "analysis");
    const ret0 = c.params.invReturn, age0 = c.profile.retireAge;
    const chart0 = $("#anHeroChart").innerHTML as string;
    const kpi0 = $("#anHeroKpis").innerHTML as string;
    w.anTune("ret", "9");
    w.anTune("age", "72");
    expect($("#anHeroChart").innerHTML, "圖要跟著換").not.toBe(chart0);
    expect($("#anHeroKpis").innerHTML, "三個數字也要跟著換").not.toBe(kpi0);
    expect($("#anTuneV_age").textContent).toBe("72 歲");
    expect($("#anTuneV_ret").textContent).toBe("9.0%");
    expect(c.params.invReturn, "現場假設不可以悄悄存成客戶的參數").toBe(ret0);
    expect(c.profile.retireAge).toBe(age0);
    expect(pane()).toContain("目前顯示的是假設值");
    w.anTuneReset();
    expect(pane()).not.toContain("目前顯示的是假設值");
  });

  it("晶片列與快速跳轉整組收進圖下一行 details，但拖曳／隱藏／anJump 全部照舊", () => {
    useSample("coach", "analysis");
    const tools = $("details.antools");
    expect(tools, "模組導覽要收進 details").toBeTruthy();
    expect(tools.querySelector("#anChips"), "21 顆晶片還在裡面").toBeTruthy();
    expect($$("#anChips .anchip").length).toBeGreaterThan(15);
    // 5 顆快速跳轉鈕也在同一個 details 裡
    expect(tools.innerHTML).toContain(w.financeNavHTML());
    expect([...tools.querySelectorAll('a[onclick^="anJump"]')].length).toBe(5);
    // anJump 仍然找得到卡片並展開
    w.anJump("beforeafter");
    expect($("#anmod_beforeafter").open).toBe(true);
  });
});

describe("② 規劃前 / 後對照：成對水平長條", () => {
  it("不再是純表格——有成對長條，灰＝規劃前、金＝規劃後", () => {
    const c = useSample("coach", "analysis");
    const h = w.beforeAfterHTML(c) as string;
    expect(h).toContain('class="baItem"');
    expect(h).toContain("#8ea3b5"); // 規劃前（planChartColors.BASE）
    expect(h).toContain("#f0c34e"); // 規劃後（planChartColors.AFT，全站既有語意色）
    expect(h).not.toMatch(/^<table/);
  });

  it("分三組：越大越好 ↑／越小越好 ↓／時間點（時間點用箭頭寫法）", () => {
    const c = useSample("coach", "analysis");
    const h = w.beforeAfterHTML(c) as string;
    expect(h).toContain("越大越好 ↑");
    expect(h).toContain("越小越好 ↓");
    expect(h).toContain("時間點");
    expect(h).toMatch(/歲<\/span> <span[^>]*>→<\/span>/); // 65 歲 → 70 歲
  });

  it("每一項標題右邊直接寫改善幅度，原本的表收進 details", () => {
    const c = useSample("coach", "analysis");
    const h = w.beforeAfterHTML(c) as string;
    expect(h).toMatch(/class="ba(Better|Worse|Same)"/);
    expect(h).toContain("<details class=\"foldbox\"><summary>逐項數字（原本的對照表）");
    // 表格只能在 details 裡，不能還留在上面
    expect(h.indexOf("<table")).toBeGreaterThan(h.indexOf("逐項數字（原本的對照表）"));
  });
});

describe("③ 保障缺口：每一列各自以自己的毛需求為滿刻度", () => {
  it("畫成長條，已備（灰）／缺口（紅 #ef6f6f），中間留 2px", () => {
    const c = useSample("coach", "analysis");
    const h = w.coverageGapBarsHTML(w.coverageGaps(c)) as string;
    expect(h).toContain('class="gpRow"');
    expect(h).toContain("#ef6f6f");
    expect(h).toContain("#8ea3b5");
    expect(h).toMatch(/margin-left:2px/);
  });

  it("⚠️ 不共用刻度：壽險千萬與住院日額幾千同時存在時，日額那幾列照樣看得見", () => {
    const gs = [
      { member: "王大明", kind: "壽險", need: 17_720_000, have: 3_000_000, gap: 14_720_000 },
      { member: "王大明", kind: "住院醫療", need: 5000, have: 2000, gap: 3000 },
    ];
    const h = w.coverageGapBarsHTML(gs) as string;
    // 每一列的兩段寬度加起來都是 100%（各自滿刻度），不是把 5000 除以 1772 萬
    const widths = [...h.matchAll(/width:(?:calc\()?([\d.]+)%/g)].map((m) => parseFloat(m[1]));
    expect(widths.length).toBe(4);
    expect(widths[2] + widths[3]).toBeCloseTo(100, 0);
    expect(Math.min(...widths), "共用刻度的話這裡會是 0.0x%，短到看不見").toBeGreaterThan(10);
  });

  it("依缺口由大到小排序，逐列數字收進 details", () => {
    const gs = [
      { member: "A", kind: "壽險", need: 100, have: 90, gap: 10 },
      { member: "B", kind: "壽險", need: 100, have: 0, gap: 100 },
      { member: "C", kind: "壽險", need: 100, have: 50, gap: 50 },
    ];
    const h = w.coverageGapBarsHTML(gs) as string;
    expect([...h.matchAll(/<span>([ABC]) · /g)].map((m) => m[1])).toEqual(["B", "C", "A"]);
    const c = useSample("coach", "analysis");
    const mod = w.analysisModules(c).find((x: { k: string }) => x.k === "gap");
    expect(mod.html()).toContain("逐列數字（需求 / 已備 / 缺口）");
  });
});

describe("④ 比率體檢：bullet ＋ 一定要有文字狀態", () => {
  it("ideal 字串四種型態都解析得出來，解析不出來的退回文字列", () => {
    expect(w.ratioIdealBand("<70%")).toEqual({ lo: 0, hi: 70 });
    expect(w.ratioIdealBand(">50%")).toEqual({ lo: 50, hi: null });
    expect(w.ratioIdealBand("≥100% 即財務自由")).toEqual({ lo: 100, hi: null });
    expect(w.ratioIdealBand("10%~15%")).toEqual({ lo: 10, hi: 15 });
    expect(w.ratioIdealBand("—")).toBeNull();
    expect(w.ratioValNum("62.3%")).toBeCloseTo(62.3, 3);
    expect(w.ratioValNum("—（現齡沒有有效收入）")).toBeNull();
  });

  it("⚠️ 每一列除了顏色，另外直接寫出達標／待留意／需改善／參考值", () => {
    const c = useSample("coach", "analysis");
    const rr = w.ratios(c);
    const r = w.ratioBulletsHTML(rr, "收支流量");
    expect(r.total).toBeGreaterThan(8);
    const marks = [...(r.html as string).matchAll(/class="blSt"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(marks.length, "每一列都要有一個文字狀態，燈號色不可以是唯一資訊").toBe(r.total);
    expect(marks.every((t) => /✓ 達標|△ 待留意|✕ 需改善|· 參考值/.test(t))).toBe(true);
  });

  it("兩張表 25 項全改 bullet，頂部一行摘要「N 項裡有 M 項出界」，公式表收 details", () => {
    const c = useSample("coach", "analysis");
    const rr = w.ratios(c);
    const flow = w.ratioBulletsHTML(rr, "收支流量");
    const bs = w.ratioBulletsHTML(rr, "資產負債");
    expect(flow.total + bs.total).toBe(Object.keys(rr).length);
    expect(Object.keys(rr).length).toBe(25);
    const block = w.ratioBulletBlock(rr, "收支流量", "<table></table>") as string;
    expect(block).toMatch(/\d+ 項裡有 \d+ 項出界/);
    expect(block).toContain("逐項數字與公式（原本的表）");
    expect(block).toContain('class="blNeedle"');
    expect(block).toContain('class="blBand"');
  });

  it("燈號色沿用既有那一組（rColor 的四個值）", () => {
    expect(w.RATIO_STATUS.good[1]).toBe("var(--ok)");
    expect(w.RATIO_STATUS.warn[1]).toBe("var(--amber2)");
    expect(w.RATIO_STATUS.bad[1]).toBe("var(--warn)");
    expect(w.RATIO_STATUS.na[1]).toBe("var(--mut)");
  });
});

describe("⑤ 退休金流與退休分頁首屏", () => {
  it("退休三段式金流是堆疊柱，不是 16 列的表", () => {
    const c = useSample("coach", "analysis");
    const h = w.retireCashflowHTML(c) as string;
    expect(h).toContain("退休三段式金流堆疊柱");
    expect(h).toContain("<rect");
    expect(h).toContain("#5cc08a"); // 理財收入
    expect(h).toContain("#5b93d6"); // 工作收入
    expect(h).toContain("#ef6f6f"); // 缺口
    expect(h).toContain("當年家庭總需求");
    expect(h).toContain("退休 " + w.n(c.profile.retireAge) + " 歲");
    expect(h).toContain("逐年數字（原本的表）");
    expect(h.indexOf("<svg")).toBeLessThan(h.indexOf("<table"));
  });

  it("退休分頁上方有退休期資產曲線（金線＋轉負紅虛線）", () => {
    useSample("coach", "data", "retire");
    const svg = $('svg[aria-label="退休期可投資資產曲線"]');
    expect(svg).toBeTruthy();
    expect(svg.outerHTML).toContain("#f0c34e"); // 可投資資產本金（既有語意色）
    expect(svg.outerHTML).toMatch(/歲轉負|退休 \d+ 歲/);
  });

  it("retireHero 從 5 格砍到 3 格，餘年與月生活費終值收進明細", () => {
    const c = useSample("coach", "data", "retire");
    const el = $('[data-calc="retireHero"]');
    const labels = [...el.querySelectorAll(".big3 > .b > .l")].map((e: Element) => e.textContent);
    // 首屏三格；details 裡另有兩格中間值
    expect(labels.slice(0, 3)).toEqual(["退休總需求", "已準備", "缺口"]);
    const fold = el.querySelector("details.foldbox");
    expect(fold, "餘年與月生活費終值要收在明細裡").toBeTruthy();
    expect(fold.textContent).toContain("退休後餘年");
    expect(fold.textContent).toContain("退休月生活費(終值)");
    expect(w.retireHeroHTML(c)).toContain("中間值與計算明細");
  });

  it("⚠️⚠️ data-calc=retireHero 的即時更新機制原封不動（覆寫的是 retireHeroHTML 本身）", () => {
    expect(HTML).toContain('<div data-calc="retireHero">');
    expect(HTML).toContain("retireHero:function(c){return retireHeroHTML(c);}");
    const c = useSample("coach", "data", "retire");
    c.retire.prepared = [{ item: "勞退", age: 65, amount: 1_000_000, method: "一次領" }];
    w.render();
    const el = $('[data-calc="retireHero"]');
    const gap1 = w.retireNeed(c).gap;
    expect(el.innerHTML).toContain(w.fmt(gap1));
    w.set("prepared:0", "amount", "5000000", "num");
    expect(el.innerHTML).toContain(w.fmt(w.retireNeed(c).gap));
  });

  it("⚠️ 三個參數輸入框緊貼圖下方，但一定在 data-calc 容器外面", () => {
    useSample("coach", "data", "retire");
    const el = $('[data-calc="retireHero"]');
    expect(el.querySelectorAll("input,select,textarea").length,
      "data-calc 容器整塊 innerHTML 重畫，裡面放輸入框會在打字中途被換掉").toBe(0);
    const tune = $(".antune .fgrid");
    expect(tune, "三個參數要在圖下方那一塊").toBeTruthy();
    expect(tune.textContent).toContain("期望退休月生活費");
    expect(tune.textContent).toContain("退休後報酬率");
    expect(tune.textContent).toContain("退休後通膨");
  });

  it("退休時點表與勞保勞退概算收進 details", () => {
    useSample("coach", "data", "retire");
    const sums = $$("#app details.foldbox > summary").map((e: Element) => e.textContent);
    expect(sums.some((t: string) => t.includes("退休時點"))).toBe(true);
    expect(sums.some((t: string) => t.includes("勞保"))).toBe(true);
  });
});

describe("⑥ 訪談檢核清單：依分頁分群，題號不動", () => {
  it("⚠️ INTERVIEW_STEPS 一個字都沒動（20 題、順序就是問卷）", () => {
    expect(w.INTERVIEW_STEPS.length).toBe(20);
    expect(w.INTERVIEW_STEPS.map((s: { k: string }) => s.k).join(",")).toBe(
      "purpose,basic,career,house,car,marry,child,parent,travel,hobby,luxury," +
      "retire,legacy,income,expense,asset,debt,credit,cover,doc",
    );
  });

  it("實際是 9 群 · 8 次切換，畫面上照實寫", () => {
    useSample("coach", "data", "intent");
    const grps = $$("#app .ivgrp");
    expect(grps.length).toBe(9);
    expect(pane()).toContain("<b>9 段 · 8 次切換</b>");
    expect($$("#app .ivrow").length, "題目一題都不能少").toBe(20);
  });

  it("群內維持原始題號：意圖那一群就是 1. 3. 6. 13. 20.", () => {
    useSample("coach", "data", "intent");
    const first = $("#app .ivgrp");
    expect(first.querySelector(".ivgrphd b").textContent).toBe("意圖 / 生涯");
    expect([...first.querySelectorAll(".ivno")].map((e: Element) => e.textContent))
      .toEqual(["1", "3", "6", "13", "20"]);
    expect(first.querySelector(".ivgrphd .hint").textContent).toContain("第 1、3、6、13、20 題");
  });

  it("每一群一顆「前往這一段 ›」，走既有的 jumpTab", () => {
    useSample("coach", "data", "intent");
    const btns = $$("#app .ivgrphd .tbtn");
    expect(btns.length).toBe(9);
    expect(btns.every((b: Element) => /^jumpTab\('\w+'\)$/.test(b.getAttribute("onclick")!))).toBe(true);
  });
});

describe("⑦ 前置條件列", () => {
  it("退休分頁：兩項相依，都填了就是綠勾", () => {
    useSample("coach", "data", "retire");
    const bar = $("#app .pqBar");
    expect(bar).toBeTruthy();
    expect(bar.textContent).toContain("這一段的自動帶入需要");
    expect(bar.textContent).toContain("支出表 · 生活／消費列");
    expect(bar.textContent).toContain("家庭成員 · 支出比例%");
    expect(bar.textContent).toContain("分頁順序是刻意的（先講夢想再問錢）");
  });

  it("沒填的那一項是橘色「未填 · 前往 ›」，按了走 jumpTab", () => {
    const c = useSample("coach", "data", "retire");
    c.members.forEach((m: { expRatio: number }) => { m.expRatio = 0; });
    w.render();
    const no = $("#app .pqBar .pqNo");
    expect(no).toBeTruthy();
    expect(no.textContent).toContain("未填 · 前往 ›");
    expect(no.getAttribute("onclick")).toBe("jumpTab('family')");
  });

  it("保障需求卡：掛在 needsTbl 前面，data-calc=coverageNeeds 重畫時它也跟著在", () => {
    const c = useSample("coach", "data", "coverage");
    const box = $('[data-calc="coverageNeeds"]');
    expect(box.querySelector(".pqBar"), "重畫後前置條件列要還在").toBeTruthy();
    expect(w.coverageHubParts(c).needsTbl.indexOf("pqBar")).toBeLessThan(20);
    // 重畫一次（syncDerived 走的就是這條）
    box.innerHTML = w.coverageHubParts(c).needsTbl;
    expect(box.querySelector(".pqBar")).toBeTruthy();
  });

  it("⚠️ 分頁分組順序沒有被動到", () => {
    expect(w.BASE_TABS.map((b: string[]) => b[0]))
      .toEqual(["family", "finance", "credit", "coverage", "tax"]);
  });
});

describe("⑧-1 客戶端藍圖首屏", () => {
  it("KPI 4→3，圖上移到 KPI 之後，25 項指標收進 details", () => {
    useSample("client", "analysis");
    const kpis = $$("#app .kpis .kpi").map((e: Element) => e.querySelector(".lb")!.textContent);
    expect(kpis).toEqual(["淨資產", "財務階段", "退休缺口"]);
    const html = pane();
    expect(html.indexOf('class="kpis"')).toBeLessThan(html.indexOf("生涯資產模擬藍圖"));
    expect(html.indexOf("生涯資產模擬藍圖")).toBeLessThan(html.indexOf("財務健康度"));
    const fold = $$("#app details.foldbox > summary").map((e: Element) => e.textContent);
    expect(fold.some((t: string) => t.includes("協會標準 25 項"))).toBe(true);
    // 表格不可以還攤在首屏
    expect($("#app .sec > h4")!.textContent).not.toContain("我的財務指標");
  });
});

describe("⑧-2 /portal 首頁（React）", () => {
  // 版面本身由 portalHomeUI.test.ts 把整個 page.tsx SSR 出來釘住；
  // 這裡只留一條「原始碼層級」才看得出來的守門員。
  it("⚠️ 用 src/lib/passport.ts 真正的函式，不再抄一份公式", () => {
    expect(PORTAL).toContain("computePassport");
    expect(PORTAL, "不可以在頁面裡重寫 fv / pmt / 年金給付").not.toMatch(/function\s+(fv|pmt|annuityPayout)\s*\(/);
    expect(PORTAL, "看到複利的 Math.pow 就表示公式被抄過來了").not.toMatch(/Math\.pow\(1 \+ i/);
  });
});

describe("正式檔就是提案版：沒有原型的殘骸", () => {
  it("PROTO 旗標／_orig 備份／切換鈕／原型說明列一個都不留", () => {
    expect(HTML).not.toContain("PROTO");
    expect(HTML).not.toContain("protoBar");
    expect(HTML).not.toContain("protoSet");
    expect(HTML).not.toMatch(/var _\w+\s*=\s*window\.\w+HTML/);
    expect(HTML).not.toContain("版面原型");
  });

  it("原型存底沒有被動到（那是對版的底稿）", () => {
    expect(PROTO).toContain("window.PROTO=true;");
    expect(PROTO).toContain("嵐途 LAN TU · 版面原型 2026/08/28（現況 ↔ 提案）");
  });

  it("⚠️ 新畫的 SVG 一律走 svgFit()：viewBox 寬多少 CSS max-width 就鎖多少", () => {
    const c = useSample("coach", "analysis");
    for (const h of [w.retireCashflowHTML(c) as string, w.retireLineHTML(c) as string]) {
      const vb = /viewBox="0 0 (\d+) /.exec(h)!;
      expect(h).toContain(`max-width:${vb[1]}px`);
    }
  });
});
