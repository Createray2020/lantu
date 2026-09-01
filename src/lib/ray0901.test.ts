import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { CLIENT_DASH_MODULES, CLIENT_DASH_KEYS, normalizeDashPrefs, dashVisible } from "./clientDashModules";
import { mergeClientDash, builtinClientDash, prefsFromPayload } from "./clientDashStore";

/**
 * Ray 2026/09/01 的九項回饋。
 *
 * 這一輪的主題是「同一件事不要有兩份資料」——副業、三張明細表、資產被動收入
 * 全部走既有陣列的過濾視圖或唯讀鏡射，沒有一項是新開的平行資料源。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  w.app.role = "coach";
  w.app.activeTab = "data";
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fresh(tab = "family"): any {
  const c = w.migrateCase(w.newCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.dataTab = tab;
  w.render();
  return c;
}
const C = () => w.activeCase();

describe("① 副業：一個人同時有好幾份工作", () => {
  it("新增的副業就是收入表的一列（不是另一份資料）", () => {
    const c = fresh();
    const before = c.incomes.length;
    w.addSideJob("本人", 40, 65);
    expect(C().incomes.length).toBe(before + 1);
    const row = C().incomes[C().incomes.length - 1];
    expect(row.side).toBe(true);
    expect(row.owner).toBe("本人");
    expect(row.type, "副業算工作收入，不是理財").toBe("工作");
    expect(row.start).toBe(40);
    expect(row.end).toBe(65);
  });

  it("月收入存成年額（incomes 的 amount 一律是年額）", () => {
    fresh();
    w.addSideJob("本人", 40, 65);
    const i = C().incomes.length - 1;
    w.setSideMonthly(i, "25,000");
    expect(C().incomes[i].amount).toBe(300_000);
    expect(C().incomes[i].period).toBe("月");
  });

  it("⚠️ 副業真的進現金流（因為它就是收入表的列）", () => {
    const c = fresh();
    c.incomes = [];
    const base = w.metrics(C()).incTotal;
    w.addSideJob("本人", 40, 65);
    w.setSideMonthly(C().incomes.length - 1, 20000);
    expect(w.metrics(C()).incTotal).toBe(base + 240_000);
  });

  it("只列出屬於這位成員的副業", () => {
    const c = fresh();
    w.addSideJob("本人", 40, 65);
    w.addSideJob("王太太", 38, 65);
    expect(w.sideJobRows(C(), "本人").length).toBe(1);
    expect(w.sideJobRows(C(), "王太太").length).toBe(1);
    expect(w.sideJobRows(C(), "沒有這個人").length).toBe(0);
    void c;
  });

  it("刪掉就是刪那一列收入（不會留下孤兒）", () => {
    fresh();
    w.addSideJob("本人", 40, 65);
    const i = C().incomes.length - 1;
    w.delRow("incomes", i);
    expect(w.sideJobRows(C(), "本人").length).toBe(0);
  });

  it("成員卡片畫得出來；沒有姓名時直說接不起來", () => {
    const c = fresh();
    expect(w.sideJobsHTML(c, { name: "本人" }, true, 0)).toContain("新增一份副業");
    expect(w.sideJobsHTML(c, { name: "" }, false, 1)).toContain("先填上姓名");
  });

  it("⚠️ 按鈕傳的是成員索引不是姓名——名字裡有單引號也接得起來", () => {
    const c = fresh();
    c.members[0].name = "O'Brien 陳";
    w.render();
    w.addSideJobAt(0, true);
    expect(w.sideJobRows(C(), "O'Brien 陳").length).toBe(1);
    // 而且按鈕本身不會把那個單引號吐進 onclick 裡
    expect(w.sideJobsHTML(C(), C().members[0], true, 0)).toContain("addSideJobAt(0,true)");
  });

  it("⚠️ 主要工作卡不動：副業不影響投保身分", () => {
    const c = fresh();
    const before = JSON.stringify({ jt: c.profile.jobType, ins: c.members[0].insType, sal: c.members[0].insSalary });
    w.addSideJob("本人", 40, 65);
    w.setSideMonthly(C().incomes.length - 1, 50000);
    const after = JSON.stringify({ jt: C().profile.jobType, ins: C().members[0].insType, sal: C().members[0].insSalary });
    expect(after).toBe(before);
  });
});

describe("②③④ 婚禮／買房後／買車 三張明細表", () => {
  it("三張都是既有陣列的過濾視圖，不是新陣列", () => {
    expect(w.DETAIL_SPECS.wedding.arr).toBe("goals");
    expect(w.DETAIL_SPECS.house.arr).toBe("expenses");
    expect(w.DETAIL_SPECS.car.arr).toBe("expenses");
  });

  it("帶入預設項目：婚禮進 goals（類型婚姻），落在結婚那一年", () => {
    const c = fresh("intent");
    c.marriage = { plan: "是", age: 34, budget: 0, minBudget: 0, importance: 4 };
    w.addDetailPresets("wedding");
    const rows = w.detailRows(C(), "wedding");
    expect(rows.length).toBe(w.DETAIL_SPECS.wedding.presets.length);
    expect(rows.every((p: { x: { type: string } }) => p.x.type === "婚姻")).toBe(true);
    expect(rows.every((p: { x: { start: number; end: number } }) => p.x.start === 34 && p.x.end === 34)).toBe(true);
  });

  it("買房後的持有成本進 expenses，起訖＝購屋歲～預估壽命", () => {
    const c = fresh("goals");
    c.goals = [{ on: true, name: "自住宅", type: "購屋", present: 12_000_000, start: 45, end: 45 }];
    c.profile.lifeExp = 88;
    w.addDetailPresets("house");
    const rows = w.detailRows(C(), "house");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((p: { x: { start: number; end: number } }) => p.x.start === 45 && p.x.end === 88)).toBe(true);
    // 每一列都要有合法的大類，否則引擎分不到桶子裡
    const cats = new Set(w.CAT_PARENTS.expense);
    expect(rows.every((p: { x: { cat: string } }) => cats.has(p.x.cat))).toBe(true);
  });

  it("⚠️⚠️ 買房後的明細一列房貸都沒有（購屋目標的貸款成數已經在算）", () => {
    const names = w.DETAIL_SPECS.house.presets.map((q: [string]) => q[0]).join("|");
    expect(names).not.toMatch(/房貸|貸款/);
    expect(HTML).toContain("刻意不含房貸");
  });

  it("買車的持有成本預設十年", () => {
    const c = fresh("goals");
    c.goals = [{ on: true, name: "換車", type: "購車", present: 900_000, start: 50, end: 50 }];
    w.addDetailPresets("car");
    const rows = w.detailRows(C(), "car");
    expect(rows.every((p: { x: { start: number; end: number } }) => p.x.start === 50 && p.x.end === 60)).toBe(true);
  });

  it("重按「帶入預設項目」不會變兩份", () => {
    fresh("goals");
    w.addDetailPresets("car");
    const n1 = w.detailRows(C(), "car").length;
    w.addDetailPresets("car");
    expect(w.detailRows(C(), "car").length).toBe(n1);
  });

  it("⚠️ 持有成本真的進逐年現金流（expenses 本來就逐年判起訖歲）", () => {
    const c = fresh("goals");
    c.expenses = [];
    c.goals = [{ on: true, name: "自住宅", type: "購屋", present: 12_000_000, start: 45, end: 45 }];
    const before = w.metrics(C()).expTotalRaw;
    w.addDetailPresets("house");
    expect(w.metrics(C()).expTotalRaw).toBeGreaterThan(before);
  });

  it("婚禮合計可以回填「婚禮預算(理想)」", () => {
    const c = fresh("intent");
    c.marriage = { plan: "是", age: 34, budget: 0, minBudget: 0, importance: 4 };
    w.addDetailPresets("wedding");
    const tot = w.detailTotal(C(), "wedding");
    w.syncWeddingBudget();
    expect(C().marriage.budget).toBe(Math.round(tot));
    expect(tot).toBeGreaterThan(0);
  });

  it("空白列加得出來，刪得掉", () => {
    fresh("goals");
    w.addDetailRow("car");
    const n1 = w.detailRows(C(), "car").length;
    expect(n1).toBe(1);
    w.delRow("expenses", w.detailRows(C(), "car")[0].i);
    expect(w.detailRows(C(), "car").length).toBe(0);
  });

  it("三張表都畫得出來，而且說清楚金額只是起手值", () => {
    const c = fresh("goals");
    for (const t of ["wedding", "house", "car"]) {
      const h = w.detailSec(c, t) as string;
      expect(h, t).toContain("帶入預設項目");
      expect(h, t).toContain("市場行情的起手值");
    }
  });
});

describe("⑥ 退休分頁自己就填得到退休年齡", () => {
  it("賺薪成員各一格，子女不列", () => {
    const c = fresh("retire");
    c.members = [
      { name: "本人", role: "本人", age: 40 },
      { name: "王太太", role: "配偶", age: 38, retireAge: 60 },
      { name: "小寶", role: "子女", age: 6 },
    ];
    const h = w.retireAgeBoxHTML(C()) as string;
    expect(h).toContain("本人（本人） 預計退休年齡");
    expect(h).toContain("王太太 預計退休年齡");
    expect(h).not.toContain("小寶");
  });

  it("改的就是家庭成員卡片的同兩個欄位", () => {
    const c = fresh("retire");
    c.profile.retireAge = 65;
    w.setMeta("profile", "retireAge", 62, "num");
    expect(C().profile.retireAge).toBe(62);
  });

  it("一個都沒填時要說出來（那時三段式只能用假設）", () => {
    const c = fresh("retire");
    c.profile.retireAge = "";
    c.members.forEach((m: { retireAge?: number }) => { m.retireAge = 0; });
    expect(w.retireAgeAssumed(C())).toBe(true);
    expect(w.retireAgeBoxHTML(C())).toContain("一個都沒填");
  });

  it("真的掛在退休分頁上", () => {
    fresh("retire");
    expect(w.document.querySelector("#app").innerHTML).toContain("想幾歲退休");
  });
});

describe("⑦ 資產的被動收入要在收入面板看得到", () => {
  it("填了被動現金流與只填報酬率，兩種來源分得開", () => {
    const c = fresh("finance");
    c.assets = [
      { name: "收租套房", owner: "本人", type: "不動產", value: 8_000_000, income: 240_000 },
      { name: "台股部位", owner: "本人", type: "股票", value: 2_000_000, ret: 4 },
      { name: "活存", owner: "本人", type: "現金", value: 500_000 },
    ];
    const rows = w.assetIncomeRows(C());
    expect(rows.length).toBe(2);
    expect(rows[0].amt).toBe(240_000);
    expect(rows[0].src).toContain("填了被動現金流");
    expect(rows[1].amt).toBe(80_000);
    expect(rows[1].src).toContain("報酬率");
  });

  it("⚠️⚠️ 只是鏡射——絕對不可以往收入表塞真的列（會全站算兩次）", () => {
    const c = fresh("finance");
    c.incomes = [];
    c.assets = [{ name: "收租套房", owner: "本人", type: "不動產", value: 8_000_000, income: 240_000 }];
    const fin = w.metrics(C()).incFinancial;
    w.render();
    expect(C().incomes.length, "鏡射不可以產生任何一列收入").toBe(0);
    expect(w.metrics(C()).incFinancial, "算兩次的話這裡會是 48 萬").toBe(fin);
    expect(fin).toBe(240_000);
  });

  it("外幣資產走匯率（跟 aVal / aInc 同一套）", () => {
    const c = fresh("finance");
    c.assets = [{ name: "美股", owner: "本人", type: "股票", currency: "美金", fxRate: 32, value: 10_000, income: 300 }];
    expect(w.assetIncomeRows(C())[0].amt).toBe(9_600);
  });

  it("畫面上有合計，也講明它不在「年收入」那一格裡", () => {
    const c = fresh("finance");
    c.assets = [{ name: "收租套房", owner: "本人", type: "不動產", value: 8_000_000, income: 240_000 }];
    const h = w.assetIncomeMirrorHTML(C()) as string;
    expect(h).toContain("來自資產的理財收入");
    expect(h).toContain("不在上面那個「年收入」總額裡");
  });

  it("一列都沒有時給的是引導，不是空白", () => {
    const c = fresh("finance");
    c.assets = [{ name: "活存", owner: "本人", type: "現金", value: 500_000 }];
    expect(w.assetIncomeMirrorHTML(C())).toContain("還沒有任何一列");
  });
});

describe("⑧ 客戶財務儀表板：後台勾哪幾塊", () => {
  it("兩邊的模組清單逐字一致", () => {
    expect(w.CLIENT_DASH_MODULES.length).toBe(CLIENT_DASH_MODULES.length);
    CLIENT_DASH_MODULES.forEach((m, i) => {
      expect(w.CLIENT_DASH_MODULES[i].k, `第 ${i + 1} 個模組鍵`).toBe(m.k);
      expect(w.CLIENT_DASH_MODULES[i].t, `第 ${i + 1} 個模組名`).toBe(m.t);
    });
  });

  it("⚠️ 沒設定過＝全部顯示", () => {
    w.LANTU_DASH = null;
    expect(CLIENT_DASH_KEYS.every((k) => w.dashOn(k))).toBe(true);
    expect(builtinClientDash().hidden).toEqual([]);
    expect(dashVisible({}, "hero")).toBe(true);
  });

  it("關掉的那幾塊真的不畫", () => {
    const c = w.migrateCase(w.sampleCase());
    w.app.cases = [c]; w.app.activeId = c.id;
    w.app.role = "client"; w.app.activeTab = "analysis";
    w.LANTU_DASH = null;
    w.render();
    const full = w.document.querySelector("#app").innerHTML as string;
    expect(full).toContain("財務健康度");
    expect(full).toContain("MY FINANCIAL DASHBOARD");

    w.LANTU_DASH = { hidden: ["gauges", "hero"] };
    w.render();
    const cut = w.document.querySelector("#app").innerHTML as string;
    expect(cut).not.toContain("MY FINANCIAL DASHBOARD");
    expect(cut).not.toContain("<h4>財務健康度</h4>");
    expect(cut, "沒關的那幾塊要留著").toContain("我的財務指標");
    w.LANTU_DASH = null;
  });

  it("報告書關掉時連分頁鈕都不出現，也不能靠 activeTab 硬進去", () => {
    const c = w.migrateCase(w.sampleCase());
    w.app.cases = [c]; w.app.activeId = c.id;
    w.app.role = "client";
    w.LANTU_DASH = { hidden: ["report"] };
    w.app.activeTab = "report";
    w.render();
    const h = w.document.querySelector("#app").innerHTML as string;
    expect(h).not.toContain("我的規劃報告");
    expect(h).toContain("我的財務儀表");
    w.LANTU_DASH = null;
    w.app.activeTab = "data";
    w.app.role = "coach";
  });

  it("全部關掉時給一句話，不是一片空白", () => {
    const c = w.migrateCase(w.sampleCase());
    w.app.cases = [c]; w.app.activeId = c.id;
    w.app.role = "client"; w.app.activeTab = "analysis";
    w.LANTU_DASH = { hidden: [...CLIENT_DASH_KEYS] };
    w.render();
    expect(w.document.querySelector("#app").innerHTML).toContain("沒有開放線上檢視的內容");
    w.LANTU_DASH = null;
    w.app.role = "coach";
    w.app.activeTab = "data";
  });

  it("資料層：不認得的 key 一律忽略，不要變成看不見的開關", () => {
    expect(mergeClientDash([{ key: "hero", hidden: true }, { key: "zzz", hidden: true }]).hidden).toEqual(["hero"]);
    expect(normalizeDashPrefs({ hero: true, zzz: true })).toEqual({ hero: true });
    expect(prefsFromPayload({ hidden: ["kpi"] })).toEqual({ kpi: true });
  });
});

describe("⑨ 邀請客戶填風險屬性測驗", () => {
  it("還沒邀請：畫面給的是邀請按鈕", () => {
    const c = fresh("risk");
    w.LANTU_CLIENT_QUIZ = null;
    expect(w.clientQuizBox(c)).toContain("邀請客戶填寫");
  });

  it("已邀請未送出：說出邀請日期，並提醒待辦清單也找得到", () => {
    const c = fresh("risk");
    w.LANTU_CLIENT_QUIZ = { invitedAt: "2026-09-01T00:00:00.000Z", submittedAt: null, score: null, tier: null, answers: {} };
    const h = w.clientQuizBox(c) as string;
    expect(h).toContain("2026-09-01");
    expect(h).toContain("還沒送出");
    expect(h).toContain("待辦清單");
  });

  it("已送出：顯示分數與等級，並提供「套用到這份規劃」", () => {
    const c = fresh("risk");
    w.LANTU_CLIENT_QUIZ = { invitedAt: null, submittedAt: "2026-09-02T00:00:00.000Z", score: 41, tier: "積極型", answers: {} };
    const h = w.clientQuizBox(c) as string;
    expect(h).toContain("積極型");
    expect(h).toContain("41");
    expect(h).toContain("套用到這份規劃");
  });

  it("⚠️ 套用之前，客戶的答案一個字都不在 plans.data 裡", () => {
    const c = fresh("risk");
    c.riskQuiz = { ans: {} };
    w.LANTU_CLIENT_QUIZ = {
      invitedAt: null, submittedAt: "2026-09-02T00:00:00.000Z", score: 41, tier: "積極型",
      answers: { "0": 4, "1": 3 },
    };
    w.render();
    expect(JSON.stringify(C().riskQuiz.ans)).toBe("{}");
  });

  it("按了套用才寫進這一份規劃", () => {
    const c = fresh("risk");
    c.riskQuiz = { ans: { "0": 0 } };
    const answers = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i), i === 6 || i === 7 ? [3] : 3]));
    w.LANTU_CLIENT_QUIZ = { invitedAt: null, submittedAt: "2026-09-02T00:00:00.000Z", score: 48, tier: "進取型", answers };
    w.confirm = () => true;
    w.applyClientQuiz();
    expect(w.riskScore(C()).answered).toBe(12);
    expect(w.riskProfile(C())).not.toBeNull();
  });

  it("單機預覽（沒有父層）按邀請要講清楚，不是按了沒反應", () => {
    fresh("risk");
    w.LANTU_CLIENT_QUIZ = null;
    delete w.LANTU_INVITE_QUIZ;
    w.render();
    w.inviteRiskQuiz();
    expect(w.document.getElementById("riskInviteMsg").textContent).toContain("單機預覽");
  });
});
