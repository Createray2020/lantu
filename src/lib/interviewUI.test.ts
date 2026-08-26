import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 訪談模式：順序、檢核清單、以及照問卷補進來的欄位。
 *
 * 背景：教練原本開著 SurveyCake 問卷、在客戶面前照著問（實測 82 分鐘），
 * 問完再把同一批資料謄進系統——雙重工。這一輪把問卷的順序與缺的欄位搬進系統，
 * 目標是讓他只開一個。規格見 docs/客戶入場問卷_規格拆解.md。
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
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
});

const fresh = () => {
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  return w.app.cases[0];
};
const go = (tab: string) => { w.app.activeTab = "data"; w.app.dataTab = tab; w.render(); };

describe("分頁順序＝問卷順序", () => {
  it("②未來的需求 排在 ③現在的狀況 之前（先講夢想，最後才問錢）", () => {
    go("intent");
    const labels = [...w.document.querySelectorAll("#app .dgrow .dglab")].map((e: Element) => e.textContent);
    const future = labels.findIndex((t: string) => t.includes("未來的需求"));
    const now = labels.findIndex((t: string) => t.includes("現在的狀況"));
    expect(future).toBeGreaterThan(-1);
    expect(now).toBeGreaterThan(-1);
    expect(future, "先攤資產負債，客戶一開始就進防衛狀態，後面的願景就問不深了").toBeLessThan(now);
  });

  it("①群第一顆是「意圖 / 生涯」（問卷第一段就是問這次想解決什麼）", () => {
    go("intent");
    const first = w.document.querySelector("#app .dgrow .dtab");
    expect(first.textContent.trim()).toBe("意圖 / 生涯");
  });

  it("③群內：收支資債 → 信用/海外 → 保障中心 → 稅賦", () => {
    go("finance");
    const rows = [...w.document.querySelectorAll("#app .dgrow")];
    const nowRow = rows.find((r) => (r.querySelector(".dglab")?.textContent ?? "").includes("現在的狀況"))!;
    const tabs = [...nowRow.querySelectorAll(".dtab")].map((b: Element) => b.textContent!.trim());
    expect(tabs).toEqual(["收支資債", "信用/海外", "保障中心", "稅賦"]);
  });
});

describe("收入的彈性上限（問卷：再拚一年月收入可以到多少）", () => {
  it("沒填 → 走全域上限 CAP_INCOME_UP", () => {
    const c = fresh();
    expect(w.leverRange(c, "income").hi).toBe(w.CAP_INCOME_UP);
  });

  it("自述上限高於現況 → 以客戶自己說的為準（可以高過全域上限）", () => {
    const c = fresh();
    c.profile.incomeCeiling = 250000;                 // 300 萬/年 vs 現況工作年收 190 萬
    const hi = w.leverRange(c, "income").hi;
    expect(hi).toBeGreaterThan(w.CAP_INCOME_UP);
    expect(Math.round(hi * 10) / 10).toBe(57.9);
  });

  it("⚠️ 自述上限低於現況 → 不採用，退回全域上限（不可以把槓桿悄悄鎖死）", () => {
    const c = fresh();
    c.profile.incomeCeiling = 150000;                 // 180 萬/年，低於現況 190 萬
    expect(
      w.leverRange(c, "income").hi,
      "夾到 0 等於讓求解器少一根槓桿，而畫面上看不出來——教練只會覺得算不出方案",
    ).toBe(w.CAP_INCOME_UP);
  });

  it("沒有工作類別的收入可當基準時，一律退回全域上限", () => {
    const c = fresh();
    c.incomes = [];
    c.profile.incomeCeiling = 250000;
    expect(w.leverRange(c, "income").hi).toBe(w.CAP_INCOME_UP);
  });

  it("畫面會把「低於現況」當成要回頭確認的事，而不是照著算", () => {
    const c = fresh();
    c.profile.incomeCeiling = 150000;
    go("incomes");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/低於目前工作年收入/);
    expect(html).toMatch(/暫不採用/);
  });
});

describe("安全感預備金（問卷：身上有多少錢才有安全感）", () => {
  it("填了就跟系統算的並列，差距大會標出來", () => {
    const c = fresh();
    c.params.safetyCash = 3_000_000;                  // 遠高於「月支出 × 6」
    go("family");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/客戶自述的安全感門檻/);
    expect(html).toMatch(/心裡的門檻比系統算的高/);
  });

  it("沒填時不會硬湊一個差額出來", () => {
    const c = fresh();
    c.params.safetyCash = 0;
    go("family");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/系統算的/);
    expect(html).not.toMatch(/心裡的門檻比系統算的/);
  });
});

describe("子女的其他準備基金", () => {
  it("加到 goals 而不是 education（一次性的錢混進逐年會被乘開）", () => {
    const c = fresh();
    const eduBefore = (c.education || []).length;
    w.addChildFund("王小寶", "結婚基金");
    const c2 = w.activeCase();
    expect((c2.education || []).length, "不可以混進教育金").toBe(eduBefore);
    expect((c2.goals || []).slice(-1)[0].name).toBe("王小寶的結婚基金");
  });

  it("⚠️ 給付年齡換算成「本人幾歲」，不是直接填子女年齡", () => {
    fresh();
    w.addChildFund("王小寶", "結婚基金");             // 子女 6 歲、預設 30 歲給、本人 40 歲
    const g = w.activeCase().goals.slice(-1)[0];
    expect(g.start, "goals 的起訖歲一律是本人的時間軸，填子女年齡會整個錯位").toBe(40 + (30 - 6));
    expect(g.end).toBe(g.start);
    expect(g.freq, "一次性給出去，不是逐年").toBe(0);
  });

  it("標記得出是哪個子女的，子女教育頁才認得回來", () => {
    fresh();
    w.addChildFund("王小寶", "買房基金");
    expect(w.activeCase().goals.slice(-1)[0].childFundFor).toBe("王小寶");
  });
});

describe("訪談檢核清單", () => {
  it("20 段，順序就是問卷的順序", () => {
    expect(w.INTERVIEW_STEPS.length).toBe(20);
    expect(w.INTERVIEW_STEPS.slice(2, 13).map((s: { name: string }) => s.name)).toEqual([
      "職涯規劃", "購屋規劃", "購車規劃", "婚姻規劃", "子女教養", "孝親規劃",
      "旅遊規劃", "休閒興趣", "奢侈品", "退休規劃", "傳承規劃",
    ]);
  });

  it("自動偵測「這一段有沒有東西」，教練不用自己維護", () => {
    const c = fresh();
    const pr = w.ivProgress(c);
    expect(pr.total).toBe(20);
    expect(pr.done, "示範客戶大部分段落是有資料的").toBeGreaterThan(10);
    expect(w.ivDone(c, w.INTERVIEW_STEPS.find((s: { k: string }) => s.k === "income"))).toBe("auto");
  });

  it("偵測不到的可以手動勾（談過但決定不做）", () => {
    const c = fresh();
    const step = w.INTERVIEW_STEPS.find((s: { k: string }) => s.k === "career");
    expect(w.ivDone(c, step)).toBe("");
    w.toggleIvStep("career");
    expect(w.ivDone(w.activeCase(), step)).toBe("manual");
  });

  it("每一段都指得到一個真的分頁", () => {
    const known = new Set([
      ...w.BASE_TABS.map((b: string[]) => b[0]),
      "intent", "risk", "retire", "education", "goals", "lifestyle", "plan", "tracking",
    ]);
    const bad = w.INTERVIEW_STEPS.filter((s: { tab: string }) => !known.has(s.tab)).map((s: { k: string }) => s.k);
    expect(bad, `這些段落的「前往」會跳到不存在的分頁：${bad.join(", ")}`).toEqual([]);
  });

  it("清單畫得出來，而且每一段都有提示（提示才是不會漏問的關鍵）", () => {
    fresh();
    go("intent");
    expect(w.document.querySelectorAll("#app .ivrow").length).toBe(20);
    const hints = [...w.document.querySelectorAll("#app .ivhint")].map((e: Element) => e.textContent!.trim());
    expect(hints.filter((t: string) => t.length > 4).length).toBe(20);
  });

  it("休閒與奢侈品的分類直接列在提示裡（不塞進下拉把層級打平）", () => {
    fresh();
    go("intent");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/體能／收藏／思考/);
    expect(html).toMatch(/豪宅／珠寶/);
  });
});

describe("健保三欄", () => {
  it("成員卡有健保投保類別／月投保薪資／負擔眷屬人數", () => {
    fresh();
    go("family");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/健保投保類別/);
    expect(html).toMatch(/健保月投保薪資/);
    expect(html).toMatch(/負擔眷屬人數/);
  });
});

describe("資產的「可變動」要能寫理由", () => {
  it("進階欄有可變動的說明欄位", () => {
    const c = fresh();
    w.app.finOpen = { assets: { 0: true }, liabilities: {} };
    go("finance");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/可變動的說明/);
    expect(c.assets.length).toBeGreaterThan(0);
  });
});
