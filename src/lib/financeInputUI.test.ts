import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 對齊 Excel 那一輪的輸入介面測試（真的把 lantu-app.html 跑起來）。
 *
 * 這些行為全部走在 HTML 內的字串樣板與 onchange 屬性裡，
 * 純正則的 drift test 看不出「按下去到底有沒有作用」：
 *   ・金額千分位（type=number 顯示不了逗號，改 text 之後值必須還是數字）
 *   ・拖曳排序與「自動整理」
 *   ・保單附約掛在主約下
 *   ・保障需求三大塊
 *   ・重要度下拉標示 5 最高
 *   ・成員的背景補充（職涯歷程／理財經驗／學經歷）
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
  w.app.dataTab = "finance";
  if (!w.app.cases.length) w.app.cases = [w.sampleCase()];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

const pane = () => w.document.querySelector("#app").innerHTML as string;

describe("金額千分位", () => {
  it("amtFmt 補逗號、amtRaw 拆掉（送進引擎的仍是純數字）", () => {
    expect(w.amtFmt("1200000")).toBe("1,200,000");
    expect(w.amtFmt(48000)).toBe("48,000");
    expect(w.amtFmt("")).toBe("");
    expect(w.amtFmt("abc")).toBe("");
    expect(w.amtRaw("1,200,000")).toBe("1200000");
    expect(w.n(w.amtRaw("1,200,000"))).toBe(1200000);
  });

  it("邊打邊格式化時游標留在原本的數字上（不會被踢到最後面）", () => {
    const el = w.document.createElement("input");
    el.value = "1200000";
    el.selectionStart = 4; // 「1200|000」
    w.amtKey(el);
    expect(el.value).toBe("1,200,000");
    // 游標前仍是 4 個數字
    expect(el.value.slice(0, el.selectionStart).replace(/[^\d]/g, "").length).toBe(4);
  });

  it("金額欄真的渲染成 text + inputmode=numeric（number 型不可能顯示逗號）", () => {
    const h = pane();
    expect(h).toContain('inputmode="numeric"');
    expect(h).toContain('class="amtin"');
  });

  it("金額欄輸入帶逗號的字串，寫進資料列的仍是數字", () => {
    const c = w.activeCase();
    w.setAmtByPeriod("expenses", 0, w.amtRaw("1,234,567"));
    expect(c.expenses[0].amount).toBe(1234567);
  });

  it("年齡/百分比這種欄位維持 type=number（加逗號反而難輸入）", () => {
    expect(pane()).toContain('type="number"');
  });
});

describe("拖曳排序與自動整理", () => {
  it("四張表每一列都有拖曳把手，整列可放置", () => {
    const h = pane();
    expect(h).toContain('class="dh"');
    expect(h).toContain("rowDragStart(");
    expect(h).toContain("rowDrop(");
  });

  it("rowDrop 把來源列搬到目標位置（陣列順序＝顯示順序）", () => {
    const c = w.activeCase();
    c.expenses = [
      { name: "A", cat: "生活", amount: 1, infl: true, start: 40, end: 85, cut: 0 },
      { name: "B", cat: "消費", amount: 2, infl: true, start: 40, end: 85, cut: 0 },
      { name: "C", cat: "生活", amount: 3, infl: true, start: 40, end: 85, cut: 0 },
    ];
    w.dragSrc = { arr: "expenses", i: 2 };
    w.rowDrop({ preventDefault() {}, target: null }, "expenses", 1);
    expect(w.activeCase().expenses.map((x: { name: string }) => x.name)).toEqual(["A", "C", "B"]);
  });

  it("自動整理把同一個大類的項目收攏在一起（生活費寫一寫想到還有一筆的情境）", () => {
    const c = w.activeCase();
    c.expenses = [
      { name: "餐食", cat: "生活", subCat: "餐食", amount: 1, infl: true, start: 40, end: 85, cut: 0 },
      { name: "旅遊", cat: "消費", subCat: "旅遊", amount: 2, infl: true, start: 40, end: 85, cut: 0 },
      { name: "水電", cat: "生活", subCat: "水電瓦斯", amount: 3, infl: true, start: 40, end: 85, cut: 0 },
      { name: "房貸", cat: "貸款", subCat: "自用住宅貸款", amount: 4, infl: false, start: 40, end: 70, cut: 0 },
    ];
    w.autoSortRows("expenses", "expense");
    // CAT_PARENTS.expense 的順序：生活 → 貸款 → 消費 …
    expect(w.activeCase().expenses.map((x: { cat: string }) => x.cat)).toEqual(["生活", "生活", "貸款", "消費"]);
  });
});

describe("支出的貸款入口", () => {
  it("分類下拉吃 CAT_PARENTS.expense，含新的『貸款』大類", () => {
    expect(w.CAT_PARENTS.expense).toContain("貸款");
    expect(pane()).toContain("自用住宅貸款");
  });

  it("負債表的貸款會在支出面板以唯讀彙總帶出（不讓人再填一次＝不重複計算）", () => {
    const c = w.activeCase();
    c.liabilities = [{ name: "自住房貸", owner: "王大明", mainCat: "房貸", subCat: "自住房貸", currency: "台幣", fxRate: 1, balance: 5000000, rate: 2, repay: "本息攤還", pay: 25000, months: 240, grace: 0, startAge: 40 }];
    const h = w.expLoanBlock(c) as string;
    expect(h).toContain("貸款支出（自負債表帶入）");
    expect(h).toContain("300,000"); // 25,000 × 12
    expect(h).toContain("已計入年支出");
  });

  it("手動貸款列撞到負債表已有的同類貸款會標『可能重複』", () => {
    const c = w.activeCase();
    c.liabilities = [{ name: "自住房貸", owner: "王大明", mainCat: "房貸", subCat: "自住房貸", currency: "台幣", fxRate: 1, balance: 1, rate: 0, repay: "本息攤還", pay: 0, months: 12, grace: 0, startAge: 40 }];
    expect(w.loanDupWarn(c, { cat: "貸款", subCat: "自住房貸", name: "x" })).toContain("可能重複");
    expect(w.loanDupWarn(c, { cat: "貸款", subCat: "其他貸款支出", name: "親友" })).toBe("");
    expect(w.loanDupWarn(c, { cat: "生活", subCat: "餐食", name: "餐" })).toBe("");
  });
});

describe("後台字典缺整個大類時的自癒（程式先上、migration 還沒跑）", () => {
  it("字典有 expense 但沒有『貸款』細類時，會把內建的那組補回來", () => {
    const orig = w.LANTU_CATS;
    try {
      // 模擬 migration 還沒跑：字典裡 expense 只有舊的大類
      w.LANTU_CATS = { expense: [{ label: "餐食", parent: "生活" }] };
      const labels = w.catList("expense").map((x: { label: string }) => x.label);
      expect(labels).toContain("餐食");
      expect(labels).toContain("自用住宅貸款"); // 補回來的
    } finally {
      w.LANTU_CATS = orig;
    }
  });

  it("字典完全沒有 saving 這個 kind 時，整份用內建的", () => {
    const orig = w.LANTU_CATS;
    try {
      w.LANTU_CATS = { expense: [{ label: "餐食", parent: "生活" }] };
      expect(w.catList("saving").map((x: { label: string }) => x.label)).toContain("勞退自提");
    } finally {
      w.LANTU_CATS = orig;
    }
  });
});

describe("儲蓄理財投入面板", () => {
  it("是獨立的一區，明講不計入支出", () => {
    const h = pane();
    expect(h).toContain("儲蓄理財投入");
    expect(h).toContain("不計入支出");
  });

  it("新增一列會帶儲蓄理財大類，且細類下拉來自字典", () => {
    const c = w.activeCase();
    c.savings = [];
    w.addRow("savings");
    expect(c.savings[0].cat).toBe("儲蓄理財");
    w.setCat("savings", 0, "saving", "勞退自提");
    expect(c.savings[0].subCat).toBe("勞退自提");
    expect(c.savings[0].cat).toBe("儲蓄理財");
  });

  it("儲蓄理財投入不會被算進年支出，但會進頂部摘要", () => {
    const c = w.activeCase();
    c.expenses = [{ name: "生活費", cat: "生活", amount: 600000, infl: true, start: 40, end: 85, cut: 0 }];
    c.savings = [{ name: "ETF", cat: "儲蓄理財", subCat: "定期定額ETF/基金", amount: 240000, period: "月" }];
    const t = w.finTotals(c);
    expect(t.exp).toBe(600000);
    expect(t.sav).toBe(240000);
    expect(t.bal).toBe(t.inc - 600000 - 240000);
  });
});

describe("資產布局規劃", () => {
  it("表格列出四個層級與定義（Excel 的核心/衛星敘述）", () => {
    const h = w.assetLayoutTable(w.activeCase()) as string;
    expect(h).toContain("核心");
    expect(h).toContain("衛星");
    expect(h).toContain("短期保留");
    expect(h).toContain("生活用");
    expect(h).toContain("長期投資");
  });
});

describe("保單：生效日與附約", () => {
  it("保單基本欄有生效日，到期欄明講是最高續保年齡", () => {
    w.app.dataTab = "policies";
    w.render();
    const h = pane();
    expect(h).toContain("生效日");
    expect(h).toContain("最高續保年齡");
  });

  it("保障明細改成意外傷殘＋醫療雜費＋薪資補償；癌症住院收進選填", () => {
    const h = pane();
    expect(h).toContain("意外傷殘保額");
    expect(h).toContain("醫療雜費(住院)");
    // 2026/08/29 B1：「薪資補償(月)」拆成日額／月額兩欄（保單端與需求端都拆）
    expect(h).toContain("薪資補償(日額)");
    expect(h).toContain("薪資補償(月額)");
    expect(h).toContain("選填給付");
  });

  it("addRider 從主約長出附約，關係人與保險公司跟著主約走", () => {
    const c = w.activeCase();
    c.policies = [];
    w.addRow("policies");
    const main = c.policies[0];
    main.name = "終身壽險主約";
    main.insured = "王大明";
    main.insurer = "國泰";
    w.ensurePolicy(main);
    w.addRider(0);
    const rider = c.policies[1];
    expect(rider.policyKind).toBe("附約");
    expect(rider.riderOf).toBe(main.pid);
    expect(rider.insured).toBe("王大明");
    expect(rider.insurer).toBe("國泰");
  });

  it("主約卡片會列出掛在它底下的附約", () => {
    const c = w.activeCase();
    c.policies[1].name = "住院醫療附約";
    c.policies[1].premium = 12000;
    const h = w.policyCard(c, c.policies[0], 0) as string;
    expect(h).toContain("住院醫療附約");
    expect(h).toContain("12,000");
  });

  it("切回主約會清掉所屬主約（不留指向別人的孤兒欄位）", () => {
    const c = w.activeCase();
    w.setPolicyKind(1, "主約");
    expect(c.policies[1].riderOf).toBe("");
  });

  it("每張保單都有 pid（附約才指得到主約），既有保單會被補發", () => {
    const c = w.activeCase();
    c.policies.push({ insured: "王大明", name: "舊保單", premium: 0 });
    w.ensurePolicies(c);
    expect(c.policies.every((p: { pid?: string }) => !!p.pid)).toBe(true);
    expect(new Set(c.policies.map((p: { pid: string }) => p.pid)).size).toBe(c.policies.length);
  });
});

describe("保障需求：責任 / 重病重殘 / 醫療 三大塊", () => {
  it("三張卡都在，且各自標清楚要填什麼", () => {
    w.app.dataTab = "needs";
    w.render();
    const h = pane();
    expect(h).toContain("一、責任");
    expect(h).toContain("二、重病重殘");
    expect(h).toContain("三、醫療");
    expect(h).toContain("生命禮儀費");
    expect(h).toContain("意外傷殘保障");
    expect(h).toContain("薪資補償");
    expect(h).toContain("住院雜費");
  });

  it("責任那塊會把系統自動帶入的四項算出來給顧問看（含父母奉養費）", () => {
    const h = pane();
    expect(h).toContain("自動帶入的責任");
    expect(h).toContain("家庭生活費");
    expect(h).toContain("父母奉養費");
    expect(h).toContain("子女教育費");
  });
});

describe("退休分頁：三段式金流", () => {
  it("三段對照表列出階段、權重、家庭年生活費", () => {
    const c = w.activeCase();
    c.members[1].retireAge = 60; // 王太太 38 歲 → 本人 62 歲時退休
    w.app.dataTab = "retire";
    w.render();
    const h = pane();
    expect(h).toContain("退休時點");
    expect(h).toContain("已退休權重");
    expect(h).toContain("混合期");
    expect(h).toContain("全退休");
    expect(h).toContain("退休順序");
  });

  it("退休期支出明細表可逐列設起訖歲，並標明是「都退休後」的金額", () => {
    const h = pane();
    expect(h).toContain("退休期支出明細");
    expect(h).toContain("賺薪成員都退休後的家庭年支出");
    expect(h).toContain("起歲");
    expect(h).toContain("訖歲");
  });

  it("「依工作期帶入」把生活＋消費列複製過來乘上取代率", () => {
    const c = w.activeCase();
    c.expenses = [
      { name: "生活費用", cat: "生活", amount: 1_000_000, infl: true, start: 40, end: 85, cut: 0 },
      { name: "旅遊", cat: "消費", amount: 200_000, infl: true, start: 40, end: 85, cut: 0 },
      { name: "保險費", cat: "保險", amount: 120_000, infl: false, start: 40, end: 85, cut: 0 },
    ];
    c.retireExpenses = [];
    c.retire.replaceRate = 75;
    w.fillRetireFromWork();
    const re = w.activeCase().retireExpenses;
    expect(re).toHaveLength(2); // 保險費不帶入
    expect(re[0].amount).toBe(750_000);
    expect(re[1].amount).toBe(150_000);
    expect(re[0].startAge).toBe(""); // 起歲留空＝從本人退休起
  });

  it("成員卡：配偶有自己的預計退休年齡（本人的仍在身分資料那格）", () => {
    w.app.dataTab = "family";
    w.render();
    const h = pane();
    expect(h).toContain("預計退休年齡");
    w.set("members:1", "retireAge", "62", "num");
    expect(w.activeCase().members[1].retireAge).toBe(62);
  });

  it("退休期支出的金額欄也是千分位，改了會重畫（三段表要跟著更新）", () => {
    w.app.dataTab = "retire";
    w.render();
    const h = pane();
    expect(h).toContain('data-fincalc="retireExpenses:0"');
    // moneyCell 會把 this.value 改寫成 amtRaw(this.value)（千分位輸入的解碼）
    expect(h).toContain("setAmtByPeriod('retireExpenses',0,amtRaw(this.value));render()");
  });
});

describe("重要度標示", () => {
  it("下拉直接寫出哪一端最重要（不用猜 1 還是 5）", () => {
    w.app.dataTab = "goals";
    w.render();
    const h = pane();
    expect(h).toContain("重要度（5最高）");
    expect(h).toContain("5 · 非做不可");
    expect(h).toContain("1 · 可放棄");
  });

  it("選了之後存進去的仍是數字", () => {
    const c = w.activeCase();
    if (!c.goals.length) w.addRow("goals");
    w.set("goals:0", "imp", "5", "num");
    expect(c.goals[0].imp).toBe(5);
  });
});

describe("成員的備註／背景補充", () => {
  it("成員卡有四個補充欄位", () => {
    w.app.dataTab = "family";
    w.render();
    const h = pane();
    expect(h).toContain("備註・背景補充");
    expect(h).toContain("職涯發展歷程");
    expect(h).toContain("過去的理財經驗");
    expect(h).toContain("學經歷");
  });

  it("本人的存進 profile.bg、其他成員存進 member.bg", () => {
    const c = w.activeCase();
    w.setBg(0, true, "career", "壽險業務 8 年，前一份是製造業 PM");
    expect(c.profile.bg.career).toContain("壽險業務");
    w.setBg(1, false, "finExp", "買過儲蓄險，2022 年被 ETF 套過");
    expect(c.members[1].bg.finExp).toContain("ETF");
  });

  it("填了會被帶進報告書的客戶背景側寫", () => {
    const h = w.bgReportHTML(w.activeCase()) as string;
    expect(h).toContain("客戶背景側寫");
    expect(h).toContain("壽險業務");
  });

  it("完全沒填時報告書不會多出一個空區塊", () => {
    const c = JSON.parse(JSON.stringify(w.activeCase()));
    delete c.profile.bg;
    (c.members || []).forEach((m: { bg?: unknown }) => delete m.bg);
    expect(w.bgReportHTML(c)).toBe("");
  });
});
