import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as EngineExports from "./engine";

/**
 * 未來入帳（2026/09/27 Ray）：資產到期回收 ＋ 預期入帳。
 *
 *   改版前：固定資產永遠鎖在投影的 fixedAssets——借出款三年後收回、債券到期還本這種錢，
 *   既不會在那一年變成現金、也不會進主池再投資；「到期年齡」只做現值快照。
 *
 *   ① 資產列 matureAge ＋ matureAmt（留空＝現值）＋ matureMode 一次／分期 ＋ matureYears：
 *      到期那年（分期：那幾年平均）回收金額進主池；固定資產按比例減少；被動流按剩餘本金比例遞減。
 *   ② futureInflows[]：還不是資產的錢；入帳＝金額×把握度%，只折投影不動淨值；可指定 sellAid。
 *   ⚠️ 兩邊都沒填＝改版前一模一樣（既有客戶一位不動）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

type Row = Record<string, number>;
const at = (rows: Row[], age: number) => rows.find((r) => r.age === age) as Row;

function base() {
  const c = E.sampleCase();
  c.goals = []; c.futureInflows = []; c.actions = [];
  c.assets = [
    { name: "活存", owner: "王大明", mainCat: "自用資產", type: "活期存款", cls: "流動", currency: "台幣", fxRate: 1, value: 2_000_000, income: "", ret: "", aid: "cash" },
    { name: "借給朋友", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 3_000_000, income: 90_000, aid: "loan" },
  ];
  return c;
}

describe("assetMaturities：哪些資產、什麼時候、多少", () => {
  it("沒填到期年齡＝沒有事件；已過到期年齡的也不算（本金已在主池）", () => {
    expect(E.assetMaturities(base()).length).toBe(0);
    const c = base(); c.assets[1].matureAge = 40;   // 現齡 40
    expect(E.assetMaturities(c).length).toBe(0);
    c.assets[1].matureAge = 39;
    expect(E.assetMaturities(c).length).toBe(0);
  });
  it("一次：回收金額留空＝現值；填了就用填的（原幣×匯率）；0 也視為留空", () => {
    const c = base(); c.assets[1].matureAge = 43;
    let M = E.assetMaturities(c);
    expect(M.length).toBe(1);
    expect(M[0]).toMatchObject({ aid: "loan", age: 43, years: 1, total: 3_000_000, perYear: 3_000_000, liquid: false, kind: "mature" });
    c.assets[1].matureAmt = 3_300_000; c.assets[1].fxRate = 2;
    M = E.assetMaturities(c);
    expect(M[0].total).toBe(6_600_000);
    c.assets[1].matureAmt = 0;
    expect(E.assetMaturities(c)[0].total).toBe(6_000_000);
  });
  it("分期：分 3 年 → 每年三分之一；年數沒填當 1", () => {
    const c = base(); c.assets[1].matureAge = 43; c.assets[1].matureMode = "分期"; c.assets[1].matureYears = 3;
    const M = E.assetMaturities(c);
    expect(M[0].years).toBe(3);
    expect(M[0].perYear).toBeCloseTo(1_000_000, 6);
    expect(E.matureRatio(M[0], 42)).toBe(0);
    expect(E.matureRatio(M[0], 43)).toBeCloseTo(1 / 3, 9);
    expect(E.matureRatio(M[0], 44)).toBeCloseTo(2 / 3, 9);
    expect(E.matureRatio(M[0], 45)).toBe(1);
    expect(E.matureRatio(M[0], 60)).toBe(1);
    c.assets[1].matureYears = "";
    expect(E.assetMaturities(c)[0].years).toBe(1);
  });
  it("流動資產填到期年齡：本金不進主池（本來就在），只有被動流停算", () => {
    const c = base(); c.assets[0].matureAge = 43; c.assets[0].income = 20_000;
    const M = E.assetMaturities(c);
    expect(M.length).toBe(1);
    expect(M[0].liquid).toBe(true);
    expect(M[0].total).toBe(0);
    expect(E.yearInflow(M, 43)).toBe(0);
    expect(E.assetPassiveAt(c, M, 42)).toBeCloseTo(20_000 + 90_000, 6);
    expect(E.assetPassiveAt(c, M, 43)).toBeCloseTo(90_000, 6);
  });
  it("先被賣掉（換屋／預期入帳結清）的資產不再到期", () => {
    const c = base(); c.assets[1].matureAge = 45;
    expect(E.assetMaturities(c, [{ aid: "loan", age: 44 }]).length).toBe(0);
    expect(E.assetMaturities(c, [{ aid: "loan", age: 46 }]).length).toBe(1);
  });
});

describe("投影：到期那年錢進主池、固定資產同步減少、被動流停", () => {
  it("一次：到期前一年兩邊一模一樣；到期年結餘多出本金、固定資產少掉本金、淨值不變（回收＝現值）", () => {
    const keep = base(); keep.assets[1].income = 0;
    const mat = base(); mat.assets[1].income = 0; mat.assets[1].matureAge = 43;
    const a = E.projection(mat).rows, b = E.projection(keep).rows;
    expect(at(a, 42).bal).toBeCloseTo(at(b, 42).bal, 6);
    expect(at(a, 42).fixed).toBeCloseTo(at(b, 42).fixed, 6);
    expect(at(a, 43).bal - at(b, 43).bal).toBeCloseTo(3_000_000, 6);
    expect(at(a, 43).inflow).toBeCloseTo(3_000_000, 6);
    expect(at(b, 43).inflow).toBe(0);
    expect(at(b, 43).fixed - at(a, 43).fixed).toBeCloseTo(3_000_000, 6);
    expect(at(a, 43).net).toBeCloseTo(at(b, 43).net, 4);
    // 回來之後跟著主池滾：隔年淨值多出本金×報酬率
    const ret = E.effReturn(mat) / 100;
    expect(at(a, 44).net - at(b, 44).net).toBeCloseTo(3_000_000 * ret, 2);
    expect(at(a, 60).fixed).toBeCloseTo(at(b, 60).fixed - 3_000_000, 6);
  });
  it("回收金額 ≠ 現值：那一年淨值差＝回收金額 − 現值", () => {
    const keep = base(); keep.assets[1].income = 0;
    const mat = base(); mat.assets[1].income = 0; mat.assets[1].matureAge = 43; mat.assets[1].matureAmt = 2_400_000;
    const a = E.projection(mat).rows, b = E.projection(keep).rows;
    expect(at(a, 43).inflow).toBeCloseTo(2_400_000, 6);
    expect(at(a, 43).net - at(b, 43).net).toBeCloseTo(-600_000, 4);
  });
  it("被動流：一次→到期年起停算；分期→按剩餘本金比例遞減；主池每年進三分之一", () => {
    const one = base(); one.assets[1].matureAge = 43;
    const keep = base();
    const a = E.projection(one).rows, b = E.projection(keep).rows;
    expect(at(a, 42).fin).toBeCloseTo(at(b, 42).fin, 6);
    expect(at(b, 43).fin - at(a, 43).fin).toBeCloseTo(90_000, 6);
    expect(at(b, 50).fin - at(a, 50).fin).toBeCloseTo(90_000, 6);

    const inst = base(); inst.assets[1].matureAge = 43; inst.assets[1].matureMode = "分期"; inst.assets[1].matureYears = 3;
    const r = E.projection(inst).rows;
    expect(at(r, 43).inflow).toBeCloseTo(1_000_000, 6);
    expect(at(r, 44).inflow).toBeCloseTo(1_000_000, 6);
    expect(at(r, 45).inflow).toBeCloseTo(1_000_000, 6);
    expect(at(r, 46).inflow).toBe(0);
    expect(at(b, 43).fin - at(r, 43).fin).toBeCloseTo(90_000 / 3, 6);
    expect(at(b, 44).fin - at(r, 44).fin).toBeCloseTo(90_000 * 2 / 3, 6);
    expect(at(b, 45).fin - at(r, 45).fin).toBeCloseTo(90_000, 6);
    expect(at(b, 43).fixed - at(r, 43).fixed).toBeCloseTo(1_000_000, 4);
    expect(at(b, 44).fixed - at(r, 44).fixed).toBeCloseTo(2_000_000, 4);
    expect(at(b, 45).fixed - at(r, 45).fixed).toBeCloseTo(3_000_000, 4);
    const ev = E.projection(inst).events.filter((e: { kind: string }) => e.kind === "inflow");
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ age: 43, span: 45, ok: true, amount: 3_000_000 });
  });
  it("現值指標維持快照：到期年齡還沒到，流動資產／被動現金流一位不動", () => {
    const keep = base(), mat = base(); mat.assets[1].matureAge = 43;
    expect(E.metrics(mat).liquid).toBeCloseTo(E.metrics(keep).liquid, 6);
    expect(E.assetPassive(mat)).toBeCloseTo(E.assetPassive(keep), 6);
  });
});

describe("expectedInflows：預期入帳", () => {
  it("把握度折算；年齡早於現齡、未納入、金額 0 的不算；分期平均", () => {
    const c = base();
    c.futureInflows = [
      { on: true, name: "公司出場", source: "事業出場", age: 45, amount: 5_000_000, prob: 60 },
      { on: true, name: "太早", age: 30, amount: 1_000_000 },
      { on: false, name: "沒納入", age: 50, amount: 1_000_000 },
      { on: true, name: "空的", age: 50, amount: 0 },
      { on: true, name: "分紅分三年", source: "盈餘一次分配", age: 48, amount: 3_000_000, prob: "", mode: "分期", years: 3 },
    ];
    const F = E.expectedInflows(c);
    expect(F.map((x: { name: string }) => x.name)).toEqual(["公司出場", "分紅分三年"]);
    expect(F[0]).toMatchObject({ age: 45, years: 1, total: 3_000_000, gross: 5_000_000, prob: 60, kind: "expect" });
    expect(F[1]).toMatchObject({ age: 48, years: 3, total: 3_000_000, prob: 100 });
    expect(F[1].perYear).toBeCloseTo(1_000_000, 6);
  });
  it("投影：那一年進主池；不動現在的淨值與資產（把握度只折投影）", () => {
    const keep = base();
    const c = base(); c.futureInflows = [{ on: true, name: "公司出場", source: "事業出場", age: 45, amount: 5_000_000, prob: 60 }];
    const a = E.projection(c).rows, b = E.projection(keep).rows;
    expect(at(a, 44).bal).toBeCloseTo(at(b, 44).bal, 6);
    expect(at(a, 45).bal - at(b, 45).bal).toBeCloseTo(3_000_000, 6);
    expect(at(a, 45).inflow).toBeCloseTo(3_000_000, 6);
    expect(at(a, 45).net - at(b, 45).net).toBeCloseTo(3_000_000, 4);
    expect(E.metrics(c).net).toBeCloseTo(E.metrics(keep).net, 6);
    expect(E.metrics(c).proj.events.some((e: { kind: string; name: string }) => e.kind === "inflow" && e.name === "公司出場")).toBe(true);
  });
  it("sellAid：那一年起該資產離開固定資產；已被換屋指定的資產不再重賣", () => {
    const c = base();
    c.assets[1].type = "未上市股權/事業投資";
    c.futureInflows = [{ on: true, name: "公司出場", age: 45, amount: 5_000_000, prob: 100, sellAid: "loan" }];
    const keep = base();
    const a = E.projection(c).rows, b = E.projection(keep).rows;
    expect(at(a, 44).fixed).toBeCloseTo(at(b, 44).fixed, 6);
    expect(at(b, 45).fixed - at(a, 45).fixed).toBeCloseTo(3_000_000, 6);
    expect(at(a, 45).net - at(b, 45).net).toBeCloseTo(5_000_000 - 3_000_000, 4);
    // 同一筆資產先被換屋指定：預期入帳的 sellAid 作廢（錢照進、資產不重扣）
    const F = E.expectedInflows(c, [{ aid: "loan", age: 44 }]);
    expect(F[0].aid).toBe("");
    // 賣掉的資產也不再到期
    c.assets[1].matureAge = 50;
    expect(E.futureInflowEvents(c).map((x: { kind: string }) => x.kind)).toEqual(["expect"]);
  });
  it("futureInflowEvents：到期回收＋預期入帳合併、依年排序", () => {
    const c = base(); c.assets[1].matureAge = 47;
    c.futureInflows = [{ on: true, name: "公司出場", age: 45, amount: 5_000_000, prob: 100 }];
    const ev = E.futureInflowEvents(c);
    expect(ev.map((x: { kind: string; age: number }) => [x.kind, x.age])).toEqual([["expect", 45], ["mature", 47]]);
  });
});

describe("蒙地卡羅與投影講同一件事", () => {
  it("有入帳的個案，MC 中位數在入帳年之後高於沒入帳的", () => {
    const keep = base(); keep.assets[1].income = 0;
    const c = base(); c.assets[1].income = 0; c.assets[1].matureAge = 43;
    c.futureInflows = [{ on: true, name: "出場", age: 45, amount: 5_000_000, prob: 100 }];
    keep.id = c.id = "mc-same-seed";
    const a = E.monteCarlo(c, 200), b = E.monteCarlo(keep, 200);
    expect(a.bands[2][1]).toBeCloseTo(b.bands[2][1], 0);          // 42 歲：一樣
    expect(a.bands[3][1] - b.bands[3][1]).toBeGreaterThan(2_900_000); // 43 歲：本金進來
    expect(a.bands[6][1] - b.bands[6][1]).toBeGreaterThan(7_900_000); // 45 歲之後：兩筆都進來且滾過
  });
});

describe("html ↔ engine.ts 對拍：同一份個案兩邊逐年一模一樣", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => {
    const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = () => {};
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  });
  it("到期回收（分期）＋預期入帳（把握度、sellAid）", () => {
    const mk = () => {
      const c = base(); c.policies = [];   // migrateCase 會從保單長出「保單現金價值」資產列，兩邊要同一份
      c.assets[1].matureAge = 43; c.assets[1].matureMode = "分期"; c.assets[1].matureYears = 3; c.assets[1].matureAmt = 3_300_000;
      c.assets.push({ name: "股權", owner: "王大明", mainCat: "可投資資產", type: "未上市股權/事業投資", cls: "固定", currency: "台幣", fxRate: 1, value: 4_000_000, income: 0, aid: "eq" });
      c.futureInflows = [{ on: true, name: "公司出場", source: "事業出場", age: 47, amount: 9_000_000, prob: 70, sellAid: "eq" }];
      return c;
    };
    const a = E.projection(mk()).rows, b = w.projection(w.migrateCase(mk())).rows;
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      for (const k of ["bal", "fin", "fixed", "net", "total", "inflow"]) expect(b[i][k], `${k} @ ${a[i].age}`).toBeCloseTo(a[i][k], 4);
    }
    expect(w.futureInflowEvents(mk()).length).toBe(2);
  });
});

describe("UI：資產列的到期欄位、預期入帳表、分析頁與報告書", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  const $ = (sel: string) => w.document.querySelector(sel);
  const $$ = (sel: string) => [...w.document.querySelectorAll(sel)] as HTMLElement[];
  beforeAll(async () => {
    const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = () => {};
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
    w.app.role = "coach";
    const c = w.migrateCase(w.sampleCase());
    c.futureInflows = [];
    w.app.cases = [c]; w.app.activeId = c.id;
    w.localStorage.clear();
  });
  it("資產列：填了到期年齡才長出回收金額／方式；分期才問幾年；列上的標記講清楚何時收多少", () => {
    const c = w.activeCase();
    c.assets = [{ name: "借給朋友", owner: "王大明", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 3_000_000, income: 90_000, aid: "loan" }];
    w.app.activeTab = "data"; w.app.dataTab = "finance"; w.render();
    w.finToggle("assets", 0);   // 打開進階欄
    let html = $("#app").innerHTML as string;
    expect(html).not.toContain("到期回收金額");
    c.assets[0].matureAge = 43; w.render();
    html = $("#app").innerHTML;
    expect(html).toContain("到期回收金額");
    expect(html).toContain("回收方式");
    expect(html).not.toContain("分幾年收回");
    expect(html).toContain("43 歲到期收回 3,000,000");
    c.assets[0].matureMode = "分期"; c.assets[0].matureYears = 3; w.render();
    html = $("#app").innerHTML;
    expect(html).toContain("分幾年收回");
    expect(html).toContain("43 歲起分 3 年收回");
  });
  it("收支資債：預期入帳住在折疊卡裡（預設收合）；新增一列帶預設值；結清資產下拉只列該收的那幾類", () => {
    const c = w.activeCase();
    c.assets.push({ name: "股權", owner: "王大明", mainCat: "可投資資產", type: "未上市股權/事業投資", cls: "固定", currency: "台幣", fxRate: 1, value: 4_000_000, aid: "eq" });
    c.assets.push({ name: "自住房", owner: "王大明", mainCat: "自用資產", type: "自住不動產", cls: "固定", currency: "台幣", fxRate: 1, value: 15_000_000, aid: "house" });
    w.render();
    const fold = $('details[data-fk="finInflow"]');
    expect(fold, "折疊卡").toBeTruthy();
    expect(fold.hasAttribute("open")).toBe(false);
    expect(fold.textContent).toContain("預期入帳");
    w.addRow("futureInflows");
    expect(c.futureInflows.length).toBe(1);
    expect(c.futureInflows[0]).toMatchObject({ on: true, source: "事業出場", age: 43, prob: 100, mode: "一次" });
    w.tblMore("futureInflows", 0); w.render();
    const sel = [...$$('details[data-fk="finInflow"] .moretr select')].find((s) => s.textContent!.includes("不動任何資產")) as HTMLSelectElement;
    expect(sel, "結清資產下拉").toBeTruthy();
    const labels = [...sel.options].map((o) => o.textContent);
    expect(labels.some((t) => t!.includes("股權"))).toBe(true);
    expect(labels.some((t) => t!.includes("借給朋友"))).toBe(true);
    expect(labels.some((t) => t!.includes("自住房")), "沒勾可變賣的房子不在清單").toBe(false);
  });
  it("填了預期入帳：資料頁長出「未來會進來的錢」一句話＋時間軸；分析頁現況段出現模組；報告書有這一段", () => {
    const c = w.activeCase();
    c.futureInflows[0].name = "公司出場"; c.futureInflows[0].amount = 9_000_000; c.futureInflows[0].prob = 70; c.futureInflows[0].sellAid = "eq";
    w.render();
    const body = $('details[data-fk="finInflow"] .ckfoldbody');
    expect(body.textContent).toContain("未來會進來的錢");
    // 借給朋友 43 歲起分 3 年收 300 萬（上一條測試留下的）＋ 公司出場 900 萬×70%
    expect(body.textContent).toContain("2 筆、合計 9,300,000 元");
    expect(body.textContent).toContain("其中 6,300,000 元是把握度未滿 100%");
    expect(body.querySelectorAll("svg rect").length).toBe(4);   // 分期三根＋出場一根
    w.app.activeTab = "analysis"; w.render();
    const mod = $('.anmod[data-k="inflow"]');
    expect(mod, "分析頁模組").toBeTruthy();
    expect(mod.dataset.g).toBe("now");
    const rep = w.reportHTML(c);
    expect(rep).toContain("未來會進來的錢");
    expect(rep).toContain("把握度 70%");
  });
  it("沒有任何入帳的個案：折疊卡還在（可以新增），但沒有時間軸、分析頁沒有模組、報告書沒有這一段", () => {
    const c = w.activeCase();
    c.futureInflows = []; c.assets.forEach((a: { matureAge?: number }) => { a.matureAge = undefined; });
    w.app.activeTab = "data"; w.app.dataTab = "finance"; w.render();
    const fold = $('details[data-fk="finInflow"]');
    expect(fold).toBeTruthy();
    expect(fold.querySelector(".ckfoldbody").textContent).not.toContain("未來會進來的錢");
    expect(fold.querySelector(".ckfoldbody svg")).toBeNull();
    w.app.activeTab = "analysis"; w.render();
    expect($('.anmod[data-k="inflow"]')).toBeNull();
    const rep = w.reportHTML(c);
    expect(rep).not.toContain("未來會進來的錢");
  });
});
