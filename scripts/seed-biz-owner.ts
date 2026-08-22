// 在 Ray（立揚 雷 / admin / owner）帳號下建 1 位「企業主」示範客戶。
//
// 目的：把第 ④ 群「企業」的每一塊都填滿，讓整個模組有一個可以直接點開來看的樣本——
// 公司概況、三年財報、六期 401、公私勾稽四張表、合規閘十題、報酬結構三情境、
// 企業保障三層、退場與傳承，加上完整的家庭層（收支資債／保障／教育／退休）。
//
// 純新增，不動任何現有資料。tag=示範資料＋企業主，一行 SQL 可清：
//   delete from clients where coach_id='<owner>' and name='林國棟';
//
// 空跑（不寫 DB，只印出算出來的數字）：DRY_RUN=1 npx tsx scripts/seed-biz-owner.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import * as schema from "../src/Shared/db/schema";
import { sampleCase } from "../src/lib/engine";
import { planSnapshot } from "../src/lib/snapshot";

const { coaches, clients, plans, reviews, actionItems } = schema;
const DEMO_TAGS = ["示範資料", "企業主"];
const YEAR = 2025;
const NAME = "林國棟";
const CO = "co_demo_hongsheng";

const iso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const birth = (age: number) => `${new Date().getFullYear() - age}-03-08`;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── 人物誌 ──
// 林國棟 52 歲，機械零件製造廠負責人（宏昇精密，持股 70%，成立 16 年）。
// 典型的「公司先用，剩下的才是他的」：年營收 1.8 億，個人卻只領 96 萬薪水；
// 身家幾乎全在股權裡，還簽了 6,000 萬連帶保證。
// 這個案例刻意讓「流動性淨值」與「連帶保證覆蓋率」兩個數字很難看——
// 那正是整合式個人資產負債表存在的理由。
function buildCase(): any {
  const c: any = sampleCase();
  const A = 52;

  c.profile = {
    ...c.profile,
    name: NAME, gender: "男", age: A, retireAge: 62, lifeExp: 88, credit: 720,
    marital: "已婚", dependents: 2,
    jobType: "企業主", jobTypeOther: "", monthlySalary: 80000, birth: birth(A),
    bg: "16 年前與前東家的兩位同事一起出來創業，做汽車與工具機的精密零件。技術與客戶都在他身上，公司幾乎沒有離開他還能運作的部分。個性節儉、對數字敏感，但從沒把「公司的財務」和「自己的財務」分開看過。",
  };
  c.params = { inflation: 1.8, salaryGrowth: 1.5, invReturn: 5, tuitionGrowth: 3, freeSaving: 1, planSaving: 0, emergencyMonths: 6, horizon: 88, invReturnStd: 12, inflationStd: 1, salaryStd: 1 };
  c.tracking = [{ year: 2023, age: 50, net: 48200000 }, { year: 2024, age: 51, net: 50600000 }, { year: 2025, age: 52, net: 52500000 }];
  c.riskQuiz = { ans: { 0: 3, 1: 1, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3, 11: 2 } };

  c.members = [
    { name: NAME, role: "本人", gender: "男", age: A, worked: 28, insType: "勞保", insSalary: 45800, depRatio: 100, expRatio: 38, indepAge: "", retireAge: 62, jobType: "企業主", monthlySalary: 80000, birth: birth(A), bg: "負責人。技術與大客戶關係都綁在他身上。" },
    { name: "林淑芬", role: "配偶", gender: "女", age: 49, worked: 16, insType: "勞保", insSalary: 45800, depRatio: 0, expRatio: 27, indepAge: "", retireAge: 60, jobType: "企業主", monthlySalary: 70000, birth: birth(49), bg: "公司會計兼行政，掛名董事。家裡的錢也是她在管。" },
    { name: "林承翰", role: "子女", gender: "男", age: 19, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 20, indepAge: 24, birth: birth(19), bg: "私立大學機械系二年級。父親希望他接班，但他自己還沒表態。" },
    { name: "林品妍", role: "子女", gender: "女", age: 15, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 15, indepAge: 24, birth: birth(15), bg: "高中一年級。想念設計，對家裡的事業沒有興趣。" },
  ];

  // ── 家庭層：收入只有兩份薪水，加起來還撐不住家庭支出 ──
  // 這不是設計失誤，是這個案例的重點：老闆的個人現金流長期靠公司補。
  c.incomes = [
    { name: "公司薪資", owner: NAME, type: "工作", subType: "薪資", period: "年", amount: 960000, growth: 0, start: A, end: 62 },
    { name: "公司薪資", owner: "林淑芬", type: "工作", subType: "薪資", period: "年", amount: 840000, growth: 0, start: A, end: 60 },
  ];
  c.expenses = [
    { name: "家庭生活費", cat: "生活", subCat: "食衣住行", period: "年", amount: 1080000, infl: true, start: A, end: 88, cut: 10 },
    { name: "孝親費", cat: "孝親", subCat: "父母奉養", period: "年", amount: 180000, infl: false, start: A, end: 78, cut: 0 },
    { name: "保險費", cat: "保險", subCat: "人身保險", period: "年", amount: 186000, infl: false, start: A, end: 88, cut: 0 },
    { name: "勞健保費（個人負擔）", cat: "保險", subCat: "勞健保", period: "年", amount: 72000, infl: false, start: A, end: 65, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", subCat: "綜所稅", period: "年", amount: 96000, infl: false, start: A, end: 88, cut: 0 },
  ];
  c.savings = [];
  c.retireExpenses = [
    { name: "退休期生活費", cat: "生活", subCat: "食衣住行", period: "年", amount: 900000, infl: true, startAge: "", endAge: "" },
    { name: "退休後醫療與長照預留", cat: "生活", subCat: "醫療", period: "年", amount: 180000, infl: true, startAge: 75, endAge: 88 },
  ];
  c.assets = [
    { name: "活存與定存", owner: NAME, mainCat: "可投資資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 3200000, value: 3200000, ret: 1.2, income: 38000, movable: true, risk: false, layer: "緊急預備" },
    { name: "台股與 ETF", owner: NAME, mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 4200000, value: 4800000, ret: 5, income: 168000, movable: true, risk: true, layer: "增值" },
    { name: "儲蓄型保單現值", owner: "林淑芬", mainCat: "可投資資產", type: "保單", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 2400000, value: 2600000, ret: 2, income: 0, movable: true, risk: false, layer: "保障" },
    { name: "自住宅（台中西屯）", owner: NAME, mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 12000000, value: 18000000, ret: 0, income: 0, movable: false, risk: false, layer: "自用" },
  ];
  c.liabilities = [
    { name: "自住房貸", owner: NAME, mainCat: "房貸", subCat: "自住", currency: "台幣", fxRate: 1, balance: 6200000, rate: 2.1, repay: "本息攤還", pay: 40100, months: 180, grace: 0, startAge: A, orig: 12000000, consumerDebt: false, note: "15 年期，本人為借款人" },
  ];
  c.education = [
    { mid: "", child: "林承翰", stage: "大學", schoolType: "私立", tuition: 118000, extra: 40000, care: 120000, withExtra: true, withCare: true, annual: 278000, years: 3, startIn: 0, auto: false, lock: false },
    { mid: "", child: "林品妍", stage: "高中職", schoolType: "公立", tuition: 26000, extra: 80000, care: 120000, withExtra: true, withCare: true, annual: 226000, years: 2, startIn: 0, auto: false, lock: false },
  ];
  c.goals = [
    { name: "承翰研究所", type: "其他", present: 600000, minPresent: 400000, start: 55, end: 56, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0 },
    { name: "換車（現有公司車還給公司後）", type: "購車", present: 1200000, minPresent: 900000, start: 62, end: 62, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 2, prepared: 0 },
  ];
  c.travel = [{ cat: "國外", sub: "深度旅遊", start: 63, end: 78, freq: 2, amount: 180000, minAmount: 120000, imp: 4 }];
  c.hobby = [];
  c.luxury = [];
  c.lifeGoals = [
    { name: "把公司交出去，而不是收掉", priority: 1, value: "十六年的東西，不想在我手上結束", importance: 5, linkModule: "傳承", note: "承翰還沒表態" },
    { name: "太太不用再幫我扛", priority: 2, value: "她管了十六年的帳，該有自己的退休金", importance: 5, linkModule: "退休", note: "" },
    { name: "兩個孩子念完想念的書", priority: 3, value: "我自己是半工半讀出來的", importance: 4, linkModule: "教育", note: "" },
  ];
  c.retire = { monthLiving: 75000, retireReturn: 3.5, retireInflation: 1.8, replaceRate: 60, prepared: [{ item: "勞保老年年金（本人）", age: 65, amount: 21000, method: "月領" }, { item: "勞退新制個人專戶", age: 62, amount: 1800000, method: "一次領" }] };

  // ── 保障：現有額度遠遠蓋不住 6,000 萬的連帶保證 ──
  c.needs = [
    { member: NAME, funeral: 800000, protectYears: 12, estateTax: 0, room: 3000, selfPay: 2500, nursing: 2000, miscDaily: 5000, incomeComp: 60000, disability: 8000000, firstCancer: 1000000, cancerHosp: 3000, critical: 4000000, monthCare: 50000, careMonths: 120 },
    { member: "林淑芬", funeral: 800000, protectYears: 10, estateTax: 0, room: 3000, selfPay: 2000, nursing: 2000, miscDaily: 4000, incomeComp: 40000, disability: 5000000, firstCancer: 1000000, cancerHosp: 3000, critical: 3000000, monthCare: 50000, careMonths: 120 },
  ];
  c.coverages = [];
  c.policies = [
    { pid: "p_demo_1", insured: NAME, name: "終身壽險", insurer: "國泰人壽", bigCat: "人身", subtype: "終身壽險", policyKind: "主約", riderOf: "", owner: NAME, beneficiary: "林淑芬", policyNo: "D-100001", premium: 96000, currency: "TWD", payYears: 20, paidYears: 14, effDate: "2011-05-01", termEnd: "", status: "有效", claimNote: "身故或全殘給付保額", cashValue: 1250000, life: 5000000, accident: 0, medical: 0, medMisc: 0, incomeComp: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, pAmount: 5000000 },
    { pid: "p_demo_2", insured: NAME, name: "住院醫療附約", insurer: "國泰人壽", bigCat: "人身", subtype: "住院醫療", policyKind: "附約", riderOf: "p_demo_1", owner: NAME, beneficiary: NAME, policyNo: "D-100001-A", premium: 24000, currency: "TWD", payYears: "", paidYears: "", effDate: "2011-05-01", termEnd: "", status: "有效", claimNote: "住院日額 2,000／實支實付 10 萬", cashValue: 0, life: 0, accident: 0, medical: 2000, medMisc: 100000, incomeComp: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, pAmount: 0 },
    { pid: "p_demo_3", insured: "林淑芬", name: "終身壽險", insurer: "南山人壽", bigCat: "人身", subtype: "終身壽險", policyKind: "主約", riderOf: "", owner: NAME, beneficiary: NAME, policyNo: "D-200001", premium: 66000, currency: "TWD", payYears: 20, paidYears: 12, effDate: "2013-09-01", termEnd: "", status: "有效", claimNote: "身故或全殘給付保額", cashValue: 780000, life: 3000000, accident: 0, medical: 0, medMisc: 0, incomeComp: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, pAmount: 3000000 },
  ];

  c.taxParams = { married: true, dependents: 2, otherDeduction: 0, profOccupation: "", profRate: 0, houseAssessed: 2800000, landAssessed: 1600000, carTax: 22000 };
  c.credit = { cards: 4, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: 720 };
  c.overseas = { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" };
  c.legacy = { heirs: 2, perHeirCash: 3000000, perHeirNote: "承翰若接班則以股權折抵", feedEstate: true };
  c.career = { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 0 };
  c.marriage = { plan: "否", age: "", budget: "", minBudget: "", importance: 0 };
  c.moneyStyle = { bookkeep: "曾記帳但中斷", budgeting: "有記錄無計劃", emergency: "已準備", emergencyAmt: 3200000 };

  // ── 規劃意圖：兩個企業議題會自動把企業主體打開 ──
  c.intent = {
    purposes: ["想處理公司與個人的財務界線", "想評估稅務合規風險", "想進行風險的保障評估", "有節稅需求，想進行節稅"],
    mustHave: ["事業退場規劃", "報酬結構優化", "企業風險保障", "退休生活規劃", "子女教養規劃", "傳承規劃"],
    targets: ["事業退場規劃", "報酬結構優化", "企業風險保障", "退休生活規劃", "子女教養規劃", "傳承規劃"],
    entities: { company: true },
  };

  // ── E1 公司概況 ──
  c.companies = [{
    cid: CO, name: "宏昇精密工業股份有限公司", taxId: "27418365", industry: "製造",
    org: "股份有限公司", setupYear: 2009, role: "董事長兼總經理", sharePct: 70,
    annualRevenue: 180000000, netProfit: 12000000, totalAsset: 120000000, totalDebt: 78000000,
    equity: 42000000,   // ＝ 總資產 − 總負債；填了才驗得動「資產 ＝ 負債 ＋ 權益」
    bookkeep: "查帳", accountant: "誠信聯合會計師事務所 · 王會計師 04-2258-xxxx",
    valueMethod: "淨值法", peMultiple: 4, valueManual: 0,
    oversea: "否", overseaPlace: "", overseaUse: "",
    // 第二批：十二個財報訊號的原料
    cash: 8000000, monthlyFixed: 9000000, retained: 36500000,
    ar: 54000000, inventory: 31000000, insExpense: 80000,
    topClientPct: 45, bookDiffPct: 12,
    note: "與兩位前同事共同創立，另兩位股東各持 15%。",
  }];
  c.bizYears = [
    { cid: CO, year: 2024, rev: 180000000, gross: 32400000, op: 15600000, net: 12000000, asset: 120000000, debt: 78000000 },
    { cid: CO, year: 2023, rev: 168000000, gross: 31900000, op: 15100000, net: 11500000, asset: 112000000, debt: 68000000 },
    { cid: CO, year: 2022, rev: 155000000, gross: 30200000, op: 14300000, net: 10800000, asset: 104000000, debt: 63000000 },
  ];
  // 401 六期。銷項稅額由「(銷售額 − 零稅率) × 5%」直接算出來，進項稅額才是給定值——
  // 這樣驗算層的「銷項 ＝ 應稅 × 5%」與「111 ＝ 107 − 108」一定對得上，
  // 對不上就代表我把資料寫錯了，而不是檢核寫錯了。
  //
  // 六期銷售額合計 1.86 億，比損益表的 1.8 億多 600 萬（3.3%）——這是刻意的：
  // 401 與帳載收入本來就會有差，示範案例要讓「差異調節表」有東西可以調。
  const vatRaw: [string, number, number, number][] = [
    // [期別, 銷售額, 其中零稅率, 得扣抵進項稅額]
    ["114-11/12", 32400000, 6800000, 520000],
    ["114-09/10", 30900000, 6100000, 510000],
    ["114-07/08", 29200000, 5900000, 1520000],   // 這一期進項大於銷項 → 走留抵
    ["114-05/06", 31600000, 6400000, 560000],
    ["114-03/04", 30000000, 5700000, 490000],
    ["114-01/02", 31900000, 6300000, 530000],
  ];
  // ⚠️ 留抵是「往後累積」的，一定要依時序算：vatRaw 是新的在前，所以先反轉成舊→新算完再轉回來。
  // 直接照顯示順序算會把上期留抵套到錯的期別上，畫面看起來很合理、數字卻是錯的。
  let carry = 0;
  c.vat401 = vatRaw.slice().reverse().map(([period, sales, zeroRate, inTax]) => {
    const outTax = Math.round((sales - zeroRate) * 0.05);
    const net = outTax - inTax;
    const payable = net >= 0 ? Math.max(0, net - carry) : 0;
    if (net < 0) carry += -net; else carry = Math.max(0, carry - net);
    return { cid: CO, period, sales, zeroRate, outTax, inTax, payable, carry };
  }).reverse();
  // 差異調節表刻意留空——那正是教練該做的事：逐項說明 401 為什麼跟帳載對不起來。
  c.reconcile = [];
  c.auditNotes = {};

  // ── E2 公私勾稽 ──
  c.ownerLoans = [
    { cid: CO, dir: "公司借我", amount: 3500000, hasNote: "否", interest: "否", crossYear: "是", note: "多年下來陸續拿的，沒有借據也沒計息" },
  ];
  c.guarantees = [
    { owner: NAME, bank: "第一銀行", item: "公司借款", limit: 40000000, balance: 32000000, due: "2029-06-30", coGuarantor: "另兩位股東", note: "廠房與設備擔保借款" },
    { owner: NAME, bank: "中國信託", item: "票貼", limit: 20000000, balance: 18000000, due: "2027-03-31", coGuarantor: "", note: "應收帳款週轉" },
    { owner: NAME, bank: "信保基金", item: "信保基金", limit: 12000000, balance: 10000000, due: "2028-12-31", coGuarantor: "", note: "疫情紓困轉一般週轉" },
  ];
  c.bizAssets = [
    { cid: CO, name: "BMW 530i", type: "車輛", value: 2800000, user: "本人", note: "登記公司名下，實際是本人與家人在用" },
    { cid: CO, name: "投資型保單", type: "保單", value: 3000000, user: "公司營運", note: "要保人與受益人皆為公司" },
  ];
  c.channels = [
    { cid: CO, kind: "薪資", annual: 960000, withhold: "已辦", doc: "齊全", note: "十年沒調過" },
    { cid: CO, kind: "董監酬勞", annual: 0, withhold: "不適用", doc: "無", note: "" },
    { cid: CO, kind: "盈餘分配(股利)", annual: 0, withhold: "不適用", doc: "無", note: "十六年來沒分配過" },
    { cid: CO, kind: "租金", annual: 0, withhold: "不適用", doc: "無", note: "廠房是租的，不是自有" },
    { cid: CO, kind: "借款", annual: 800000, withhold: "不適用", doc: "無", note: "臨時要用就先拿，年底再說" },
    { cid: CO, kind: "費用報銷", annual: 360000, withhold: "不適用", doc: "部分", note: "油資、餐敘、部分家庭消費" },
  ];

  // ── E3 報酬結構：現況 ＋ 兩個待評估的組合 ──
  c.compScenarios = [
    { name: "現況（薪資 96 萬）", salary: 960000, dividend: 0, rent: 0 },
    { name: "薪資為主", salary: 3000000, dividend: 0, rent: 0 },
    { name: "混合（薪資＋股利）", salary: 1800000, dividend: 2000000, rent: 0 },
  ];

  // ── E4 企業風險與保障 ──
  c.bizRisk = {
    bizCorp: "有缺口", bizCorpAmt: 0,
    bizKey: "未評估", bizKeyAmt: 0,
    bizShare: "未評估", bizShareAmt: 0,
  };

  // ── E5 合規閘：五個「否」，其中含第 4 題（一票否決）→ 紅燈 ──
  c.bizGate = {
    ans: { 0: "否", 1: "是", 2: "否", 3: "否", 4: "是", 5: "是", 6: "否", 7: "否", 8: "是", 9: "否" },
    savedAt: new Date().toISOString(),
  };

  // ── E6 退場與傳承 ──
  c.bizExit = {
    path: "傳承接班", age: 62, successor: "林承翰（長子，19 歲，就學中）", targetValue: 40000000,
    stage: "成熟期",
    deboss: { 0: "否", 1: "否", 2: "否", 3: "是", 4: "否" },
  };

  c.plan = { retireDelay: 0, movableToOverseas: 0, allocations: [] };
  c.nextReview = iso(45);
  c.reportNote = "";
  c.bizReportNote = "";
  return c;
}

function assertSeedAllowed() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").replace(/\/.*$/, "");
  if (!process.env.ALLOW_DESTRUCTIVE_SEED) {
    console.error(`\n⚠️  這個腳本會寫入資料庫：${host}\n確定要跑請帶：ALLOW_DESTRUCTIVE_SEED=1 npx tsx scripts/seed-biz-owner.ts\n`);
    process.exit(1);
  }
  console.log(`⚠️  seed-biz-owner.ts 將寫入：${host}`);
}

async function main() {
  const c = buildCase();
  const snap = planSnapshot(c);

  if (process.env.DRY_RUN) {
    console.log(`【空跑】${NAME} · ${c.companies[0].name}`);
    console.log(`  財務階段 grade=${snap.healthGrade}　淨值快照=${snap.netWorth?.toLocaleString()}`);
    console.log(JSON.stringify({ profile: c.profile.name, companies: c.companies.length, guarantees: c.guarantees.length, channels: c.channels.length }, null, 0));
    return;
  }

  assertSeedAllowed();
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  const admins = await db.select().from(coaches).where(eq(coaches.role, "admin"));
  const owner = admins.find((a) => a.email === "createray2020@gmail.com") ?? admins[0];
  if (!owner) throw new Error("找不到 admin 帳號");
  console.log(`owner = ${owner.name} <${owner.email}> (${owner.id})`);

  // 重跑保護：只清這個腳本自己種過的同名示範客戶
  const existing = await db.select().from(clients).where(eq(clients.coachId, owner.id));
  const dup = existing.filter((x) => x.name === NAME && (x.tags ?? []).includes("企業主"));
  for (const d of dup) {
    await db.delete(actionItems).where(eq(actionItems.clientId, d.id));
    await db.delete(reviews).where(eq(reviews.clientId, d.id));
    await db.delete(plans).where(eq(plans.clientId, d.id));
    await db.delete(clients).where(eq(clients.id, d.id));
  }
  if (dup.length) console.log(`清除先前的同名示範客戶 ${dup.length} 位（重跑保護）`);

  const [cl] = await db.insert(clients).values({
    coachId: owner.id, name: NAME, status: "規劃中", lifeStage: "事業高峰",
    source: "同業轉介", contact: { phone: "0912-345-678", email: "demo.lin@example.com" },
    tags: DEMO_TAGS, birthDate: birth(52),
  }).returning();

  const [p] = await db.insert(plans).values({
    clientId: cl.id, year: YEAR, label: `${YEAR}版`, status: "active", track: "coach",
    basedOnDate: iso(-21), data: c, healthGrade: snap.healthGrade, netWorth: snap.netWorth,
  }).returning();

  await db.insert(reviews).values({
    clientId: cl.id, planId: p.id, date: iso(-21), type: "初次諮詢", nextAppt: iso(45),
    summary: "從公司財報切入。三年報表與六期 401 都拿到了，401 的營收趨勢與帳載對得上。當場填完十題自我檢核，勾了五個否，其中第 4 題（付給個人的租金顧問費未辦扣繳）需要儘速轉介會計師。做出整合式個人資產負債表後，他對「流動性淨值」那個數字非常震驚——身家 5,000 多萬，真正動得了的不到 100 萬。",
    attendees: `${NAME}、林淑芬`,
  }).returning();

  const acts = [
    { title: "轉介會計師確認扣繳與補正可行性（§48-1 時效）", dueDate: iso(14), done: false },
    { title: "建立與公司完全無關的緊急預備金帳戶（先補到 6 個月家庭支出）", dueDate: iso(60), done: false },
    { title: "盤點三筆連帶保證的到期與解除條件，並試算壽險缺口", dueDate: iso(30), done: false },
    { title: "試算薪資／股利組合，五月申報前定案", dueDate: iso(120), done: false },
  ];
  for (const a of acts) {
    await db.insert(actionItems).values({ clientId: cl.id, title: a.title, owner: owner.name, dueDate: a.dueDate, done: a.done });
  }

  console.log(`✓ ${cl.name} → grade=${snap.healthGrade} net=${snap.netWorth?.toLocaleString()} plan=${p.id}`);
  console.log("✅ 企業主示範客戶寫入完成。");
}

const direct = !!(process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("seed-biz-owner.ts"));
if (direct) main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

export { buildCase };
