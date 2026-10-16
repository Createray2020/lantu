// 練習用客戶（Ray 名下，2026/10/16）——給「方案調整」練習用，刻意留下看得見、講得出來的缺口。
//
// 跟共用範本一樣要先過 lantu-app.html 的 migrateCase（保費投影／健保列／rowId），所以借用 build.mjs：
//   TPL_DIR=scripts/practice node scripts/templates/build.mjs   → scripts/practice/built.json
//   npx tsx scripts/practice/seed.ts                            → 寫進 Ray 名下（發客戶編號）
//
// 人物誌：許文凱 42 歲，單薪半家庭（太太兼職）、兩個孩子 10／7 歲、房貸 720 萬、媽媽 70 歲同住。
// 想做的事很多、彼此撞在一起：
//   ・60 歲就退休（比一般早五年）、退休後月花 8 萬
//   ・兩個孩子都要送出國念研究所（各 300 萬）
//   ・50 歲換大一點的房（價差＋裝潢 600 萬）、45 歲換車 130 萬
//   ・每年全家出國一次 20 萬、自己打高爾夫
// 但現況：年收 206 萬、扣掉房貸一年只剩三十幾萬、流動資產不到 200 萬、壽險只有 100 萬。
// 可以調的槓桿都留著：每一項目標都有「最低可接受」、支出都有可砍比例、太太兼職有拉成全職的空間、退休年齡可延。
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as E from "../../src/lib/engine";

type C = Record<string, any>;

function base(name: string): C {
  const c: C = E.newCase();
  c.profile.name = name;
  return c;
}

const RISK_MID = { 0: 1, 1: 1, 2: 2, 3: 1, 4: 1, 5: 2, 6: 1, 7: 2, 8: 1, 9: 2, 10: 1, 11: 2 };

export function practiceGap(): C {
  const c = base("許文凱");
  Object.assign(c.profile, {
    gender: "男", birth: "1984-03-09", age: 42, retireAge: 60, lifeExp: 88,
    jobType: "一般就業者", monthlySalary: 120000, jobCompany: "系統整合商", jobTitle: "專案經理",
    jobNote: "年薪 13 個月＋績效獎金約 1～2 個月",
  });
  Object.assign(c.params, {
    inflation: 2, salaryGrowth: 2.5, invReturn: 5, tuitionGrowth: 3,
    planSaving: 0, emergencyMonths: 6, horizon: 88,
  });
  c.credit = { cards: 4, payFull: "是", firstCardOver1yr: "是", installment: "有", badRecord5yr: "否", recentApply: "無", score: 735 };
  c.profile.credit = 735;
  c.riskQuiz = { ans: { ...RISK_MID } };

  c.members = [
    { name: "許文凱", role: "本人", gender: "男", age: 42, worked: 18, insType: "勞保", insSalary: 45800, nhiSalary: 120000, nhiDeps: 3, depRatio: 100, expRatio: 30, indepAge: "", jobType: "一般就業者", monthlySalary: 120000 },
    // 雅婷小兩歲：她 60 歲退出職場＝本人 62 歲。
    { name: "黃雅婷", role: "配偶", gender: "女", age: 40, worked: 12, insType: "勞保", insSalary: 30300, nhiSalary: 30300, nhiDeps: 0, depRatio: 0, expRatio: 25, indepAge: "", jobType: "一般就業者", monthlySalary: 30000 },
    { name: "許恩綺", role: "子女", gender: "女", age: 10, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 18, indepAge: 24 },
    { name: "許恩睿", role: "子女", gender: "男", age: 7, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 15, indepAge: 24 },
    // 媽媽同住，是孝親對象，不進需求分析表。
    { name: "許李秀英", role: "母", gender: "女", age: 70, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 12, indepAge: "" },
  ];

  c.incomes = [
    { name: "本人薪資（13 個月＋獎金）", owner: "許文凱", type: "工作", subType: "薪資", period: "年", amount: 1_700_000, growth: 2.5, start: 42, end: 60 },
    // 太太兼職：拉成全職是最明顯的收入槓桿（練習時可以拉）。
    { name: "配偶兼職（行政助理）", owner: "黃雅婷", type: "工作", subType: "兼職", period: "年", amount: 360_000, growth: 1, start: 42, end: 62 },
  ];

  c.expenses = [
    { name: "家庭生活費（五口）", cat: "生活", amount: 540_000, infl: true, start: 42, end: 88, cut: 10 },
    { name: "兩個孩子補習與才藝", cat: "生活", subCat: "教育/學習", amount: 150_000, infl: true, start: 42, end: 53, cut: 30 },
    { name: "交通與養車（油資・保養・稅・保險）", cat: "生活", subCat: "交通", amount: 96_000, infl: true, start: 42, end: 80, cut: 15 },
    { name: "綜合所得稅", cat: "稅賦", amount: 92_000, infl: false, start: 42, end: 60, cut: 0 },
    // 孝親：住在支出表（cat 孝親）。媽媽 70 歲，給到她 85 歲（本人 57）。
    { tag: "care", who: "許李秀英", name: "每月孝親金", cat: "孝親", subCat: "孝親金", period: "月", amount: 180_000, minAmount: 120_000, infl: true, cut: 0, once: false, start: 42, end: 57 },
  ];

  c.assets = [
    { name: "薪轉活存", owner: "許文凱", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 350_000, value: 350_000, ret: 0.5, income: 0, movable: true },
    { name: "定存", owner: "許文凱", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 300_000, value: 300_000, ret: 1.6, income: 4_800, movable: true },
    { name: "台股（個股為主）", owner: "許文凱", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 650_000, value: 800_000, ret: 5.5, income: 24_000, movable: true },
    { name: "配偶活存", owner: "黃雅婷", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 150_000, value: 150_000, ret: 0.5, income: 0, movable: true },
    { name: "配偶定期定額基金", owner: "黃雅婷", mainCat: "可投資資產", type: "基金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 360_000, value: 400_000, ret: 5, income: 0, movable: true },
    { name: "自住房（新北・三房）", owner: "許文凱", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 14_500_000, value: 18_000_000, ret: 0, income: 0, movable: false },
    { name: "2019 Toyota RAV4", owner: "許文凱", mainCat: "自用資產", type: "自用車輛", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 1_050_000, value: 500_000, ret: -8, income: 0, movable: false, sellable: true },
  ];
  c.liabilities = [
    { name: "房貸（新北自住）", owner: "許文凱", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 7_200_000, rate: 2.2, repay: "本息攤還", pay: 36_000, months: 240, grace: 0, startAge: 37 },
  ];

  // 退休：60 歲就想退（比法定早五年）→ 這是最大的缺口來源之一；練習時「延後退休」是現成的槓桿。
  c.retire = { monthLiving: 80_000, replaceRate: 70, retireReturn: 3.5, retireInflation: 1.5, prepared: [] };
  c.retireExpenses = [
    { name: "退休生活費（兩人）", cat: "生活", subCat: "餐食", period: "年", amount: 720_000, infl: true, startAge: "", endAge: "" },
    { name: "醫療與保健", cat: "生活", subCat: "醫療/健康", period: "年", amount: 150_000, infl: true, startAge: "", endAge: "" },
    { name: "退休旅遊（前十五年）", cat: "消費", subCat: "旅遊", period: "年", amount: 240_000, infl: true, startAge: 60, endAge: 75 },
    { name: "長期照護", cat: "生活", subCat: "醫療/健康", period: "年", amount: 480_000, infl: true, startAge: 83, endAge: "" },
  ];

  // 子女教育：兩個都要出國念研究所（各兩年、一年 150 萬）。startIn 是「距今幾年後」。
  c.education = [
    { child: "許恩綺", stage: "大學", annual: 260_000, years: 4, startIn: 8 },
    { child: "許恩綺", stage: "研究所", annual: 1_500_000, years: 2, startIn: 12 },
    { child: "許恩睿", stage: "大學", annual: 260_000, years: 4, startIn: 11 },
    { child: "許恩睿", stage: "研究所", annual: 1_500_000, years: 2, startIn: 15 },
  ];

  c.goals = [
    // 換車 45 歲：RAV4 勾可變賣（走 sellAid 可折價進頭期；練習時可以自己接）。
    { on: true, name: "換車（七人座休旅）", type: "購車", present: 1_300_000, minPresent: 900_000, start: 45, end: 45, latest: 48, freq: 0, growth: "固定", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 },
    // 換屋 50 歲：價差＋裝潢 600 萬（不是總價），貸五成。
    { on: true, name: "換屋價差與裝潢（四房）", type: "購屋", present: 6_000_000, minPresent: 4_000_000, start: 50, end: 50, latest: 55, freq: 0, growth: "固定", imp: 4, prepared: 0, loanRatio: 50, loanRate: 2.2, loanYears: 20, appreciation: 2 },
  ];
  c.travel = [
    { on: true, cat: "國外", sub: "消費旅遊", start: 42, end: 75, freq: 1, amount: 200_000, minAmount: 120_000, imp: 4 },
    { on: true, cat: "國內", sub: "鄉村旅遊", start: 42, end: 80, freq: 3, amount: 20_000, minAmount: 12_000, imp: 3 },
  ];
  c.hobby = [
    { on: true, sub: "體能類", start: 42, end: 70, freq: 12, amount: 8_000, minAmount: 3_000, imp: 3 },   // 高爾夫（球場＋球具）
  ];
  c.luxury = [
    { on: true, sub: "首飾配件", start: 50, end: 50, freq: 1, amount: 300_000, minAmount: 0, imp: 1 },   // 五十歲送自己一支錶
  ];

  // 短期資金需求：一年內換車頭期還沒存、兩年內恩綺國中畢業想送短期遊學。
  c.shortTerm = [
    { name: "恩綺暑期遊學（三週）", inYears: 2, amount: 250_000, minAmount: 150_000, prepared: 0, alt: "是" },
  ];

  c.needs = [
    // 保障年數 17：撐到老二（7 歲）24 歲經濟獨立。父母與未成年子女不進需求分析表。
    { member: "許文凱", funeral: 800_000, protectYears: 17, estateTax: 0, room: 2_500, selfPay: 2_000, nursing: 2_200, miscDaily: 3_000, incomeCompDay: 0, incomeCompMonth: 90_000, disability: 6_000_000, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 3_000_000, monthCare: 40_000, careMonths: 120 },
    { member: "黃雅婷", funeral: 800_000, protectYears: 17, estateTax: 0, room: 2_500, selfPay: 2_000, nursing: 2_200, miscDaily: 3_000, incomeCompDay: 0, incomeCompMonth: 30_000, disability: 4_000_000, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 3_000_000, monthCare: 40_000, careMonths: 120 },
  ];
  c.coverages = [
    { member: "許文凱", kind: "壽險", comm: 1_000_000, social: 0 },
    { member: "許文凱", kind: "住院醫療", comm: 2_000, social: 0 },
    { member: "黃雅婷", kind: "住院醫療", comm: 1_500, social: 0 },
  ];
  // 保單：典型「年輕時被推銷的終身型」——保費不低、壽險額度卻只有 100 萬，重病與失能都是空的。
  c.policies = [
    { insured: "許文凱", name: "終身壽險（20 年繳，已繳 15 年）", subtype: "終身壽險", premium: 46_000, life: 1_000_000, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 560_000 },
    { insured: "許文凱", name: "實支實付醫療（附約）", subtype: "醫療險", premium: 21_600, life: 0, accident: 0, medical: 2_000, medMisc: 150_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "許文凱", name: "意外險", subtype: "意外險", premium: 4_200, life: 0, accident: 3_000_000, medical: 0, medMisc: 50_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "黃雅婷", name: "實支實付醫療（定期）", subtype: "醫療險", premium: 17_800, life: 0, accident: 0, medical: 1_500, medMisc: 120_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "許恩綺", name: "兒童醫療綜合", subtype: "醫療險", premium: 11_200, life: 0, accident: 500_000, medical: 1_000, medMisc: 30_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 300_000, cancerHosp: 2_000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "許恩睿", name: "兒童醫療綜合", subtype: "醫療險", premium: 11_200, life: 0, accident: 500_000, medical: 1_000, medMisc: 30_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 300_000, cancerHosp: 2_000, critical: 0, monthCare: 0, cashValue: 0 },
  ];

  c.savings = [
    { name: "定期定額基金（太太的）", subCat: "定期定額ETF/基金", period: "月", amount: 10_000 },
  ];
  c.intent = {
    purposes: ["想進行儲蓄，替未來準備", "想進行風險的保障評估", "人生模擬，了解一生金流"],
    purposesCustom: ["60 歲退休到底做不做得到"],
    targets: ["子女教養規劃", "退休生活規劃", "購屋規劃", "購車規劃", "孝親規劃", "旅遊規劃", "休閒興趣規劃"],
    mustHave: ["子女教養規劃", "退休生活規劃"],
  };
  c.lifeGoals = [
    { name: "60 歲退休，不想做到 65", priority: 1, value: "身體還行的時候多陪太太走走", importance: 5, linkModule: "退休", note: "" },
    { name: "兩個孩子都能出國念研究所", priority: 2, value: "自己當年沒機會，不想讓他們也沒機會", importance: 5, linkModule: "教育", note: "" },
    { name: "50 歲前換四房，媽媽有自己的房間", priority: 3, value: "三代同堂住得開", importance: 4, linkModule: "置產", note: "" },
  ];
  c.legacy = { on: true, heirs: 2, perHeirCash: 2_000_000, perHeirNote: "兩個孩子各一筆成家起步金", feedEstate: false };
  c.taxParams = { married: true, dependents: 3, otherDeduction: 0, estateDeduction: 0, houseAssessed: 1_300_000, landAssessed: 3_200_000, carTax: 11_920 };
  c.plan = {
    retireDelay: 0, movableToOverseas: 0,
    allocations: [
      { name: "全球股票 ETF（定期定額）", pct: 50, ret: 6, benefit: "長期增值" },
      { name: "投資等級債 ETF", pct: 25, ret: 4, benefit: "降低波動" },
      { name: "教育金專戶（定存／儲蓄型）", pct: 15, ret: 2, benefit: "時間確定、不能承受波動" },
      { name: "生活預備金", pct: 10, ret: 1, benefit: "流動安全網" },
    ],
  };
  c.career = { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 1 };
  c.marriage = { plan: "否", age: "", budget: "", minBudget: "", importance: 0 };
  c.overseas = { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" };
  c.tracking = [
    { year: 2025, age: 41, net: 10_650_000 },
    { year: 2026, age: 42, net: 11_000_000 },
  ];
  c.nextReview = "2027-01-20";
  c.reportNote =
    "帳面淨值一千一百萬，但九成是住的那間房；真正動得了的錢不到兩百萬。" +
    "想做的事——60 歲退休、兩個孩子出國、50 歲換屋、45 歲換車——每一件單看都合理，疊在一起就是缺口。" +
    "這份規劃要回答的不是「夠不夠」，是「哪一件先讓步、讓多少」。";
  c.tags = ["練習用", "方案調整"];
  return c;
}

export const TEMPLATES = [
  { key: "practice", name: "許文凱", label: "42 歲・五口之家・想 60 歲退休＋兩個孩子出國", lifeStage: "家庭成長期", build: practiceGap },
];
