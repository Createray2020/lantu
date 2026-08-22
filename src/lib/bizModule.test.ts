import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as BizTax from "./bizTax";
import * as BizCheck from "./bizCheck";

/**
 * 企業主模組（第 ④ 群）的接線與地基語意測試。
 *
 * 為什麼需要這一支：這個模組有兩條「錯了就會安靜地算錯」的規則，
 * 純正則的 drift test 看不出來，一定要真的把 lantu-app.html 跑起來驗：
 *
 *   1. 公司股權與股東往來**不得寫進 c.assets / c.liabilities**。
 *      一旦進了那兩個陣列，projection()/metrics() 會把不流通的股權當成
 *      能生息、能變現的資產 —— 一個持股 100%、淨值三千萬的老闆，
 *      退休缺口會憑空消失，而且畫面上完全看不出哪裡不對。
 *
 *   2. 十二個財報訊號與合規閘掃描，掃不到原料時必須回「待補資料」，
 *      絕不能回「正常」。把沒問到的當成沒問題，是這類檢核最常見、
 *      也最危險的失誤。
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
});

// 每個 describe 自己建一份乾淨的 case，避免 jsdom 實例共用造成前後污染
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const freshCase = (): any => {
  const c = w.migrateCase(w.newCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  return c;
};
const pane = () => w.document.querySelector("#app").innerHTML as string;
const renderTab = (tab: string) => { w.app.activeTab = "data"; w.app.dataTab = tab; w.render(); return pane(); };

describe("c.company → c.companies[] 遷移", () => {
  it("舊的單一 company 物件搬進陣列，ownerLoan 轉成一筆股東往來並標註方向待確認", () => {
    const c = freshCase();
    c.companies = [];
    c.ownerLoans = [];
    c.company = { name: "嵐途實業", taxId: "12345678", industry: "製造", role: "負責人", sharePct: 80, annualRevenue: 30000000, netProfit: 2000000, ownerLoan: 1500000, note: "" };
    w.migrateCompanies(c);
    expect(c.companies).toHaveLength(1);
    expect(c.companies[0].name).toBe("嵐途實業");
    expect(c.companies[0].sharePct).toBe(80);
    expect(c.companies[0].cid).toBeTruthy();
    expect(c.ownerLoans).toHaveLength(1);
    expect(c.ownerLoans[0].amount).toBe(1500000);
    expect(c.ownerLoans[0].note).toContain("方向待確認");
  });

  it("冪等：再跑一次不會複製第二家公司、也不會再生一筆股東往來", () => {
    const c = freshCase();
    c.companies = [];
    c.ownerLoans = [];
    c.company = { name: "嵐途實業", annualRevenue: 30000000, ownerLoan: 1500000, sharePct: 100 };
    w.migrateCompanies(c);
    w.migrateCompanies(c);
    w.migrateCompanies(c);
    expect(c.companies).toHaveLength(1);
    expect(c.ownerLoans).toHaveLength(1);
  });

  it("空的舊 company 物件不會生出一家空公司（不能讓非企業主莫名多出第 ④ 群）", () => {
    const c = freshCase();
    c.companies = [];
    c.company = w.defaultCompany();
    c.profile.jobType = "一般就業者";
    c.members.forEach((m: { jobType?: string }) => { m.jobType = "一般就業者"; });
    w.migrateCompanies(c);
    expect(c.companies).toHaveLength(0);
    expect(w.entityOn(c, "company")).toBe(false);
  });

  it("工作類別已填「企業主」→ 補一列空公司並自動開啟主體（既有客戶不用重填）", () => {
    const c = freshCase();
    c.companies = [];
    c.company = w.defaultCompany();
    c.profile.jobType = "企業主";
    w.migrateCompanies(c);
    expect(c.companies).toHaveLength(1);
    expect(w.entityOn(c, "company")).toBe(true);
  });
});

describe("主體開關", () => {
  it("沒開時，資料頁看不到第 ④ 群，也不會多算完整度分母", () => {
    const c = freshCase();
    c.intent.entities = {};
    const before = w.baseTabsOf(c).length;
    const h = renderTab("family");
    expect(h).not.toContain("公私勾稽");
    expect(before).toBe(5);
  });

  it("開了之後第 ④ 群出現，地基層分頁從 5 頁變 8 頁", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    const h = renderTab("family");
    expect(w.baseTabsOf(c).map((b: string[]) => b[0])).toEqual(
      ["family", "finance", "coverage", "credit", "tax", "company", "linkage", "bizgate"],
    );
    expect(h).toContain("公私勾稽");
  });

  it("主體關掉時，停留在企業分頁會被踢回家庭頁（不會渲染出空白）", () => {
    const c = freshCase();
    c.intent.entities = {};
    w.app.dataTab = "linkage";
    w.render();
    expect(w.app.dataTab).toBe("family");
  });

  it("勾「想處理公司與個人的財務界線」＝自動開主體；取消就關回去", () => {
    const c = freshCase();
    c.intent.entities = {};
    w.togglePurpose("想處理公司與個人的財務界線");
    expect(w.entityOn(w.activeCase(), "company")).toBe(true);
    w.togglePurpose("想處理公司與個人的財務界線");
    expect(w.entityOn(w.activeCase(), "company")).toBe(false);
    expect(c.id).toBeTruthy();
  });

  it("企業目標在主體沒開時不會留在必達清單（否則優先序 index 會對不上）", () => {
    const c = freshCase();
    c.intent.entities = {};
    c.intent.mustHave = ["退休生活規劃", "事業退場規劃"];
    c.intent.targets = c.intent.mustHave.slice();
    w.normalizeIntent(c);
    expect(c.intent.mustHave).toEqual(["退休生活規劃"]);
  });
});

describe("股權估值：三法並存，且一律不流動", () => {
  it("淨值法 ＝ (總資產 − 總負債) × 持股", () => {
    const co = { ...w.newCompany(), totalAsset: 50000000, totalDebt: 20000000, sharePct: 60, valueMethod: "淨值法" };
    expect(w.companyEquity(co)).toBe(18000000);
  });

  it("盈餘倍數法 ＝ 稅後淨利 × 倍數 × 持股", () => {
    const co = { ...w.newCompany(), netProfit: 3000000, peMultiple: 5, sharePct: 60, valueMethod: "盈餘倍數法" };
    expect(w.companyEquity(co)).toBe(9000000);
  });

  it("手動指定就直接用那個數字（不再乘持股，那是「本人的」估值）", () => {
    const co = { ...w.newCompany(), valueManual: 12345678, sharePct: 50, valueMethod: "手動指定" };
    expect(w.companyEquity(co)).toBe(12345678);
  });

  it("⚠️ 地基語意：填完公司資料後，c.assets / c.liabilities 一筆都不會被新增，metrics().net 不變", () => {
    const c = freshCase();
    c.assets = [{ name: "現金", owner: "本人", mainCat: "可投資資產", type: "現金", cls: "流動", currency: "台幣", fxRate: 1, value: 2000000, movable: true }];
    c.liabilities = [];
    const netBefore = w.metrics(c).net;
    const assetsBefore = c.assets.length;

    c.intent.entities = { company: true };
    c.companies = [{ ...w.newCompany(), name: "測試", totalAsset: 80000000, totalDebt: 10000000, sharePct: 100, netProfit: 5000000 }];
    c.ownerLoans = [{ cid: c.companies[0].cid, dir: "我借公司", amount: 3000000, hasNote: "是", interest: "否", crossYear: "是", note: "" }];
    renderTab("linkage");

    // 股權七千萬、股東往來三百萬都算得出來……
    expect(w.equityTotal(c)).toBe(70000000);
    expect(w.ownerLoanNet(c)).toBe(3000000);
    // ……但一筆都沒有漏進引擎吃的兩個陣列
    expect(c.assets).toHaveLength(assetsBefore);
    expect(c.liabilities).toHaveLength(0);
    expect(w.metrics(c).net).toBe(netBefore);
  });
});

describe("整合式個人資產負債表", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setup = (): any => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.assets = [
      { name: "現金", owner: "本人", mainCat: "可投資資產", type: "現金", cls: "流動", currency: "台幣", fxRate: 1, value: 3000000, movable: true },
      { name: "自住房", owner: "本人", mainCat: "自用資產", type: "不動產", cls: "固定", currency: "台幣", fxRate: 1, value: 15000000, movable: false },
    ];
    c.liabilities = [{ name: "房貸", owner: "本人", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 8000000 }];
    c.companies = [{ ...w.newCompany(), name: "測試", totalAsset: 40000000, totalDebt: 20000000, sharePct: 100 }];
    c.guarantees = [{ bank: "A 銀行", item: "公司借款", limit: 20000000, balance: 12000000, due: "", coGuarantor: "", note: "" }];
    return c;
  };

  it("淨值含股權，流動性淨值把股權與自住房扣掉", () => {
    const bs = w.ownerBalanceSheet(setup());
    // 資產 3,000,000 + 15,000,000 + 股權 20,000,000 = 38,000,000；負債 8,000,000
    expect(bs.assetTotal).toBe(38000000);
    expect(bs.liabTotal).toBe(8000000);
    expect(bs.net).toBe(30000000);
    // 30,000,000 − 股權 20,000,000 − 自住房 15,000,000 = −5,000,000
    expect(bs.liquidNet).toBe(-5000000);
  });

  it("連帶保證是或有負債：不進負債合計，但一定要揭露", () => {
    const bs = w.ownerBalanceSheet(setup());
    expect(bs.liabTotal).toBe(8000000);
    expect(bs.guarantee).toBe(12000000);
    expect(w.ownerBalanceSheetHTML(setup(), bs)).toContain("或有負債");
  });

  it("覆蓋率 ＝ 流動性淨值 ÷ 連帶保證；沒有保證時不給假的 100%", () => {
    const bs = w.ownerBalanceSheet(setup());
    expect(bs.coverage).toBeCloseTo(-5000000 / 12000000, 6);
    const c2 = setup();
    c2.guarantees = [];
    expect(w.ownerBalanceSheet(c2).coverage).toBeNull();
  });

  it("股東往來：公司欠我算債權（不流動），我欠公司算負債", () => {
    const c = setup();
    c.ownerLoans = [{ cid: c.companies[0].cid, dir: "公司借我", amount: 2000000, hasNote: "是", interest: "是", crossYear: "否", note: "" }];
    const bs = w.ownerBalanceSheet(c);
    expect(bs.loanNet).toBe(-2000000);
    expect(bs.liabTotal).toBe(10000000);

    c.ownerLoans = [{ cid: c.companies[0].cid, dir: "我借公司", amount: 2000000, hasNote: "是", interest: "是", crossYear: "否", note: "" }];
    const bs2 = w.ownerBalanceSheet(c);
    expect(bs2.loanNet).toBe(2000000);
    expect(bs2.assetTotal).toBe(40000000);
    // 債權收不收得回來不由客戶決定 → 不算進流動性淨值
    expect(bs2.liquidNet).toBe(bs2.net - 20000000 - 15000000 - 2000000);
  });
});

describe("十二個財報訊號", () => {
  it("完全沒有原料時，該回「待補資料」的絕不回「正常」", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [w.newCompany()];
    const st = w.bizSignals(c).map((s: { st: string }) => s.st);
    expect(st).toHaveLength(12);
    // 現金水位、未分配盈餘、應收天數、保費、客戶集中度、財稅差異：六項都沒原料
    expect(st.filter((x: string) => x === "na").length).toBeGreaterThanOrEqual(6);
  });

  it("股東往來掛資產方 → 第 1 號亮燈", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [w.newCompany()];
    c.ownerLoans = [{ cid: c.companies[0].cid, dir: "公司借我", amount: 500000, hasNote: "否", interest: "否", crossYear: "是", note: "" }];
    expect(w.bizSignals(c)[0].st).toBe("on");
  });

  it("負債比高＋有個人連帶保證 → 第 4 號亮燈；沒有保證就不亮", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [{ ...w.newCompany(), totalAsset: 10000000, totalDebt: 8000000 }];
    c.guarantees = [{ bank: "A", item: "公司借款", limit: 5000000, balance: 5000000, due: "", coGuarantor: "", note: "" }];
    expect(w.bizSignals(c)[3].st).toBe("on");
    c.guarantees = [];
    expect(w.bizSignals(c)[3].st).toBe("ok");
  });

  it("現金水位低於兩個月 → 第 3 號亮燈；水位夠就正常", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [{ ...w.newCompany(), cash: 500000, monthlyFixed: 1000000 }];
    expect(w.bizSignals(c)[2].st).toBe("on");
    c.companies = [{ ...w.newCompany(), cash: 5000000, monthlyFixed: 1000000 }];
    expect(w.bizSignals(c)[2].st).toBe("ok");
  });
});

describe("合規閘：燈號判定", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const answer = (c: any, noIdx: number[]) => {
    c.bizGate = { ans: {} };
    for (let i = 0; i < 10; i++) c.bizGate.ans[i] = noIdx.indexOf(i) >= 0 ? "否" : "是";
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (): any => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [w.newCompany()];
    return c;
  };

  it("十題沒填完就不判定，不會假裝是綠燈", () => {
    const c = base();
    c.bizGate = { ans: { 0: "是" } };
    expect(w.gateLevel(c).lv).toBe("na");
  });

  it("0～2 個否＝綠、3～5 個否＝黃、6 個以上＝紅", () => {
    const c = base();
    answer(c, [0, 1]); expect(w.gateLevel(c).lv).toBe("green");
    answer(c, [0, 1, 2, 4]); expect(w.gateLevel(c).lv).toBe("amber");
    answer(c, [0, 1, 2, 4, 5, 6]); expect(w.gateLevel(c).lv).toBe("red");
  });

  it("第 4 題（扣繳申報）勾否＝一票否決，其他全是也是紅燈", () => {
    const c = base();
    answer(c, [3]);
    const g = w.gateLevel(c);
    expect(g.q4).toBe(true);
    expect(g.lv).toBe("red");
  });

  it("財報訊號亮燈會把等級往下壓（綠→黃，兩項以上直接紅）", () => {
    const c = base();
    answer(c, []);
    expect(w.gateLevel(c).lv).toBe("green");
    c.companies = [{ ...w.newCompany(), bookDiffPct: 30 }];   // 第 6 個掃描訊號亮
    expect(w.gateLevel(c).lv).toBe("amber");
  });

  it("紅燈時，畫面要給出處理順序與 §48-1 的時效提醒", () => {
    const c = base();
    answer(c, [3]);
    const h = renderTab("bizgate");
    expect(h).toContain("紅燈");
    expect(h).toContain("48-1");
    expect(h).toContain("暫緩");
  });

  it("燈號不會被寫進家庭版客戶報告書（Ray 2026/08/22 拍板）", () => {
    const c = base();
    answer(c, [3]);
    const report = w.reportHTML(c);
    expect(report).not.toContain("紅燈");
    expect(report).not.toContain("合規閘");
  });
});

describe("分頁渲染", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bizCase = (): any => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [{ ...w.newCompany(), name: "嵐途實業", annualRevenue: 30000000, netProfit: 2000000, totalAsset: 40000000, totalDebt: 15000000, sharePct: 100 }];
    return c;
  };

  it("公司概況：第一批五個數字擺在最前面，三年財報與 401 是漸進解鎖", () => {
    bizCase();
    const h = renderTab("company");
    expect(h).toContain("第一批 · 五個數字");
    expect(h).toContain("三年財務摘要");
    expect(h).toContain("近 6 期 401");
    expect(h).toContain("股權估值");
  });

  it("公私勾稽：四張表都在，且明講不要在收支資債重複登錄", () => {
    bizCase();
    const h = renderTab("linkage");
    expect(h).toContain("股東往來");
    expect(h).toContain("個人連帶保證");
    expect(h).toContain("公司名下非營運資產");
    expect(h).toContain("五條資金通道");
    expect(h).toContain("請不要在收支資債頁重複登錄");
  });

  it("未計息的「公司借我」會跳出設算利息提醒", () => {
    const c = bizCase();
    c.ownerLoans = [{ cid: c.companies[0].cid, dir: "公司借我", amount: 1000000, hasNote: "是", interest: "否", crossYear: "否", note: "" }];
    expect(renderTab("linkage")).toContain("設算利息");
  });

  it("薪資未辦扣繳會點名「扣繳義務人是公司負責人」", () => {
    const c = bizCase();
    c.channels = [{ cid: c.companies[0].cid, kind: "薪資", annual: 1200000, withhold: "未辦", doc: "齊全", note: "" }];
    expect(renderTab("linkage")).toContain("扣繳義務人是公司負責人");
  });

  it("公司概況只在企業分頁編輯：家庭/參數頁只給摘要與跳頁鈕", () => {
    const c = bizCase();
    c.profile.jobType = "企業主";
    const h = renderTab("family");
    expect(h).toContain("前往「公司概況」");
    expect(h).not.toContain("負責人往來(股東往來/借貸)");   // 舊的內嵌欄位已移除
  });

  it("分析頁掛上企業主診斷；主體沒開的客戶完全看不到", () => {
    bizCase();
    w.app.activeTab = "analysis"; w.render();
    expect(pane()).toContain("企業主診斷");
    expect(pane()).toContain("整合式個人資產負債表");

    const c2 = freshCase();
    c2.intent.entities = {};
    w.app.activeTab = "analysis"; w.render();
    expect(pane()).not.toContain("企業主診斷");
  });
});

// ── 波 3～5 ──

describe("bizTax 常數：兩份實作不得漂移", () => {
  const html = readFileSync(fileURLToPath(new URL("../../public/lantu-app.html", import.meta.url)), "utf8");
  const num = (name: string) => {
    const m = html.match(new RegExp("var " + name + "=([0-9.]+)[;,]"));
    if (!m) throw new Error(`lantu-app.html 找不到 ${name}`);
    return Number(m[1]);
  };

  it("稅率與門檻兩邊一致", () => {
    expect(num("PROFIT_TAX_RATE")).toBe(BizTax.PROFIT_TAX_RATE);
    expect(num("UNDISTRIBUTED_RATE")).toBe(BizTax.UNDISTRIBUTED_RATE);
    expect(num("DIVIDEND_SEPARATE_RATE")).toBe(BizTax.DIVIDEND_SEPARATE_RATE);
    expect(num("DIVIDEND_CREDIT_RATE")).toBe(BizTax.DIVIDEND_CREDIT_RATE);
    expect(num("DIVIDEND_CREDIT_CAP")).toBe(BizTax.DIVIDEND_CREDIT_CAP);
    expect(num("NHI_SUPP_RATE")).toBe(BizTax.NHI_SUPP_RATE);
    expect(num("NHI_SUPP_MIN")).toBe(BizTax.NHI_SUPP_MIN);
    expect(num("RENT_EXPENSE_RATE")).toBe(BizTax.RENT_EXPENSE_RATE);
    expect(num("VAT_RATE")).toBe(BizTax.VAT_RATE);
  });

  it("查核準則的三個車輛上限兩邊一致（租車繞不過 250 萬，112 年度起已補上）", () => {
    expect(num("CAR_DEPRECIATION_CAP")).toBe(BizTax.CAR_DEPRECIATION_CAP);
    expect(num("CAR_LEASE_DEPRECIATION_CAP")).toBe(BizTax.CAR_LEASE_DEPRECIATION_CAP);
    expect(BizTax.CAR_LEASE_DEPRECIATION_CAP).toBe(BizTax.CAR_DEPRECIATION_CAP);
    expect(num("CAR_RENTAL_BIZ_CAP")).toBe(BizTax.CAR_RENTAL_BIZ_CAP);
  });

  it("資料基準日兩邊一致，且畫面上真的印得出來", () => {
    expect(html).toContain(`var BIZ_TAX_BASIS='${BizTax.BIZ_TAX_BASIS}'`);
    expect(html).toContain("法規資料基準：");
  });

  it("退場三條路與企業四階段兩邊一致", () => {
    const pick = (name: string) => {
      const m = html.match(new RegExp("var " + name + "=\\[([\\s\\S]*?)\\];"));
      if (!m) throw new Error(`lantu-app.html 找不到 ${name}`);
      return m[1].split("],").map((r) => Array.from(r.matchAll(/'([^']*)'/g)).map((x) => x[1])).filter((r) => r.length);
    };
    expect(pick("EXIT_PATHS").map((r) => r[0])).toEqual(BizTax.EXIT_PATHS.map((p) => p.name));
    expect(pick("EXIT_PATHS").map((r) => r[2])).toEqual(BizTax.EXIT_PATHS.map((p) => p.years));
    expect(pick("BIZ_STAGES").map((r) => r[0])).toEqual(BizTax.BIZ_STAGES.map((s) => s.name));
    expect(Array.from((html.match(/var MONEY_CHANNELS=\[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/'([^']*)'/g)).map((x) => x[1]))
      .toEqual([...BizTax.MONEY_CHANNELS]);
  });
});

describe("連帶保證回流壽險需求", () => {
  it("本人簽的保證會加進壽險需求；別人簽的不算", () => {
    const c = freshCase();
    c.needs = [{ member: "本人", funeral: 600000, protectYears: 5, estateTax: 0, room: 0, selfPay: 0, nursing: 0, miscDaily: 0, incomeComp: 0, disability: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0 }];
    const before = w.lifeNeed(c, c.needs[0]);
    c.guarantees = [{ owner: "本人", bank: "A", item: "公司借款", limit: 0, balance: 6000000 }];
    expect(w.lifeNeed(c, c.needs[0])).toBe(before + 6000000);
    c.guarantees = [{ owner: "配偶", bank: "A", item: "公司借款", limit: 0, balance: 6000000 }];
    expect(w.lifeNeed(c, c.needs[0])).toBe(before);
  });

  it("責任遞減圖：保證是不遞減的一層，最後一年仍留著", () => {
    const c = freshCase();
    c.needs = [{ member: "本人", funeral: 0, protectYears: 3, estateTax: 0, room: 0, selfPay: 0, nursing: 0, miscDaily: 0, incomeComp: 0, disability: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0 }];
    c.guarantees = [{ owner: "本人", bank: "A", item: "公司借款", limit: 0, balance: 5000000 }];
    const rp = w.responsibilityProjection(c, c.needs[0]);
    expect(rp.rows[rp.rows.length - 1].funeral).toBe(5000000);
  });
});

describe("報酬結構試算", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (s: Record<string, number>): any => {
    const c = freshCase();
    c.taxParams = { married: false, dependents: 0, otherDeduction: 0 };
    return w.compScenario(c, s);
  };

  it("薪資與租金算公司可列費用、股利不算；勞退 6% 也是公司成本", () => {
    const r = run({ salary: 1200000, dividend: 500000, rent: 240000 });
    expect(r.pension).toBe(1200000 * 0.06);
    expect(r.deductible).toBe(1200000 + 240000 + 1200000 * 0.06);
    expect(r.corpSave).toBeCloseTo(r.deductible * 0.2, 6);
  });

  it("勞退提繳吃月提繳工資 15 萬的上限，不是照薪資全額算", () => {
    const r = run({ salary: 6000000, dividend: 0, rent: 0 });
    expect(r.pension).toBe(150000 * 12 * 0.06);
  });

  it("股利兩制擇優，取比較低的那一個", () => {
    const r = run({ salary: 600000, dividend: 3000000, rent: 0 });
    expect(r.incomeTax).toBe(Math.min(r.merged, r.separate));
    expect(r.mergedBetter).toBe(r.merged <= r.separate);
  });

  it("二代健保補充保費有起扣門檻，低於門檻不扣", () => {
    expect(run({ salary: 0, dividend: 19999, rent: 0 }).nhi).toBe(0);
    expect(run({ salary: 0, dividend: 20000, rent: 0 }).nhi).toBeCloseTo(20000 * 0.0211, 6);
  });

  it("租金可減除必要費用 43% 才進個人所得", () => {
    const r = run({ salary: 0, dividend: 0, rent: 1000000 });
    expect(r.rentNet).toBeCloseTo(570000, 4);
  });

  it("只領股利＝不累積勞退，這是取捨不是缺點", () => {
    expect(run({ salary: 0, dividend: 2000000, rent: 0 }).hasPension).toBe(false);
    expect(run({ salary: 1000000, dividend: 0, rent: 0 }).hasPension).toBe(true);
  });

  it("畫面一定要標「結構試算，不構成稅務建議」與資料基準日", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [w.newCompany()];
    c.intent.mustHave = ["報酬結構優化"];
    c.intent.targets = ["報酬結構優化"];
    const h = renderTab("bizcomp");
    expect(h).toContain("不構成稅務或法律建議");
    expect(h).toContain("法規資料基準");
  });
});

describe("退場與傳承", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exitCase = (): any => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.intent.mustHave = ["事業退場規劃"];
    c.intent.targets = ["事業退場規劃"];
    c.companies = [{ ...w.newCompany(), totalAsset: 60000000, totalDebt: 10000000, sharePct: 100 }];
    return c;
  };

  it("去老闆化評分：五題全是＝100%，沒答完不會灌水", () => {
    const c = exitCase();
    expect(w.debossScore(c).pct).toBe(0);
    c.bizExit = { deboss: { 0: "是", 1: "是", 2: "是", 3: "是", 4: "是" } };
    expect(w.debossScore(c).pct).toBe(100);
    c.bizExit = { deboss: { 0: "是", 1: "否" } };
    expect(w.debossScore(c).pct).toBe(20);
    expect(w.debossScore(c).answered).toBe(2);
  });

  it("股權會墊高遺產稅：診斷書要算得出「含股權 vs 不含股權」的差", () => {
    const c = exitCase();
    const m = w.metrics(c);
    const withEq = w.estateTax(c, m.net + w.equityTotal(c)).tax;
    const without = w.estateTax(c, m.net).tax;
    expect(w.equityTotal(c)).toBe(50000000);
    expect(withEq).toBeGreaterThan(without);
  });

  it("三條路徑與四個階段都渲染得出來，並標明準備時間", () => {
    exitCase();
    const h = renderTab("bizexit");
    expect(h).toContain("傳承接班");
    expect(h).toContain("出售事業");
    expect(h).toContain("收攤清算");
    expect(h).toContain("5～10 年");
    expect(h).toContain("生存期");
    expect(h).toContain("成熟期");
  });

  it("沒選這個目標時分頁收合，不會硬跳一整頁空表單", () => {
    const c = exitCase();
    c.intent.mustHave = [];
    c.intent.targets = [];
    const h = renderTab("bizexit");
    expect(h).toContain("客戶未選此目標");
    expect(h).not.toContain("去老闆化評分");
  });
});

describe("企業主財務診斷書", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withGate = (): any => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [{ ...w.newCompany(), name: "嵐途實業", totalAsset: 40000000, totalDebt: 10000000, sharePct: 100 }];
    c.bizGate = { ans: {} };
    for (let i = 0; i < 10; i++) c.bizGate.ans[i] = "否";
    return c;
  };

  it("診斷書帶得出燈號、整合式資產表與核心命題", () => {
    const c = withGate();
    const h = w.bizReportHTML(c);
    expect(h).toContain("企業主財務診斷書");
    expect(h).toContain("紅燈");
    expect(h).toContain("流動性淨值");
    expect(h).toContain("與人身脫鉤");
  });

  it("同一份 case，家庭版報告書仍然不含燈號（兩份是分開的）", () => {
    const c = withGate();
    expect(w.reportHTML(c)).not.toContain("紅燈");
    expect(w.bizReportHTML(c)).toContain("紅燈");
  });

  it("診斷書一定帶免責與專業邊界", () => {
    const h = w.bizReportHTML(withGate());
    expect(h).toContain("不構成稅務、法律或投資建議");
    expect(h).toContain("應轉介專業人士");
  });

  it("報告頁可以切換兩份文件；非企業主客戶沒有這個切換", () => {
    withGate();
    w.app.activeTab = "report"; w.app.reportDoc = "biz"; w.render();
    expect(pane()).toContain("企業主財務診斷書");
    w.app.reportDoc = "family"; w.render();
    expect(pane()).toContain("輸出哪一份");

    const c2 = freshCase();
    c2.intent.entities = {};
    w.app.activeTab = "report"; w.render();
    expect(pane()).not.toContain("輸出哪一份");
  });
});

describe("建議頁：一次最多三個缺口（這是內容規則，不是 UI 偏好）", () => {
  it("亮燈超過三個時只列前三，其餘收進「其他觀察」", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [{ ...w.newCompany(), totalAsset: 10000000, totalDebt: 9000000, cash: 100000, monthlyFixed: 1000000, retained: 99000000, netProfit: 1000000, ar: 99000000, annualRevenue: 10000000, insExpense: 0, topClientPct: 90, bookDiffPct: 50 }];
    c.ownerLoans = [{ cid: c.companies[0].cid, dir: "公司借我", amount: 500000, hasNote: "否", interest: "否", crossYear: "是", note: "" }];
    c.guarantees = [{ owner: "本人", bank: "A", item: "公司借款", limit: 0, balance: 5000000 }];
    c.bizAssets = [{ cid: c.companies[0].cid, name: "車", type: "車輛", value: 1000000, user: "本人", note: "" }];
    const on = w.bizSignals(c).filter((s: { st: string }) => s.st === "on");
    expect(on.length).toBeGreaterThan(3);

    w.app.activeTab = "advice"; w.render();
    const h = pane();
    expect(h).toContain("一次不超過三個缺口");
    expect(h).toContain("其他觀察（" + (on.length - 3) + " 項，本次先不處理）");
  });

  it("八大面向會依燈號標出本階段重點", () => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.companies = [w.newCompany()];
    c.bizGate = { ans: {} };
    for (let i = 0; i < 10; i++) c.bizGate.ans[i] = "否";
    w.app.activeTab = "advice"; w.render();
    expect(pane()).toContain("聚焦「止血」");
  });
});

describe("工具箱：企業現金流三件工具", () => {
  it("13 週表算得出最早跌破安全水位的那一週", () => {
    w.app.tools.cash13 = { open: 1000000, inflow: 100000, outflow: 300000, vat: 0, profitTax: 0, safe: 500000 };
    w.app.activeTab = "tools"; w.render();
    const h = pane();
    expect(h).toContain("13 週現金流量預測表");
    expect(h).toContain("第 3 週");     // 1,000,000 每週 −200,000 → W3 收 400,000 < 500,000
  });

  it("五漏斗：還本金不在損益表上，會被算進現金差額", () => {
    w.app.tools.leak = { profit: 1000000, ar: 400000, inv: 300000, capex: 500000, principal: 200000, tax: 250000, dep: 300000 };
    w.app.activeTab = "tools"; w.render();
    const h = pane();
    expect(h).toContain("償還本金不在損益表上");
    expect(h).toContain("-350,000");   // 100−40−30−50−20−25+30 = −35 萬
  });

  it("健康度五指標都算得出來", () => {
    w.app.activeTab = "tools"; w.render();
    const h = pane();
    expect(h).toContain("現金轉換循環");
    expect(h).toContain("獲利品質");
    expect(h).toContain("利息保障倍數");
  });
});

describe("bizCheck：客戶端十題檢核（公開頁）與教練端合規閘同一份題目", () => {
  const html = readFileSync(fileURLToPath(new URL("../../public/lantu-app.html", import.meta.url)), "utf8");

  it("題目兩邊一字不差（改了一邊就會紅）", () => {
    const m = html.match(/var GATE_Q=\[([\s\S]*?)\];/);
    if (!m) throw new Error("lantu-app.html 找不到 GATE_Q");
    const qs = Array.from(m[1].matchAll(/'([^']*)'/g)).map((x) => x[1]);
    expect(qs).toEqual([...BizCheck.GATE_Q]);
  });

  it("第 4 題是一票否決，兩邊的 index 一致", () => {
    expect(BizCheck.GATE_VETO_INDEX).toBe(3);
    expect(html).toContain("ans[3]==='否'");
  });

  it("分級：0～2 綠、3～5 黃、6 以上紅", () => {
    const mk = (noIdx: number[]) => {
      const a: Record<number, "是" | "否"> = {};
      for (let i = 0; i < BizCheck.GATE_Q.length; i++) a[i] = noIdx.includes(i) ? "否" : "是";
      return a;
    };
    expect(BizCheck.gateLevelOf(mk([0, 1])).lv).toBe("green");
    expect(BizCheck.gateLevelOf(mk([0, 1, 2, 4])).lv).toBe("amber");
    expect(BizCheck.gateLevelOf(mk([0, 1, 2, 4, 5, 6])).lv).toBe("red");
    expect(BizCheck.gateLevelOf(mk([3])).lv).toBe("red");     // 一票否決
  });

  it("沒答完不判定，不會假裝綠燈", () => {
    expect(BizCheck.gateLevelOf({ 0: "是" }).lv).toBe("na");
    expect(BizCheck.gateLevelOf({}).lv).toBe("na");
  });

  it("最多只給三個缺口，且有時效性的第 4 題永遠排第一", () => {
    const gaps = BizCheck.topGaps([0, 1, 2, 3, 5, 6]);
    expect(gaps).toHaveLength(BizCheck.MAX_GAPS_AT_ONCE);
    expect(gaps[0].q).toBe(BizCheck.GATE_Q[BizCheck.GATE_VETO_INDEX]);
  });

  it("每一題都有對應的導引，不會有勾了否卻沒有下一步的題目", () => {
    expect(BizCheck.GATE_GUIDE).toHaveLength(BizCheck.GATE_Q.length);
    for (const g of BizCheck.GATE_GUIDE) {
      expect(g.mean.length).toBeGreaterThan(0);
      expect(g.next.length).toBeGreaterThan(0);
    }
  });
});

describe("五條資金通道 → 收支資債（顯式同步，不自動加總）", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withChannels = (): any => {
    const c = freshCase();
    c.intent.entities = { company: true };
    c.intent.mustHave = ["報酬結構優化"];
    c.intent.targets = ["報酬結構優化"];
    c.companies = [w.newCompany()];
    c.profile.age = 45;
    c.profile.retireAge = 60;
    c.channels = [
      { cid: c.companies[0].cid, kind: "薪資", annual: 1200000, withhold: "已辦", doc: "齊全", note: "" },
      { cid: c.companies[0].cid, kind: "盈餘分配(股利)", annual: 800000, withhold: "不適用", doc: "齊全", note: "" },
      { cid: c.companies[0].cid, kind: "租金", annual: 240000, withhold: "已辦", doc: "齊全", note: "" },
      { cid: c.companies[0].cid, kind: "借款", annual: 500000, withhold: "不適用", doc: "齊全", note: "" },
      { cid: c.companies[0].cid, kind: "費用報銷", annual: 100000, withhold: "不適用", doc: "齊全", note: "" },
    ];
    return c;
  };

  it("只有薪資／董監／股利／租金會變成所得；借款與報銷不是所得", () => {
    const rows = w.channelIncomeRows(withChannels());
    expect(rows.map((r: { src: string }) => r.src)).toEqual(["ch:薪資", "ch:盈餘分配(股利)", "ch:租金"]);
    expect(rows.find((r: { src: string }) => r.src === "ch:借款")).toBeUndefined();
  });

  it("薪資走「工作」、股利與租金走「理財」，細類對得上字典", () => {
    const rows = w.channelIncomeRows(withChannels());
    expect(rows[0]).toMatchObject({ type: "工作", subType: "薪資", amount: 1200000, start: 45, end: 60 });
    expect(rows[1]).toMatchObject({ type: "理財", subType: "事業盈餘分配" });
    expect(rows[2]).toMatchObject({ type: "理財", subType: "租金收入" });
  });

  it("⚠️ 沒按同步鈕之前，通道一毛錢都不會進 c.incomes（不自動加總）", () => {
    const c = withChannels();
    c.incomes = [];
    renderTab("bizcomp");
    expect(c.incomes).toHaveLength(0);
    expect(w.metrics(c).incTotal).toBe(0);
  });

  it("同步是冪等的：重跑只會取代帶標記的列，不會愈長愈多", () => {
    const c = withChannels();
    c.incomes = [{ name: "配偶薪資", owner: "配偶", type: "工作", subType: "薪資", amount: 600000, growth: 0, start: 45, end: 60 }];
    const rows = w.channelIncomeRows(c);
    // 模擬 syncChannels 的核心（避開 confirm 對話框）
    const apply = () => { c.incomes = c.incomes.filter((i: { src?: string }) => String(i.src || "").indexOf("ch:") !== 0).concat(w.channelIncomeRows(c)); };
    apply(); apply(); apply();
    expect(c.incomes).toHaveLength(1 + rows.length);
    expect(c.incomes.filter((i: { src?: string }) => i.src).length).toBe(rows.length);
    expect(c.incomes[0].name).toBe("配偶薪資");   // 手動登錄的那筆不受影響
  });

  it("同步狀態卡：帶入前顯示「尚未同步」，帶入後顯示「已同步」", () => {
    const c = withChannels();
    c.incomes = [];
    expect(w.channelSyncStatus(c).synced).toBe(false);
    expect(renderTab("bizcomp")).toContain("尚未同步");

    c.incomes = w.channelIncomeRows(c);
    expect(w.channelSyncStatus(c).synced).toBe(true);
    expect(w.channelSyncStatus(c).wantTotal).toBe(1200000 + 800000 + 240000);
    expect(renderTab("bizcomp")).toContain("已同步");
  });

  it("畫面要明說系統不會偵測重複（這是唯一的防呆）", () => {
    withChannels();
    expect(renderTab("bizcomp")).toContain("系統不會自動偵測重複");
  });
});

describe("法規常數可由後台覆蓋（applyBizTax）", () => {
  it("後台改了營所稅率，試算就跟著變；改完再改回來也還原得了", () => {
    const c = freshCase();
    c.taxParams = { married: false, dependents: 0, otherDeduction: 0 };
    const base = w.compScenario(c, { salary: 1000000, dividend: 0, rent: 0 });
    w.applyBizTax({ values: { PROFIT_TAX_RATE: 0.15 }, basis: "2027-01" });
    const changed = w.compScenario(c, { salary: 1000000, dividend: 0, rent: 0 });
    expect(changed.corpSave).toBeLessThan(base.corpSave);
    expect(w.bizBasisNote()).toContain("2027-01");
    w.applyBizTax({ values: { PROFIT_TAX_RATE: BizTax.PROFIT_TAX_RATE }, basis: BizTax.BIZ_TAX_BASIS });
    expect(w.compScenario(c, { salary: 1000000, dividend: 0, rent: 0 }).corpSave).toBeCloseTo(base.corpSave, 6);
  });

  it("⚠️ 後台誤刪或填壞一列，常數不會變成 NaN（否則試算會靜靜地算出一堆 NaN）", () => {
    const before = w.compScenario(freshCase(), { salary: 1000000, dividend: 500000, rent: 0 });
    w.applyBizTax({ values: { PROFIT_TAX_RATE: null, NHI_SUPP_RATE: "", DIVIDEND_SEPARATE_RATE: undefined, VAT_RATE: "壞掉的字" } });
    const after = w.compScenario(freshCase(), { salary: 1000000, dividend: 500000, rent: 0 });
    expect(Number.isFinite(after.corpSave)).toBe(true);
    expect(Number.isFinite(after.nhi)).toBe(true);
    expect(after.corpSave).toBeCloseTo(before.corpSave, 6);
  });

  it("payload 是空的或型別不對，直接略過不炸", () => {
    expect(() => w.applyBizTax(null)).not.toThrow();
    expect(() => w.applyBizTax("nope")).not.toThrow();
    expect(() => w.applyBizTax({})).not.toThrow();
  });
});
