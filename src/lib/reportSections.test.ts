import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 客戶報告書：每一個分類的「結果」都要在裡面（2026/08/24 Ray 要求）。
 *
 * 規則是 Ray 訂的：有「輸入」的面向不必給客戶看，但**輸入完會產生結果的，全部要放出來**。
 * 在這之前，教練端算出來的東西有一半以上客戶看不到——保單檢查五欄表、財務三表、
 * 置產缺口、退休三段式金流、生活願望、傳承規劃（legacyNeed 早就在算但報告書一行沒用）、
 * 職涯與婚姻、信用與海外、真實追蹤、人生護照五面向。
 *
 * 這組測試守兩件事：
 *   ① 每一章「有資料就要出現」，不能又被某次改版擠掉
 *   ② 目錄與實際章節永遠對得起來（編號自動產生，不是手抄）
 *   ③ 首屏紀律：明細收在 <details> 裡，不是整片攤成表格（見 [[feedback_圖表優先]]）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

// 把示範案補成「每一章都有資料」的樣子。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rich(): any {
  const c = w.migrateCase(w.sampleCase());
  c.tracking = [{ year: 2024, age: 40, net: 9_500_000 }, { year: 2025, age: 41, net: 9_950_000 }];
  c.legacy = { on: true, heirs: 2, perHeirCash: 3_000_000, perHeirNote: "長子另留自住房一間", feedEstate: true };
  c.career = { plan: "轉職", switchAge: 48, switchFund: 600_000, startupType: "", startupBudget: 0, importance: 3 };
  c.marriage = { plan: "否" };
  c.credit = { cards: 4, payFull: "是", firstCardOver1yr: "是", installment: "有", badRecord5yr: "否", recentApply: "無", score: 720 };
  c.overseas = { hasAssets: "是", identity: "否", purpose: "子女留學", assetTypes: "美股帳戶" };
  c.travel = [{ on: true, cat: "國外", sub: "消費旅遊", start: 40, end: 65, freq: 1, amount: 150_000, minAmount: 80_000, imp: 3 }];
  c.hobby = [{ on: true, sub: "體能類", start: 40, end: 75, freq: 12, amount: 3_000, minAmount: 1_500, imp: 3 }];
  c.luxury = [{ on: true, sub: "鐘錶", start: 50, end: 50, freq: 1, amount: 400_000, minAmount: 200_000, imp: 2 }];
  c.education = [{ child: "王小寶", stage: "大學", schoolType: "私立", annual: 180_000, years: 4, startIn: 12 }];
  c.passport = { inputs: {}, result: { house: { price: 12_000_000 }, car: { price: 800_000 }, retire: { presentMonthly: 42_000, retireAge: 65 }, support: { perChildCost: 5_200_000, raiseToAge: 22 }, travel: { fund: 900_000 }, totalMonthlyWan: 5 } };
  if (c.policies?.[0]) c.policies[0].paybacks = [{ type: "$生存", receiver: "王大明", ageFrom: 60, ageTo: 80, freq: 1, amount: 60_000, note: "" }];
  return c;
}
function dom(html: string) {
  const d = w.document.createElement("div");
  d.innerHTML = html;
  return d;
}
const titles = (html: string) => [...dom(html).querySelectorAll("h2")].map((e: Element) => e.textContent as string);

describe("章節：每一個分類的結果都在報告書裡", () => {
  const WANT = [
    "財務健康總覽", "收支與資產結構", "現況財務指標", "財務三表與資產布局", "財務目標歷程",
    "退休與教育需求", "風險保障缺口", "保單檢查報告", "現金流投影與機率", "稅賦分析",
    "傳承規劃", "投資風險屬性與建議配置", "其他規劃面向", "規劃前 / 後對照",
    "真實追蹤與人生護照", "規劃執行建議", "執行行動清單", "動態調整（PDCA）", "注意事項",
  ];
  it("資料齊全時，十九章一個都不少、順序固定", () => {
    const got = titles(w.reportHTML(rich())).map((t) => t.replace(/^[一二三四五六七八九十]+、/, ""));
    expect(got).toEqual(WANT);
  });

  it("四組結果都印得出實際數字（不是只有標題）", () => {
    const h = w.reportHTML(rich()) as string;
    // 保障類
    expect(h).toContain("現在保單 HAVE");
    expect(h).toContain("現在需求 NEED");
    expect(h).toContain("全家保障地圖");
    expect(h).toContain("保費結構");
    expect(h).toContain("保單可領回");
    // 財務結構類
    expect(h).toContain("資產布局（核心／衛星／短期保留／生活用）");
    expect(h).toContain("緊急預備金");
    expect(h).toContain("置產缺口");
    expect(h).toContain("退休前後的三段式金流");
    expect(h).toContain("缺口帳");
    // 人生面向類
    expect(h).toContain("生活願望（旅遊・休閒・奢侈品）");
    expect(h).toContain("傳承總需求");
    expect(h).toContain("職涯規劃");
    expect(h).toContain("信用現況");
    expect(h).toContain("海外資產與身份");
    expect(h).toContain("子女教育金逐階段");
    // 追蹤類
    expect(h).toContain("最近一次實際淨值");
    expect(h).toContain("人生護照 · 五面向能力分析");
  });

  it("傳承規劃真的印出 legacyNeed 算出來的金額（以前算了卻從不呈現）", () => {
    const c = rich();
    const h = w.reportHTML(c) as string;
    expect(w.legacyNeed(c)).toBe(6_000_000);
    expect(h).toContain(w.fmt(6_000_000));
    expect(h).toContain("長子另留自住房一間");
  });

  it("客戶選擇本次不處理傳承時，說清楚是「不處理」而不是靜靜消失", () => {
    const c = rich();
    c.legacy.on = false;
    expect(w.reportHTML(c)).toContain("本次規劃不處理傳承");
  });
});

describe("目錄與章節永遠對得起來", () => {
  it("目錄的每一列＝實際章名，順序與數量都一致", () => {
    const d = dom(w.reportHTML(rich()));
    const toc = [...d.querySelectorAll("ol")][0];
    const items = [...toc.children].map((x: Element) => x.textContent);
    const h2 = [...d.querySelectorAll("h2")].map((x: Element) => (x.textContent as string).replace(/^[一二三四五六七八九十]+、/, ""));
    expect(items).toEqual(h2);
  });

  it("⚠️ 有一章因為沒資料被略過時，目錄跟著少一列、後面的編號自動遞補", () => {
    const c = w.migrateCase(w.newCase()); // 全新客戶：沒有追蹤、沒有人生護照
    const d = dom(w.reportHTML(c));
    const h2 = [...d.querySelectorAll("h2")].map((x: Element) => x.textContent as string);
    const items = [...[...d.querySelectorAll("ol")][0].children].map((x: Element) => x.textContent);
    expect(h2.some((t) => t.includes("真實追蹤"))).toBe(false);
    expect(items.some((t) => String(t).includes("真實追蹤"))).toBe(false);
    expect(items.length).toBe(h2.length);
    // 編號沒有跳號
    expect(h2[h2.length - 1]).toBe("十八、注意事項");
  });

  it("章名只在一個地方寫（編號是產生的，不是手抄的）", () => {
    expect(HTML).toContain("function rNumberSections(body)");
    expect(HTML).toContain("function rTOC(titles)");
  });
});

describe("首屏紀律：一張圖 ＋ ≤3 個數字，明細收合", () => {
  it("每一組 KPI 最多三格", () => {
    const d = dom(w.reportHTML(rich()));
    // rBig() 產的那一排：外層 flex 容器，子元素就是格子
    const rows = [...d.querySelectorAll("div")].filter((el: Element) =>
      (el as HTMLElement).getAttribute("style")?.includes("display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 12px"));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r: Element) => expect(r.children.length).toBeLessThanOrEqual(3));
  });

  it("逐列明細收在 <details> 裡，不是整片攤開", () => {
    const d = dom(w.reportHTML(rich()));
    const sums = [...d.querySelectorAll("details > summary")].map((s: Element) => s.textContent);
    expect(sums).toContain("財務三表明細（資產負債表・現金流量表・資產布局逐層）");
    expect(sums).toContain("退休前後逐年金流明細");
    expect(sums).toContain("生活願望逐項明細");
    expect(sums.length).toBeGreaterThanOrEqual(5);
  });

  it("列印時會先把收合區打開（交出去的 PDF 不能少一半內容）", () => {
    expect(HTML).toContain('onclick="printReport()"');
    expect(HTML).toContain("function printReport(){");
    expect(HTML).toContain("ds.forEach(function(d){d.open=true;});");
  });
});

describe("不會炸：資料殘缺的客戶", () => {
  it.each([
    ["全新客戶", () => w.migrateCase(w.newCase())],
    ["只有姓名", () => w.migrateCase({ profile: { name: "空白" } })],
    ["沒有 members / needs / policies", () => { const c = w.migrateCase(w.sampleCase()); c.members = []; c.needs = []; c.policies = []; return c; }],
    ["沒有 assets / liabilities", () => { const c = w.migrateCase(w.sampleCase()); c.assets = []; c.liabilities = []; return c; }],
  ])("%s 也產得出報告書", (_label, make) => {
    const h = w.reportHTML(make());
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThan(1000);
    expect(h).toContain("財務規劃報告書");
  });

  it("完全沒有保單、需求與收入時，保單檢查那一章給的是說明而不是一片空白", () => {
    const c = w.migrateCase(w.newCase()); // 全新客戶：沒有收入就沒有保費比對基準
    expect(w.reportHTML(c)).toContain("資料補齊後自動出現");
  });

  it("有收入但還沒登錄保單時，保費那一段仍然比對得出來（不要整章消失）", () => {
    const c = w.migrateCase(w.sampleCase());
    c.needs = []; c.policies = []; c.coverages = [];
    const h = w.reportHTML(c) as string;
    expect(h).toContain("保障型保費");
    expect(h).toContain("尚未建立保障需求。");
  });
});

describe("量綱：不同單位的數字不畫在同一個刻度上", () => {
  it("人生護照的「每月可支應」與一次性金額分開呈現", () => {
    const h = w.reportHTML(rich()) as string;
    expect(h).toContain("退休後每月可支應");
    // 42,000（月）不能跟 12,000,000（總額）在同一組長條裡，否則柱子等於消失
    const seg = h.slice(h.indexOf("人生護照 · 五面向能力分析"));
    const bars = seg.slice(0, 4000);
    expect(bars).not.toContain("每月可支應 42,000 元（現值）");
  });
});
