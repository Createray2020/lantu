import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 保障中心的版面決策測試（2026/08/24）。
 *
 * 跟 planChartsUI.test.ts 同一個用意：把「首屏＝一張主圖 ＋ ≤3 個數字，其餘收合」釘死，
 * 免得日後有人順手再加一張表就把首屏塞回去。
 * 這一頁一次多了六個區塊（生命資產表、保費報表、$領回報表、主約效益分析…），
 * 沒有這支測試，收合的紀律撐不過兩次改版。
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
  w.app.dataTab = "coverage";
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

const cur = () => w.app.cases[0];
const pane = () => w.document.querySelector("#app").innerHTML as string;

describe("首屏：一張主圖 ＋ 3 個數字，其餘一律收合", () => {
  it("主圖畫得出來，而且排在第一個 <details> 之前", () => {
    const h = pane();
    const iChart = h.indexOf('data-calc="checkupChart"');
    const iFold = h.indexOf("<details");
    expect(iChart).toBeGreaterThan(-1);
    expect(iFold).toBeGreaterThan(iChart);
  });

  it("KPI 恰好三格（多一格就要重新想清楚哪一個更重要）", () => {
    const kpis = w.document.querySelectorAll(".ckkpis .ckkpi");
    expect(kpis.length).toBe(3);
  });

  it("六個重區塊全部是收合的：地圖／生命資產表／保費／領回／主約效益", () => {
    const sums = Array.from(w.document.querySelectorAll("details.ckfold > summary"))
      .map((el) => (el as HTMLElement).textContent || "");
    const joined = sums.join("｜");
    for (const key of ["全家保障地圖", "生命資產表", "保費報表", "$領回報表"]) {
      expect(joined).toContain(key);
    }
    // 收合區預設不能是 open
    w.document.querySelectorAll("details.ckfold").forEach((d: HTMLDetailsElement) => {
      expect(d.hasAttribute("open")).toBe(false);
    });
  });
});

describe("三張五欄比對表", () => {
  it("1 保費 / 2 保障 / 3 $領回 都在，欄名固定", () => {
    const h = pane();
    expect(h).toContain("1 保費");
    expect(h).toContain("2 保障");
    expect(h).toContain("3 $領回");
    expect(h).toContain("現在保單");
    expect(h).toContain("HAVE");
    expect(h).toContain("現在需求");
    expect(h).toContain("NEED");
    expect(h).toContain("READJUST");
  });

  it("狀況用文字 pill，不是只靠顏色（色盲與列印都要讀得出來）", () => {
    const pills = Array.from(w.document.querySelectorAll(".ckpill")).map((el) => (el as HTMLElement).textContent);
    expect(pills.length).toBeGreaterThan(0);
    pills.forEach((t) => expect(["偏低", "偏高", "適中"]).toContain(t));
  });

  it("有偏差時給得出「調整方式」，而且附可調整的契約明細", () => {
    const h = pane();
    // 示範案例的壽險一定是偏低的（需求遠大於已備）
    expect(h).toContain("調整方式（含可調整的契約明細）");
    expect(h).toContain("調整重點");
  });
});

describe("保單卡：加厚後的欄位真的在畫面上", () => {
  it("繳別／保費類型／次被保人／$領回受益人／職業等級都有", () => {
    const h = pane();
    for (const label of ["繳別", "保費類型", "次(從)被保人", "$領回受益人", "被保人職業等級"]) {
      expect(h).toContain(label);
    }
  });

  it("三個子表（給付明細／$領回／解約金）掛在保單卡底下且收合", () => {
    const subs = w.document.querySelectorAll("details.polsub");
    expect(subs.length).toBe((cur().policies || []).length);
    subs.forEach((d: HTMLDetailsElement) => expect(d.hasAttribute("open")).toBe(false));
  });

  it("保險公司是 datalist 建議清單而不是硬下拉——既有的自由文字不能被吃掉", () => {
    const inp = w.document.querySelector('input[list="dl-insurers"]');
    expect(inp).toBeTruthy();
    const dl = w.document.querySelector("#dl-insurers");
    expect(dl).toBeTruthy();
    expect(dl.querySelectorAll("option").length).toBeGreaterThanOrEqual(36);
  });
});

describe("子表能新增、能存、能重算", () => {
  it("加一筆 $領回 之後，領回報表與 3 $領回 的 HAVE 都會動", () => {
    const c = cur();
    const before = w.policyPaybackBetween(c, 0, 200);
    w.addPolSub(0, "paybacks");
    const p = c.policies[0];
    const si = p.paybacks.length - 1;
    w.setPolSub(0, "paybacks", si, "ageFrom", "65", "num");
    w.setPolSub(0, "paybacks", si, "ageTo", "65", "num");
    w.setPolSub(0, "paybacks", si, "amount", "1000000", "num");
    expect(w.policyPaybackBetween(c, 60, 70)).toBe(before + 1_000_000);
    w.render();
    expect(pane()).toContain("領回目錄");
  });

  it("刪得掉，刪完不會留下空殼", () => {
    const c = cur();
    const n0 = c.policies[0].paybacks.length;
    w.delPolSub(0, "paybacks", n0 - 1);
    expect(c.policies[0].paybacks.length).toBe(n0 - 1);
  });
});

describe("需求統計日：動到需求就蓋戳，頁首才講得出「距離今天多久」", () => {
  it("沒動過需求時說「尚未統計」，不是給一個假日期", () => {
    const c = w.migrateCase(w.sampleCase());
    delete c.needsAt;
    expect(w.checkupDatesHTML(c)).toContain("尚未統計");
  });

  it("改一個需求欄位就蓋戳，頁首算得出距今天數", () => {
    const c = cur();
    delete c.needsAt;
    w.set("needs:0", "funeral", "700000", "num");
    expect(c.needsAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.checkupDatesHTML(c)).toContain("距離今天");
  });

  it("超過兩年就轉成警示並提示重跑（insure80 的「每隔 2 年」規則）", () => {
    const c = cur();
    c.needsAt = "2020-01-01";
    const h = w.checkupDatesHTML(c);
    expect(h).toContain("建議重跑需求");
    expect(h).toContain("var(--warn)");
  });

  it("動保單不會蓋需求的戳（那是兩件事）", () => {
    const c = cur();
    c.needsAt = "2020-01-01";
    w.set("policies:0", "premium", "12345", "num");
    expect(c.needsAt).toBe("2020-01-01");
  });
});

describe("⚠️ 折扣欄位不能存成字串 'false'", () => {
  it("ensurePolicy 一律正規化成 '有'/'無'", () => {
    expect(w.ensurePolicy({ discount: true }).discount).toBe("有");
    expect(w.ensurePolicy({ discount: false }).discount).toBe("無");
    expect(w.ensurePolicy({}).discount).toBe("無");
    expect(w.ensurePolicy({ discount: "有" }).discount).toBe("有");
  });
});

/**
 * 2026/08/24 Ray 回報「保單健檢報告字體過大、內容整個跑出破圖」。
 *
 * 真因不是字級設定，是 SVG 被容器等比拉大：主圖的 viewBox 寬 900，
 * 但 CSS 給 width:100%，在 1440 螢幕上容器有 1090px → 整張圖（含寫死的 12px 標籤）
 * 被放大 1.2～1.8 倍，圖上的字比周圍 UI 大一半，版面也跟著撐開。
 *
 * 這組測試把「只准縮小、不准放大」釘住：CSS 的 max-width 必須等於 viewBox 的寬，
 * 而且兩個值改一邊就要改另一邊。
 */
describe("主圖只准縮小、不准放大（字被等比拉大的防線）", () => {
  const CSS_MAX = 900; // .ckchart svg{max-width:…}

  it("CSS 有把主圖的 max-width 鎖住，而且與 viewBox 的寬相同", () => {
    const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    expect(html).toContain(`.ckchart svg{display:block;min-width:620px;max-width:${CSS_MAX}px;margin:0 auto}`);

    const svg = w.document.querySelector(".ckchart svg");
    expect(svg).toBeTruthy();
    const vbW = Number(svg.getAttribute("viewBox").split(/\s+/)[2]);
    expect(vbW).toBe(CSS_MAX);
  });

  it("圖上的字級落在 10～13（與周圍 UI 同一個量級，不能靠放大來讀）", () => {
    const svg = w.document.querySelector(".ckchart svg");
    const sizes = [...svg.querySelectorAll("text")].map((t: Element) => Number(t.getAttribute("font-size")));
    expect(sizes.length).toBeGreaterThan(0);
    sizes.forEach((s: number) => {
      expect(s).toBeGreaterThanOrEqual(10);
      expect(s).toBeLessThanOrEqual(13);
    });
  });

  it("五欄表與契約明細都包在可橫向捲動的殼裡（窄螢幕不擠成三行）", () => {
    const h = pane();
    expect(h).toContain('<div class="cktblwrap"><table class="rtable cktbl">');
    const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    expect(html).toContain(".cktblwrap{overflow-x:auto;max-width:900px;margin:0 auto}");
    expect(html).toContain('<div class="ckconwrap"><table class="rtable ckcon">');
  });
});
