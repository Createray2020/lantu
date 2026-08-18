// 純新增：在 Ray（admin/owner）帳號下建 5 位「生命階段與財務結構各異」的示範客戶。
// 不跑既有 seed.ts、不動任何現有教練/客戶/公告。每位 tag=示範資料 方便一鍵清除。
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../src/Shared/db/schema";
import { sampleCase } from "../src/lib/engine";
import { planSnapshot } from "../src/lib/snapshot";

const { coaches, clients, plans, reviews, actionItems } = schema;
const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const DEMO_TAG = "示範資料";
const YEAR = 2025;

function isoAddDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function birth(age: number): string {
  return `${new Date().getFullYear() - age}-06-15`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// 以 sampleCase() 為骨架（保證 18 模組 key 齊全），整段覆蓋成各自的案件。
function build(overrides: any): any {
  const c: any = sampleCase();
  Object.assign(c.profile, overrides.profile);
  Object.assign(c.params, overrides.params);
  const keys = ["tracking", "riskQuiz", "members", "incomes", "expenses", "assets",
    "liabilities", "retire", "education", "goals", "travel", "hobby", "luxury",
    "needs", "coverages", "policies", "intent", "legacy", "career", "marriage",
    "credit", "overseas", "taxParams", "plan"];
  for (const k of keys) if (overrides[k] !== undefined) c[k] = overrides[k];
  if (overrides.nextReview !== undefined) c.nextReview = overrides.nextReview;
  return c;
}

// ─────────────────────────── 5 位人物誌 ───────────────────────────

// 1) 蘇柏睿 28 單身・軟體工程師・租屋（學貸未清、資產薄、積極型）
const P1 = build({
  profile: { name: "蘇柏睿", gender: "男", age: 28, retireAge: 65, lifeExp: 86, credit: 75 },
  params: { inflation: 1.5, salaryGrowth: 4, invReturn: 6, tuitionGrowth: 3, freeSaving: 1, planSaving: 0, emergencyMonths: 6, horizon: 86, invReturnStd: 14, inflationStd: 1, salaryStd: 1.5 },
  tracking: [{ year: 2024, age: 27, net: 120000 }, { year: 2025, age: 28, net: 250000 }],
  riskQuiz: { ans: { 0: 4, 1: 3, 2: 3, 3: 4, 4: 3, 5: 3, 6: 2, 7: 2, 8: 3, 9: 2, 10: 3, 11: 3 } },
  members: [{ name: "蘇柏睿", role: "本人", gender: "男", age: 28, worked: 5, insType: "勞保", insSalary: 45800, depRatio: 100, expRatio: 100, indepAge: "" }],
  incomes: [{ owner: "蘇柏睿", type: "工作", amount: 700000, growth: 4, start: 28, end: 65 }],
  expenses: [
    { name: "生活費用", cat: "生活", amount: 240000, infl: true, start: 28, end: 86, cut: 15 },
    { name: "房租", cat: "生活", amount: 216000, infl: true, start: 28, end: 40, cut: 10 },
    { name: "保險費", cat: "保險", amount: 24000, infl: false, start: 28, end: 86, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 15000, infl: false, start: 28, end: 65, cut: 0 },
  ],
  assets: [
    { name: "現金與活存", owner: "蘇柏睿", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 150000, value: 150000, ret: 0.5, income: 0, movable: true },
    { name: "定存", owner: "蘇柏睿", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 200000, value: 200000, ret: 1.2, income: 2400, movable: true },
    { name: "台股ETF(0050/006208)", owner: "蘇柏睿", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 280000, value: 300000, ret: 6, income: 9000, movable: true },
  ],
  liabilities: [
    { name: "就學貸款", owner: "蘇柏睿", mainCat: "信貸", currency: "台幣", fxRate: 1, balance: 400000, rate: 1.15, repay: "本息攤還", pay: 7000, months: 72, grace: 0, startAge: 26 },
  ],
  retire: { monthLiving: 40000, retireReturn: 4, retireInflation: 1.5, prepared: [{ item: "勞退新制", age: 65, amount: 1500000, method: "月領" }] },
  education: [],
  goals: [
    { name: "購車(國產)", type: "購車", present: 600000, minPresent: 450000, start: 33, end: 33, freq: 0, growth: "固定", imp: 3, prepared: 0, loanRatio: 40, appreciation: 0 },
    { name: "首購房頭期", type: "購屋", present: 3000000, minPresent: 2500000, start: 36, end: 36, freq: 0, growth: "通膨", imp: 4, prepared: 0, loanRatio: 80, appreciation: 2 },
  ],
  travel: [
    { cat: "國內", sub: "認知旅遊", start: 28, end: 80, freq: 4, amount: 15000, minAmount: 8000, imp: 3 },
    { cat: "國外", sub: "認知旅遊", start: 28, end: 70, freq: 1, amount: 80000, minAmount: 50000, imp: 4 },
  ],
  hobby: [{ sub: "體能類", start: 28, end: 75, freq: 12, amount: 2500, minAmount: 1500, imp: 2 }],
  luxury: [],
  needs: [{ member: "蘇柏睿", funeral: 500000, protectYears: 5, estateTax: 0, room: 2000, selfPay: 1500, nursing: 1500, firstCancer: 300000, cancerHosp: 2000, critical: 1000000, monthCare: 30000, careMonths: 120 }],
  coverages: [{ member: "蘇柏睿", kind: "壽險", comm: 0, social: 0 }, { member: "蘇柏睿", kind: "住院醫療", comm: 0, social: 0 }],
  policies: [
    { insured: "蘇柏睿", name: "定期壽險", premium: 6200, life: 2000000, accident: 1000000, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "蘇柏睿", name: "實支實付醫療", premium: 15800, life: 0, accident: 0, medical: 2000, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
  ],
  intent: { purposes: ["想增加收入", "想進行投資、活化資產", "想進行儲蓄，替未來準備"], targets: ["退休生活規劃", "購車規劃", "購屋規劃"], mustHave: ["購屋規劃"] },
  legacy: { heirs: 0, perHeirCash: 0, perHeirNote: "", feedEstate: false },
  career: { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 2 },
  marriage: { plan: "是", age: 33, budget: 800000, minBudget: 500000, importance: 3 },
  credit: { cards: 3, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "有辦卡", score: "" },
  overseas: { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" },
  taxParams: { married: false, dependents: 0, otherDeduction: 0, houseAssessed: 0, landAssessed: 0, carTax: 0 },
  plan: { retireDelay: 0, movableToOverseas: 0, allocations: [
    { name: "台股ETF核心", pct: 45, ret: 6.5, benefit: "長期資產增值" },
    { name: "美股成長型", pct: 30, ret: 7.5, benefit: "資產增值" },
    { name: "定期定額基金", pct: 15, ret: 5, benefit: "紀律累積" },
    { name: "生活預備金", pct: 10, ret: 1, benefit: "流動安全網" },
  ] },
  nextReview: isoAddDays(90),
});

// 2) 何宜蓁 34 新婚・雙薪・剛買房（房貸重、開始累積、穩健型）
const P2 = build({
  profile: { name: "何宜蓁", gender: "女", age: 34, retireAge: 65, lifeExp: 88, credit: 80 },
  params: { inflation: 1.5, salaryGrowth: 3, invReturn: 5, tuitionGrowth: 3, freeSaving: 1, planSaving: 0, emergencyMonths: 6, horizon: 88, invReturnStd: 11, inflationStd: 1, salaryStd: 1 },
  tracking: [{ year: 2024, age: 33, net: 5200000 }, { year: 2025, age: 34, net: 6300000 }],
  riskQuiz: { ans: { 0: 3, 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 7: 1, 8: 2, 9: 1, 10: 2, 11: 2 } },
  members: [
    { name: "何宜蓁", role: "本人", gender: "女", age: 34, worked: 10, insType: "勞保", insSalary: 45800, depRatio: 55, expRatio: 45, indepAge: "" },
    { name: "張凱翔", role: "配偶", gender: "男", age: 36, worked: 12, insType: "勞保", insSalary: 45800, depRatio: 45, expRatio: 45, indepAge: "" },
  ],
  incomes: [
    { owner: "何宜蓁", type: "工作", amount: 850000, growth: 3, start: 34, end: 65 },
    { owner: "張凱翔", type: "工作", amount: 950000, growth: 3, start: 34, end: 65 },
  ],
  expenses: [
    { name: "家庭生活費", cat: "生活", amount: 480000, infl: true, start: 34, end: 88, cut: 10 },
    { name: "孝親費", cat: "孝親", amount: 120000, infl: false, start: 34, end: 75, cut: 20 },
    { name: "保險費", cat: "保險", amount: 72000, infl: false, start: 34, end: 88, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 95000, infl: false, start: 34, end: 65, cut: 0 },
  ],
  assets: [
    { name: "現金與活存", owner: "何宜蓁", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 500000, value: 500000, ret: 0.5, income: 0, movable: true },
    { name: "定存", owner: "張凱翔", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 800000, value: 800000, ret: 1.2, income: 9600, movable: true },
    { name: "台股組合", owner: "何宜蓁", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 1100000, value: 1200000, ret: 6, income: 36000, movable: true },
    { name: "投資型保單", owner: "張凱翔", mainCat: "可投資資產", type: "基金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 800000, value: 800000, ret: 5, income: 24000, movable: true },
    { name: "自住房(新北)", owner: "何宜蓁", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 12000000, value: 12000000, ret: 0, income: 0, movable: false },
  ],
  liabilities: [
    { name: "房貸", owner: "何宜蓁", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 9000000, rate: 2.1, repay: "本息攤還", pay: 38000, months: 360, grace: 0, startAge: 34 },
  ],
  retire: { monthLiving: 60000, retireReturn: 4, retireInflation: 1.5, prepared: [{ item: "勞退新制", age: 65, amount: 3000000, method: "月領" }] },
  education: [],
  goals: [
    { name: "生育準備金", type: "其他", present: 500000, minPresent: 300000, start: 35, end: 35, freq: 0, growth: "固定", imp: 5, prepared: 0, loanRatio: 0, appreciation: 0 },
    { name: "換車", type: "購車", present: 900000, minPresent: 700000, start: 40, end: 40, freq: 0, growth: "固定", imp: 3, prepared: 0, loanRatio: 30, appreciation: 0 },
  ],
  travel: [
    { cat: "國內", sub: "認知旅遊", start: 34, end: 80, freq: 3, amount: 20000, minAmount: 12000, imp: 3 },
    { cat: "國外", sub: "認知旅遊", start: 34, end: 75, freq: 1, amount: 120000, minAmount: 80000, imp: 4 },
  ],
  hobby: [{ sub: "藝文類", start: 34, end: 80, freq: 6, amount: 4000, minAmount: 2000, imp: 2 }],
  luxury: [{ sub: "首飾配件", start: 35, end: 35, freq: 1, amount: 200000, minAmount: 0, imp: 2 }],
  needs: [
    { member: "何宜蓁", funeral: 600000, protectYears: 10, estateTax: 0, room: 2500, selfPay: 2000, nursing: 2000, firstCancer: 500000, cancerHosp: 2500, critical: 2000000, monthCare: 40000, careMonths: 120 },
    { member: "張凱翔", funeral: 600000, protectYears: 10, estateTax: 0, room: 2500, selfPay: 2000, nursing: 2000, firstCancer: 500000, cancerHosp: 2500, critical: 2000000, monthCare: 40000, careMonths: 120 },
  ],
  coverages: [
    { member: "何宜蓁", kind: "壽險", comm: 0, social: 0 }, { member: "何宜蓁", kind: "住院醫療", comm: 0, social: 0 },
    { member: "張凱翔", kind: "壽險", comm: 0, social: 0 },
  ],
  policies: [
    { insured: "何宜蓁", name: "終身壽險", premium: 42000, life: 2000000, accident: 0, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 300000 },
    { insured: "何宜蓁", name: "實支實付醫療", premium: 18000, life: 0, accident: 0, medical: 2500, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "張凱翔", name: "定期壽險", premium: 12000, life: 3000000, accident: 2000000, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
  ],
  intent: { purposes: ["想進行儲蓄，替未來準備", "想進行投資、活化資產", "想進行風險的保障評估"], targets: ["退休生活規劃", "子女教養規劃", "購屋規劃", "旅遊規劃"], mustHave: ["退休生活規劃", "子女教養規劃"] },
  legacy: { heirs: 0, perHeirCash: 0, perHeirNote: "", feedEstate: false },
  career: { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 2 },
  marriage: { plan: "否", age: "", budget: "", minBudget: "", importance: 0 },
  credit: { cards: 5, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: "" },
  overseas: { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" },
  taxParams: { married: true, dependents: 0, otherDeduction: 0, houseAssessed: 1500000, landAssessed: 2500000, carTax: 11230 },
  plan: { retireDelay: 0, movableToOverseas: 0, allocations: [
    { name: "股債均衡基金", pct: 40, ret: 5, benefit: "穩健成長" },
    { name: "台股核心ETF", pct: 25, ret: 6, benefit: "資產增值" },
    { name: "投資型保單", pct: 20, ret: 5, benefit: "壽險保障+累積" },
    { name: "生活預備金", pct: 15, ret: 1, benefit: "流動安全網" },
  ] },
  nextReview: isoAddDays(75),
});

// 3) 郭俊男 43 育兒・主管・三明治世代（2孩教育金＋孝親＋房貸中段）
const P3 = build({
  profile: { name: "郭俊男", gender: "男", age: 43, retireAge: 65, lifeExp: 85, credit: 82 },
  params: { inflation: 1.5, salaryGrowth: 2, invReturn: 5, tuitionGrowth: 3, freeSaving: 1, planSaving: 0, emergencyMonths: 6, horizon: 85, invReturnStd: 11, inflationStd: 1, salaryStd: 1 },
  tracking: [{ year: 2024, age: 42, net: 14200000 }, { year: 2025, age: 43, net: 15300000 }],
  riskQuiz: { ans: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 1, 10: 2, 11: 2 } },
  members: [
    { name: "郭俊男", role: "本人", gender: "男", age: 43, worked: 18, insType: "勞保", insSalary: 60800, depRatio: 100, expRatio: 40, indepAge: "" },
    { name: "徐婉婷", role: "配偶", gender: "女", age: 41, worked: 14, insType: "勞保", insSalary: 40100, depRatio: 0, expRatio: 30, indepAge: "" },
    { name: "郭承恩", role: "子女", gender: "男", age: 12, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 15, indepAge: 24 },
    { name: "郭語彤", role: "子女", gender: "女", age: 9, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 15, indepAge: 24 },
  ],
  incomes: [
    { owner: "郭俊男", type: "工作", amount: 1400000, growth: 2, start: 43, end: 65 },
    { owner: "徐婉婷", type: "工作", amount: 600000, growth: 2, start: 43, end: 60 },
  ],
  expenses: [
    { name: "家庭生活費", cat: "生活", amount: 720000, infl: true, start: 43, end: 85, cut: 10 },
    { name: "孝親費", cat: "孝親", amount: 240000, infl: false, start: 43, end: 72, cut: 20 },
    { name: "保險費", cat: "保險", amount: 150000, infl: false, start: 43, end: 85, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 160000, infl: false, start: 43, end: 65, cut: 0 },
  ],
  assets: [
    { name: "現金與活存", owner: "郭俊男", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 800000, value: 800000, ret: 0.5, income: 0, movable: true },
    { name: "定存", owner: "郭俊男", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 1500000, value: 1500000, ret: 1.2, income: 18000, movable: true },
    { name: "台股組合", owner: "郭俊男", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 1800000, value: 2000000, ret: 6, income: 60000, movable: true },
    { name: "投資型保單", owner: "徐婉婷", mainCat: "可投資資產", type: "基金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 3000000, value: 3000000, ret: 5, income: 90000, movable: true },
    { name: "自住房(台中)", owner: "郭俊男", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 15000000, value: 16000000, ret: 0, income: 0, movable: false },
  ],
  liabilities: [
    { name: "房貸", owner: "郭俊男", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 8000000, rate: 2, repay: "本息攤還", pay: 42000, months: 180, grace: 0, startAge: 38 },
  ],
  retire: { monthLiving: 55000, retireReturn: 4, retireInflation: 1.5, prepared: [{ item: "勞退新制", age: 65, amount: 3000000, method: "月領" }] },
  education: [
    { child: "郭承恩", stage: "大學", annual: 250000, years: 4, startIn: 6 },
    { child: "郭承恩", stage: "研究所", annual: 280000, years: 2, startIn: 10 },
    { child: "郭語彤", stage: "大學", annual: 250000, years: 4, startIn: 9 },
  ],
  goals: [
    { name: "換車", type: "購車", present: 1000000, minPresent: 700000, start: 46, end: 46, freq: 0, growth: "固定", imp: 3, prepared: 0, loanRatio: 30, appreciation: 0 },
    { name: "換屋", type: "購屋", present: 12000000, minPresent: 10000000, start: 52, end: 52, freq: 0, growth: "通膨", imp: 3, prepared: 0, loanRatio: 60, appreciation: 2 },
  ],
  travel: [
    { cat: "國內", sub: "認知旅遊", start: 43, end: 80, freq: 3, amount: 25000, minAmount: 15000, imp: 3 },
    { cat: "國外", sub: "認知旅遊", start: 43, end: 72, freq: 1, amount: 200000, minAmount: 120000, imp: 4 },
  ],
  hobby: [{ sub: "體能類", start: 43, end: 75, freq: 12, amount: 3000, minAmount: 2000, imp: 2 }],
  luxury: [{ sub: "名錶", start: 48, end: 48, freq: 1, amount: 300000, minAmount: 0, imp: 2 }],
  needs: [
    { member: "郭俊男", funeral: 800000, protectYears: 10, estateTax: 0, room: 3000, selfPay: 2000, nursing: 2000, firstCancer: 800000, cancerHosp: 3000, critical: 3000000, monthCare: 50000, careMonths: 120 },
    { member: "徐婉婷", funeral: 600000, protectYears: 8, estateTax: 0, room: 2500, selfPay: 1500, nursing: 1500, firstCancer: 500000, cancerHosp: 2500, critical: 2000000, monthCare: 40000, careMonths: 120 },
  ],
  coverages: [
    { member: "郭俊男", kind: "壽險", comm: 0, social: 0 }, { member: "郭俊男", kind: "住院醫療", comm: 0, social: 0 },
    { member: "郭俊男", kind: "重病給付", comm: 0, social: 0 },
    { member: "徐婉婷", kind: "壽險", comm: 0, social: 0 },
  ],
  policies: [
    { insured: "郭俊男", name: "終身壽險", premium: 68000, life: 3000000, accident: 1000000, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 600000 },
    { insured: "郭俊男", name: "重大傷病險", premium: 28000, life: 0, accident: 0, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 2000000, monthCare: 0, cashValue: 0 },
    { insured: "郭俊男", name: "實支實付醫療", premium: 22000, life: 0, accident: 0, medical: 3000, firstCancer: 300000, cancerHosp: 2000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "徐婉婷", name: "定期壽險", premium: 14000, life: 2000000, accident: 1000000, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
  ],
  intent: { purposes: ["想進行投資、活化資產", "有節稅需求，想進行節稅", "想進行風險的保障評估"], targets: ["退休生活規劃", "子女教養規劃", "購屋規劃", "孝親規劃"], mustHave: ["退休生活規劃", "子女教養規劃"] },
  legacy: { heirs: 2, perHeirCash: 8000000, perHeirNote: "留房各一間", feedEstate: true },
  career: { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 2 },
  marriage: { plan: "否", age: "", budget: "", minBudget: "", importance: 0 },
  credit: { cards: 6, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: "" },
  overseas: { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" },
  taxParams: { married: true, dependents: 2, otherDeduction: 0, houseAssessed: 2000000, landAssessed: 3500000, carTax: 18010 },
  plan: { retireDelay: 3, movableToOverseas: 3000000, allocations: [
    { name: "教育金專戶(債券基金)", pct: 25, ret: 4, benefit: "專款專用" },
    { name: "台股核心ETF", pct: 30, ret: 6, benefit: "資產增值" },
    { name: "投資型保單", pct: 20, ret: 5, benefit: "壽險+累積" },
    { name: "海外配置", pct: 15, ret: 6, benefit: "分散+傳承" },
    { name: "生活預備金", pct: 10, ret: 1, benefit: "流動安全網" },
  ] },
  nextReview: isoAddDays(60),
});

// 4) 楊麗雲 56 退休前・高階主管・有收租房（觸遺產稅級距、傳承/節稅）
const P4 = build({
  profile: { name: "楊麗雲", gender: "女", age: 56, retireAge: 62, lifeExp: 90, credit: 90 },
  params: { inflation: 1.5, salaryGrowth: 2, invReturn: 6, tuitionGrowth: 3, freeSaving: 1, planSaving: 0, emergencyMonths: 6, horizon: 90, invReturnStd: 12, inflationStd: 1, salaryStd: 1 },
  tracking: [{ year: 2024, age: 55, net: 57000000 }, { year: 2025, age: 56, net: 60000000 }],
  riskQuiz: { ans: { 0: 2, 1: 3, 2: 3, 3: 3, 4: 3, 5: 2, 6: 3, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2 } },
  members: [
    { name: "楊麗雲", role: "本人", gender: "女", age: 56, worked: 30, insType: "勞保", insSalary: 45800, depRatio: 100, expRatio: 50, indepAge: "" },
    { name: "林振國", role: "配偶", gender: "男", age: 58, worked: 32, insType: "勞保", insSalary: 45800, depRatio: 0, expRatio: 50, indepAge: "" },
  ],
  incomes: [
    { owner: "楊麗雲", type: "工作", amount: 2400000, growth: 2, start: 56, end: 62 },
    { owner: "林振國", type: "工作", amount: 1200000, growth: 1, start: 56, end: 63 },
    { owner: "楊麗雲", type: "理財", amount: 600000, growth: 2, start: 56, end: 90 },
  ],
  expenses: [
    { name: "家庭生活費", cat: "生活", amount: 960000, infl: true, start: 56, end: 90, cut: 5 },
    { name: "孝親費", cat: "孝親", amount: 120000, infl: false, start: 56, end: 70, cut: 20 },
    { name: "保險費", cat: "保險", amount: 260000, infl: false, start: 56, end: 90, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 420000, infl: false, start: 56, end: 62, cut: 0 },
  ],
  assets: [
    { name: "現金與活存", owner: "楊麗雲", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 2000000, value: 2000000, ret: 0.5, income: 0, movable: true },
    { name: "定存", owner: "楊麗雲", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 5000000, value: 5000000, ret: 1.3, income: 65000, movable: true },
    { name: "台股組合", owner: "楊麗雲", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 7000000, value: 8000000, ret: 6, income: 240000, movable: true },
    { name: "美股組合", owner: "林振國", mainCat: "可投資資產", type: "股票", cls: "流動", region: "美國", currency: "美金", fxRate: 32, cost: 110000, value: 125000, ret: 7, income: 2500, movable: true },
    { name: "投資型保單", owner: "楊麗雲", mainCat: "可投資資產", type: "基金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 6000000, value: 6000000, ret: 5, income: 180000, movable: true },
    { name: "自住房(台北)", owner: "楊麗雲", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 22000000, value: 25000000, ret: 0, income: 0, movable: false },
    { name: "收租套房", owner: "林振國", mainCat: "可投資資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 13000000, value: 15000000, ret: 0, income: 360000, movable: false },
  ],
  liabilities: [
    { name: "房貸(收租房)", owner: "林振國", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 5000000, rate: 2, repay: "本息攤還", pay: 30000, months: 120, grace: 0, startAge: 50 },
  ],
  retire: { monthLiving: 90000, retireReturn: 4, retireInflation: 1.5, prepared: [{ item: "勞退新制", age: 62, amount: 5000000, method: "一次領" }, { item: "商業年金", age: 62, amount: 6000000, method: "月領" }] },
  education: [],
  goals: [
    { name: "退休置產(渡假宅)", type: "置產", present: 8000000, minPresent: 6000000, start: 62, end: 62, freq: 0, growth: "通膨", imp: 3, prepared: 0, loanRatio: 0, appreciation: 2 },
  ],
  travel: [
    { cat: "國外", sub: "認知旅遊", start: 56, end: 80, freq: 2, amount: 300000, minAmount: 200000, imp: 5 },
    { cat: "國內", sub: "認知旅遊", start: 56, end: 85, freq: 4, amount: 40000, minAmount: 25000, imp: 3 },
  ],
  hobby: [{ sub: "藝文類", start: 56, end: 85, freq: 12, amount: 8000, minAmount: 5000, imp: 3 }],
  luxury: [{ sub: "珠寶", start: 58, end: 58, freq: 1, amount: 800000, minAmount: 0, imp: 3 }],
  needs: [
    { member: "楊麗雲", funeral: 1000000, protectYears: 5, estateTax: 4000000, room: 4000, selfPay: 3000, nursing: 3000, firstCancer: 1000000, cancerHosp: 4000, critical: 3000000, monthCare: 60000, careMonths: 180 },
    { member: "林振國", funeral: 1000000, protectYears: 5, estateTax: 4000000, room: 4000, selfPay: 3000, nursing: 3000, firstCancer: 1000000, cancerHosp: 4000, critical: 3000000, monthCare: 60000, careMonths: 180 },
  ],
  coverages: [
    { member: "楊麗雲", kind: "壽險", comm: 3000000, social: 0 }, { member: "楊麗雲", kind: "住院醫療", comm: 0, social: 0 },
    { member: "林振國", kind: "壽險", comm: 2000000, social: 0 },
  ],
  policies: [
    { insured: "楊麗雲", name: "終身壽險(高保額)", premium: 180000, life: 5000000, accident: 0, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 2500000 },
    { insured: "楊麗雲", name: "實支實付+癌症", premium: 42000, life: 0, accident: 0, medical: 4000, firstCancer: 500000, cancerHosp: 3000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "林振國", name: "終身壽險", premium: 120000, life: 3000000, accident: 0, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 1800000 },
  ],
  intent: { purposes: ["有節稅需求，想進行節稅", "想進行投資、活化資產", "人生模擬，了解一生金流"], targets: ["退休生活規劃", "傳承規劃", "旅遊規劃", "置產規劃"], mustHave: ["退休生活規劃", "傳承規劃"] },
  legacy: { heirs: 2, perHeirCash: 20000000, perHeirNote: "每人一間房+現金", feedEstate: true },
  career: { plan: "退休", switchAge: 62, switchFund: "", startupType: "", startupBudget: "", importance: 3 },
  marriage: { plan: "否", age: "", budget: "", minBudget: "", importance: 0 },
  credit: { cards: 8, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: "" },
  overseas: { hasAssets: "是", identity: "否", purpose: "投資、傳承", assetTypes: "股票、保單" },
  taxParams: { married: true, dependents: 0, otherDeduction: 0, houseAssessed: 4500000, landAssessed: 8000000, carTax: 28220 },
  plan: { retireDelay: 0, movableToOverseas: 20000000, allocations: [
    { name: "海外保單(傳承/節稅)", pct: 35, ret: 5, benefit: "資產保全、傳承、節稅" },
    { name: "全球股債配置", pct: 25, ret: 6, benefit: "資產增值" },
    { name: "台股高息", pct: 15, ret: 5.5, benefit: "現金流" },
    { name: "收租不動產", pct: 20, ret: 3, benefit: "穩定租金" },
    { name: "生活預備金", pct: 5, ret: 1, benefit: "流動安全網" },
  ] },
  nextReview: isoAddDays(30),
});

// 5) 曾德富 68 退休・已退休樂活・靠資產＋年金（醫療照護保障為重）
const P5 = build({
  profile: { name: "曾德富", gender: "男", age: 68, retireAge: 65, lifeExp: 88, credit: 85 },
  params: { inflation: 1.5, salaryGrowth: 0, invReturn: 3.5, tuitionGrowth: 3, freeSaving: 1, planSaving: 0, emergencyMonths: 12, horizon: 88, invReturnStd: 7, inflationStd: 1, salaryStd: 0.5 },
  tracking: [{ year: 2024, age: 67, net: 46500000 }, { year: 2025, age: 68, net: 46000000 }],
  riskQuiz: { ans: { 0: 0, 1: 1, 2: 0, 3: 1, 4: 0, 5: 1, 6: 1, 7: 0, 8: 1, 9: 0, 10: 1, 11: 1 } },
  members: [
    { name: "曾德富", role: "本人", gender: "男", age: 68, worked: 38, insType: "退休", insSalary: 0, depRatio: 100, expRatio: 55, indepAge: "" },
    { name: "何秀琴", role: "配偶", gender: "女", age: 66, worked: 20, insType: "退休", insSalary: 0, depRatio: 0, expRatio: 45, indepAge: "" },
  ],
  incomes: [
    { owner: "曾德富", type: "理財", amount: 480000, growth: 1, start: 68, end: 88, jsx: "" },
    { owner: "曾德富", type: "其他", amount: 240000, growth: 0, start: 68, end: 88 },
    { owner: "何秀琴", type: "其他", amount: 120000, growth: 0, start: 68, end: 88 },
  ],
  expenses: [
    { name: "家庭生活費", cat: "生活", amount: 600000, infl: true, start: 68, end: 88, cut: 5 },
    { name: "醫療保健費", cat: "生活", amount: 180000, infl: true, start: 68, end: 88, cut: 0 },
    { name: "保險費", cat: "保險", amount: 120000, infl: false, start: 68, end: 88, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 60000, infl: false, start: 68, end: 88, cut: 0 },
  ],
  assets: [
    { name: "現金與活存", owner: "曾德富", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 3000000, value: 3000000, ret: 0.5, income: 0, movable: true },
    { name: "定存", owner: "何秀琴", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 6000000, value: 6000000, ret: 1.3, income: 78000, movable: true },
    { name: "投資等級債券", owner: "曾德富", mainCat: "可投資資產", type: "債券", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 5000000, value: 5000000, ret: 3, income: 150000, movable: true },
    { name: "台股高息ETF", owner: "曾德富", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 3800000, value: 4000000, ret: 5, income: 200000, movable: true },
    { name: "自住房(高雄)", owner: "曾德富", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 16000000, value: 18000000, ret: 0, income: 0, movable: false },
    { name: "收租店面", owner: "曾德富", mainCat: "可投資資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 9000000, value: 10000000, ret: 0, income: 300000, movable: false },
  ],
  liabilities: [],
  retire: { monthLiving: 50000, retireReturn: 3.5, retireInflation: 1.5, prepared: [{ item: "勞保年金", age: 65, amount: 4000000, method: "月領" }, { item: "已備退休資產", age: 65, amount: 15000000, method: "自提" }] },
  education: [],
  goals: [
    { name: "환갑家族旅遊", type: "其他", present: 500000, minPresent: 300000, start: 70, end: 70, freq: 0, growth: "固定", imp: 4, prepared: 0, loanRatio: 0, appreciation: 0 },
  ],
  travel: [
    { cat: "國外", sub: "認知旅遊", start: 68, end: 78, freq: 1, amount: 250000, minAmount: 150000, imp: 4 },
    { cat: "國內", sub: "認知旅遊", start: 68, end: 85, freq: 6, amount: 30000, minAmount: 20000, imp: 4 },
  ],
  hobby: [{ sub: "休閒類", start: 68, end: 85, freq: 12, amount: 5000, minAmount: 3000, imp: 3 }],
  luxury: [],
  needs: [
    { member: "曾德富", funeral: 1000000, protectYears: 0, estateTax: 2000000, room: 4000, selfPay: 3000, nursing: 4000, firstCancer: 1000000, cancerHosp: 4000, critical: 2000000, monthCare: 80000, careMonths: 240 },
    { member: "何秀琴", funeral: 800000, protectYears: 0, estateTax: 1000000, room: 3500, selfPay: 2500, nursing: 3500, firstCancer: 800000, cancerHosp: 3500, critical: 1500000, monthCare: 70000, careMonths: 240 },
  ],
  coverages: [
    { member: "曾德富", kind: "住院醫療", comm: 0, social: 0 }, { member: "曾德富", kind: "每月照護", comm: 0, social: 0 },
    { member: "何秀琴", kind: "住院醫療", comm: 0, social: 0 },
  ],
  policies: [
    { insured: "曾德富", name: "終身醫療", premium: 55000, life: 0, accident: 0, medical: 3000, firstCancer: 0, cancerHosp: 2000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "曾德富", name: "長照險", premium: 65000, life: 0, accident: 0, medical: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 30000, cashValue: 0 },
    { insured: "何秀琴", name: "終身醫療", premium: 48000, life: 0, accident: 0, medical: 2500, firstCancer: 0, cancerHosp: 2000, critical: 0, monthCare: 0, cashValue: 0 },
  ],
  intent: { purposes: ["想進行風險的保障評估", "有節稅需求，想進行節稅", "想進行投資、活化資產"], targets: ["退休生活規劃", "傳承規劃", "旅遊規劃"], mustHave: ["退休生活規劃", "傳承規劃"] },
  legacy: { heirs: 3, perHeirCash: 10000000, perHeirNote: "現金+不動產分配", feedEstate: true },
  career: { plan: "退休", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 0 },
  marriage: { plan: "否", age: "", budget: "", minBudget: "", importance: 0 },
  credit: { cards: 4, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: "" },
  overseas: { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" },
  taxParams: { married: true, dependents: 0, otherDeduction: 0, houseAssessed: 3500000, landAssessed: 6000000, carTax: 11230 },
  plan: { retireDelay: 0, movableToOverseas: 10000000, allocations: [
    { name: "投資等級債券", pct: 35, ret: 3, benefit: "穩定現金流" },
    { name: "台股高息ETF", pct: 20, ret: 5, benefit: "股息收入" },
    { name: "定存/貨幣", pct: 25, ret: 1.3, benefit: "保本" },
    { name: "收租不動產", pct: 15, ret: 3, benefit: "租金收入" },
    { name: "醫療長照保單", pct: 5, ret: 0, benefit: "照護保障" },
  ] },
  nextReview: isoAddDays(45),
});

type Seed = {
  case: any;
  lifeStage: string;
  status: string;
  source: string;
  tags: string[];
  contact: any;
  reviews: { date: string; type: string; nextAppt: string; summary: string }[];
  actions: { title: string; dueDate: string; done: boolean }[];
};

const OWNER_NAME = "立揚 雷";
export const SEEDS: Seed[] = [
  {
    case: P1, lifeStage: "單身", status: "active", source: "自來", tags: [DEMO_TAG, "青年族群"],
    contact: { phone: "0912-345-678", email: "borui.su@example.com", line: "borui_su" },
    reviews: [{ date: isoAddDays(-20), type: "初談", nextAppt: isoAddDays(3), summary: "首次諮詢·現金流盤點與學貸償還規劃" }],
    actions: [
      { title: "建立每月定期定額投資（3,000起）", dueDate: isoAddDays(7), done: false },
      { title: "補齊風險屬性問卷細節", dueDate: isoAddDays(3), done: false },
    ],
  },
  {
    case: P2, lifeStage: "新婚", status: "active", source: "轉介", tags: [DEMO_TAG, "雙薪家庭"],
    contact: { phone: "0922-118-334", email: "yizhen.ho@example.com", line: "yizhen_h" },
    reviews: [
      { date: isoAddDays(-45), type: "初談", nextAppt: isoAddDays(10), summary: "新婚家庭財務整合·房貸與生育金規劃" },
      { date: isoAddDays(-15), type: "季檢視", nextAppt: isoAddDays(75), summary: "保障缺口檢視·夫妻壽險補強" },
    ],
    actions: [
      { title: "交付 2025 規劃建議書", dueDate: isoAddDays(10), done: false },
      { title: "評估生育金專戶方案", dueDate: isoAddDays(14), done: false },
    ],
  },
  {
    case: P3, lifeStage: "育兒", status: "active", source: "轉介", tags: [DEMO_TAG, "三明治世代"],
    contact: { phone: "0933-627-901", email: "junnan.kuo@example.com", line: "kuo_jn" },
    reviews: [
      { date: isoAddDays(-60), type: "半年檢視", nextAppt: isoAddDays(6), summary: "年度財務健檢·教育金與退休缺口" },
      { date: isoAddDays(-10), type: "臨時", nextAppt: isoAddDays(-3), summary: "子女教育金試算（逾期待處理）" },
    ],
    actions: [
      { title: "設定兩位子女教育金專戶", dueDate: isoAddDays(-2), done: false },
      { title: "退休缺口補足方案報價", dueDate: isoAddDays(5), done: false },
    ],
  },
  {
    case: P4, lifeStage: "退休前", status: "active", source: "轉介", tags: [DEMO_TAG, "高資產"],
    contact: { phone: "0955-880-217", email: "liyun.yang@example.com", line: "yang_ly" },
    reviews: [
      { date: isoAddDays(-30), type: "年度重製", nextAppt: isoAddDays(2), summary: "2025 年度重製·遺產稅試算與傳承架構" },
    ],
    actions: [
      { title: "海外保單傳承架構提案", dueDate: isoAddDays(2), done: false },
      { title: "遺產稅預估與稅源預留試算", dueDate: isoAddDays(7), done: false },
    ],
  },
  {
    case: P5, lifeStage: "退休", status: "active", source: "轉介", tags: [DEMO_TAG, "樂活退休"],
    contact: { phone: "0966-330-145", email: "defu.tseng@example.com", line: "tseng_df" },
    reviews: [
      { date: isoAddDays(-40), type: "半年檢視", nextAppt: isoAddDays(20), summary: "退休現金流檢視·醫療長照保障盤點" },
    ],
    actions: [
      { title: "長照保障缺口補強評估", dueDate: isoAddDays(12), done: false },
      { title: "資產傳承分配與贈與規劃", dueDate: isoAddDays(20), done: false },
    ],
  },
];


// 破壞性腳本防呆（同 seed.ts）：.env.local 指向的是正式 Neon，必須明確帶旗標才跑。
function assertSeedAllowed(scriptName: string): void {
  const url = process.env.DATABASE_URL || "";
  const host = (/@([^/?]+)/.exec(url)?.[1]) || "(未知)";
  if (!process.env.ALLOW_DESTRUCTIVE_SEED) {
    console.error(
      `\n拒絕執行 ${scriptName}：這是破壞性腳本（會刪除既有資料）。\n` +
      `目標資料庫：${host}\n` +
      `確定要跑的話請帶：ALLOW_DESTRUCTIVE_SEED=1 npx tsx scripts/${scriptName}\n`,
    );
    process.exit(1);
  }
  console.log(`⚠️  ${scriptName} 將寫入資料庫：${host}`);
}

async function main() {
  assertSeedAllowed("seed-demo-clients.ts");
  const admins = await db.select().from(coaches).where(eq(coaches.role, "admin"));
  const owner = admins.find((a) => a.email === "createray2020@gmail.com") ?? admins[0];
  if (!owner) throw new Error("找不到 admin 帳號");
  console.log(`owner = ${owner.name} <${owner.email}> (${owner.id})`);

  const names = SEEDS.map((s) => s.case.profile.name);
  // 清掉本腳本先前種過的同名示範客戶（tag=示範資料 且同名），避免重跑重複。
  const existing = await db.select().from(clients).where(eq(clients.coachId, owner.id));
  const dupIds = existing
    .filter((c) => (c.tags ?? []).includes(DEMO_TAG) && names.includes(c.name))
    .map((c) => c.id);
  if (dupIds.length) {
    await db.delete(actionItems).where(inArray(actionItems.clientId, dupIds));
    await db.delete(reviews).where(inArray(reviews.clientId, dupIds));
    await db.delete(plans).where(inArray(plans.clientId, dupIds));
    await db.delete(clients).where(inArray(clients.id, dupIds));
    console.log(`清除先前同名示範客戶 ${dupIds.length} 位（重跑保護）`);
  }

  for (const s of SEEDS) {
    const snap = planSnapshot(s.case);
    const [c] = await db.insert(clients).values({
      coachId: owner.id,
      name: s.case.profile.name,
      status: s.status,
      lifeStage: s.lifeStage,
      source: s.source,
      contact: s.contact,
      tags: s.tags,
      birthDate: birth(s.case.profile.age),
    }).returning();
    const [p] = await db.insert(plans).values({
      clientId: c.id, year: YEAR, label: `${YEAR}版`, status: "active",
      basedOnDate: isoAddDays(-30), data: s.case,
      healthGrade: snap.healthGrade, netWorth: snap.netWorth,
    }).returning();
    for (const r of s.reviews) {
      await db.insert(reviews).values({ clientId: c.id, planId: p.id, date: r.date, type: r.type, nextAppt: r.nextAppt, summary: r.summary, attendees: s.case.profile.name });
    }
    for (const a of s.actions) {
      await db.insert(actionItems).values({ clientId: c.id, title: a.title, owner: OWNER_NAME, dueDate: a.dueDate, done: a.done });
    }
    console.log(`✓ ${c.name}（${s.lifeStage}）→ grade=${snap.healthGrade} net=${snap.netWorth?.toLocaleString()} | reviews=${s.reviews.length} actions=${s.actions.length}`);
  }
  console.log("\n✅ 5 位示範客戶寫入完成。");
}

const __direct = !!(process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("seed-demo-clients.ts"));
if (__direct) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
