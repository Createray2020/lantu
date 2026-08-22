import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

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
