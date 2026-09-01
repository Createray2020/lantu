import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 缺口總表（教練端「建議」→ gaptable、客戶端「我的規劃建議」）。
 *
 * Ray 2026/09/01：「『教練建議』欄位最底下有一個『缺口總表』已經破圖了。那個表格的
 * 內容沒有抓對，所以有一些資料加上順位的部分全部都遮掉了、跑掉了。」
 *
 * 真因不是 CSS：舊版 gapRowsByPriority() 只硬寫了退休／教育／傳承三列，
 * 但 TARGET_META 有 14 個可選目標。凡是別的目標被列為必達，表裡就**沒有那一列**
 * → 順位徽章印出 1、2、5、10 這種跳號，表尾的「必須達成 · 優先序」卻老實列 1..n。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
});

/** 建一個 case 並掛上去（gotoGoal / app.role 這些都吃 activeCase）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mount(sample = true): any {
  const c = w.migrateCase(sample ? w.sampleCase() : w.newCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.role = "coach";
  return c;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gapHTML(c: any): string {
  return w.gapRowsByPriority(c, w.retireNeed(c), w.metrics(c));
}

/** 第一列（＝順位 1 的那個目標）。表尾那三列是共用的，斷言別掃到它們。 */
function firstRow(html: string): string {
  return html.slice(0, html.indexOf("</tr>") + 5);
}

/** 每一列的第一格（順位欄）。 */
function rankCells(html: string): string[] {
  const doc = new w.DOMParser().parseFromString(`<table>${html}</table>`, "text/html");
  return [...doc.querySelectorAll("tr")].map((tr: Element) =>
    (tr.children[0]?.textContent || "").trim(),
  );
}

/** 每一列的第二格（項目名，不含底下那行口徑說明）。 */
function nameCells(html: string): string[] {
  const doc = new w.DOMParser().parseFromString(`<table>${html}</table>`, "text/html");
  return [...doc.querySelectorAll("tr")].map((tr: Element) => {
    const td = tr.children[1] as Element | undefined;
    if (!td) return "";
    const hint = td.querySelector(".hint");
    const t = (td.textContent || "").trim();
    return hint ? t.replace((hint.textContent || "").trim(), "").trim() : t;
  });
}

describe("順位不跳號", () => {
  it("⚠️ 11 個必達目標就有 11 列，順位 1..11 一個不缺（0901 破圖的真因）", () => {
    const c = mount();
    const it2 = w.normalizeIntent(c);
    it2.mustHave = w.visibleTargets(c).map((x: string[]) => x[0]);
    it2.targets = it2.mustHave.slice();
    it2.mustHave.forEach((t: string) => w.seedGoalRow(c, t));

    const ranks = rankCells(gapHTML(c));
    const n = it2.mustHave.length;
    expect(n).toBeGreaterThanOrEqual(11);
    expect(ranks.slice(0, n)).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)));
    // 目標以外的三列（保障缺口 ×2、房產車輛年稅）順位欄一律「—」
    expect(ranks.slice(n)).toEqual(["—", "—", "—"]);
  });

  it("每個必達目標都有自己的一列，順序與 mustHave 逐字相同", () => {
    const c = mount();
    const it2 = w.normalizeIntent(c);
    it2.mustHave = ["退休生活規劃", "購車規劃", "孝親規劃", "子女教養規劃"];
    it2.targets = it2.mustHave.slice();

    expect(nameCells(gapHTML(c)).slice(0, 4)).toEqual(["退休生活", "購車", "孝親", "子女教養"]);
  });

  it("⚠️ 反向的錯：沒列為必達的目標不該佔一列（舊版無條件印傳承 4,000 萬）", () => {
    const c = mount();
    expect(w.legacyNeed(c)).toBeGreaterThan(0); // 資料在，只是客戶沒把它列為必達
    const it2 = w.normalizeIntent(c);
    it2.mustHave = ["退休生活規劃"];
    it2.targets = it2.mustHave.slice();

    const h = gapHTML(c);
    expect(nameCells(h)).not.toContain("傳承");
    expect(h).not.toContain("未列為必達");
  });
});

describe("每一格的數字取對來源", () => {
  it("goalSelfFundFV 與 projection 的 goalOut 同調（同一套成長規則）", () => {
    const c = mount(false);
    c.profile.age = 40;
    c.params.inflation = 2;
    c.goals = [
      { on: true, name: "圓夢", type: "其他", present: 1_000_000, start: 45, end: 45,
        freq: 0, growth: "通膨", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 },
    ];
    const fv = w.goalSelfFundFV(c)[0];
    const yearFive = w.projection(c).rows.find((r: { age: number }) => r.age === 45);
    expect(Math.round(fv)).toBe(Math.round(yearFive.goal));
    expect(Math.round(fv)).toBe(Math.round(1_000_000 * Math.pow(1.02, 5)));
  });

  it("⚠️ 有貸款計畫的購屋只算頭期款——貸款那段在負債裡，算兩次等於買兩棟", () => {
    const c = mount(false);
    c.profile.age = 40;
    c.params.inflation = 0;
    c.goals = [
      { on: true, name: "首購", type: "購屋", present: 10_000_000, start: 45, end: 45,
        freq: 0, growth: "固定", imp: 5, prepared: 0,
        loanRatio: 70, loanRate: 2, loanYears: 30, appreciation: 0 },
    ];
    const it2 = w.normalizeIntent(c);
    it2.mustHave = ["購屋規劃"];
    it2.targets = it2.mustHave.slice();

    expect(Math.round(w.goalSelfFundFV(c)[0])).toBe(3_000_000);
    const h = gapHTML(c);
    expect(h).toContain("3,000,000 元");
    expect(h).not.toContain("10,000,000 元");
  });

  it("週期性目標依實際發生次數累加，不是只算一次", () => {
    const c = mount(false);
    c.profile.age = 40;
    c.params.inflation = 0;
    c.goals = [
      { on: true, name: "奉養", type: "孝親", present: 200_000, start: 41, end: 45,
        freq: 1, growth: "固定", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 },
    ];
    expect(Math.round(w.goalSelfFundFV(c)[0])).toBe(200_000 * 5);
  });

  it("已備 ≥ 需求時說「已備足」，不是 0 元、更不是負數", () => {
    const c = mount(false);
    c.profile.age = 40;
    c.params.inflation = 0;
    c.goals = [
      { on: true, name: "換車", type: "購車", present: 800_000, start: 45, end: 45,
        freq: 0, growth: "固定", imp: 3, prepared: 900_000, loanRatio: 0, appreciation: 0 },
    ];
    const it2 = w.normalizeIntent(c);
    it2.mustHave = ["購車規劃"];
    it2.targets = it2.mustHave.slice();
    const first = firstRow(gapHTML(c));
    expect(first).toContain("已備足");
    expect(first).not.toContain("尚未填細節");
    expect(first).not.toMatch(/-[\d,]/);
  });

  it("生活願望三類給的是一生累計（現值），而且列上要註明口徑", () => {
    const c = mount(false);
    c.profile.age = 40;
    c.profile.lifeExp = 50;
    c.travel = [{ on: true, cat: "國內", sub: "認知旅遊", start: 41, end: 45, freq: 2, amount: 30_000, imp: 3 }];
    const it2 = w.normalizeIntent(c);
    it2.mustHave = ["旅遊規劃"];
    it2.targets = it2.mustHave.slice();

    const h = gapHTML(c);
    expect(h).toContain(w.fmt(30_000 * 2 * 5) + " 元");
    expect(h).toContain("一生累計支出（現值）");
  });

  it("企業那三個目標不併入個人缺口", () => {
    const c = mount(false);
    const it2 = w.normalizeIntent(c);
    it2.entities = { company: true };
    it2.mustHave = ["事業退場規劃"];
    it2.targets = it2.mustHave.slice();
    expect(gapHTML(c)).toContain("見企業主診斷");
  });
});

describe("還沒填的目標給引導，不是 0 元", () => {
  it("必達但沒有任何資料 → 顯示「尚未填細節」而不是 0 元", () => {
    const c = mount(false);
    const it2 = w.normalizeIntent(c);
    it2.mustHave = ["婚姻規劃"];
    it2.targets = it2.mustHave.slice();

    const first = firstRow(gapHTML(c));
    expect(first).toContain("尚未填細節");
    expect(first).not.toContain("0 元");
    expect(first).toContain("gotoGoal(");
  });

  it("⚠️ 客戶端不給可點的跳頁連結（那會把客戶丟進教練的輸入畫面）", () => {
    const c = mount(false);
    const it2 = w.normalizeIntent(c);
    it2.mustHave = ["婚姻規劃"];
    it2.targets = it2.mustHave.slice();
    w.app.role = "client";

    const h = gapHTML(c);
    expect(h).toContain("尚未填細節");
    expect(h).not.toContain("gotoGoal(");
    w.app.role = "coach";
  });
});

describe("表格結構", () => {
  it("三欄表頭，而且表尾不再重複一次優先序", () => {
    const c = mount();
    const h = w.adviceModules(c).find((x: { k: string }) => x.k === "gaptable").html() as string;
    expect(h).toContain("<th");
    expect(h).toContain("順位");
    expect(h).toContain("還要準備");
    expect(h).toContain("資產轉負年齡");
    // 「必須達成 · 優先序」那一列拿掉了——整張表本身就是那個順序
    expect(h).not.toContain("必須達成 · 優先序");
  });

  it("報告書那兩處仍然用得到 orderedMustText", () => {
    const c = mount();
    expect(w.orderedMustText(c)).toContain("1. ");
    expect(w.reportPane(c) || "").toContain("必須達成 · 優先序");
  });
});
