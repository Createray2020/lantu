// 五份共用示範範本的內容（2026 版）——這個檔案就是範本的原始碼。
//
// 三步驟（順序不能換，見 scripts/templates/README.md）：
//   1. node scripts/templates/build.mjs   把這裡的四份個案送進 lantu-app.html 的 migrateCase()
//                                          （syncPremium／syncNHI／ensureRowIds），並跑一次實地檢查
//   2. npx tsx scripts/templates/seed.ts  寫進資料庫（clients.is_template = true）
//
// ⚠️ 千萬不要跳過第 1 步直接寫資料庫：migrateCase／syncPremium 只存在於 lantu-app.html，
//    engine.ts 沒有這兩支。沒過那一關的個案，保費永遠不會出現在支出表裡，
//    每一位教練的示範畫面上「保費支出比」都會是 0%（紅字）。
//
// 設計原則（Ray 的主張）：
//   ・缺口是常態不是異常——四份都留著看得見、講得出來的缺口，不做成「什麼都補平」的樣板。
//   ・所有 start/end 都是**本人的年齡**（projection() 的時間軸是 c.profile.age），
//     配偶／子女的事件要換算回本人年齡，不能直接填他們自己的歲數。
//   ・保費不手寫進 expenses：由保單表投影（lantu-app.html 的 syncPremium），
//     健保費由 syncNHI() 自動產生。手寫會變成「自己跟自己對不上」。
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as E from "../../src/lib/engine";

type C = Record<string, any>;

/** 每一份都從 newCase() 長出來，確保欄位齊全（少一個欄位進 iframe 就是 undefined）。 */
function base(name: string): C {
  const c: C = E.newCase();
  c.profile.name = name;
  return c;
}

const RISK_MID = { 0: 1, 1: 1, 2: 2, 3: 1, 4: 1, 5: 2, 6: 1, 7: 2, 8: 1, 9: 2, 10: 1, 11: 2 };
const RISK_LOW = { 0: 0, 1: 1, 2: 1, 3: 1, 4: 0, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 0, 11: 1 };
const RISK_HIGH = { 0: 2, 1: 2, 2: 3, 3: 2, 4: 2, 5: 3, 6: 2, 7: 3, 8: 2, 9: 2, 10: 2, 11: 3 };

// ══════════════════════════════════════════════════════════════════
// 1｜雙薪育兒家庭　林家豪 38 歲
// 兩份薪水、兩個小孩、一間房貸。教練最常遇到的一種，也是「錢都有在動、
// 但沒有一件事準備得完整」的典型。
// ══════════════════════════════════════════════════════════════════
export function dualIncome(): C {
  const c = base("林家豪");
  Object.assign(c.profile, {
    gender: "男", birth: "1988-04-12", age: 38, retireAge: 65, lifeExp: 88,
    jobType: "一般就業者", monthlySalary: 88000, jobCompany: "電子零件製造", jobTitle: "產品經理",
  });
  Object.assign(c.params, {
    inflation: 2, salaryGrowth: 2.5, invReturn: 5, tuitionGrowth: 3,
    planSaving: 0, emergencyMonths: 6, horizon: 88,
  });
  c.credit = { cards: 4, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: 720 };
  c.profile.credit = 720;
  c.riskQuiz = { ans: { ...RISK_MID } };

  c.members = [
    { name: "林家豪", role: "本人", gender: "男", age: 38, worked: 14, insType: "勞保", insSalary: 45800, nhiSalary: 87600, nhiDeps: 2, depRatio: 100, expRatio: 32, indepAge: "" },
    { name: "陳怡君", role: "配偶", gender: "女", age: 36, worked: 11, insType: "勞保", insSalary: 36300, nhiSalary: 45800, nhiDeps: 0, depRatio: 0, expRatio: 28, indepAge: "" },
    { name: "林小雨", role: "子女", gender: "女", age: 6, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 22, indepAge: 24 },
    { name: "林小樹", role: "子女", gender: "男", age: 3, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 18, indepAge: 24 },
  ];

  c.incomes = [
    { owner: "林家豪", type: "工作", amount: 1_140_000, growth: 2.5, start: 38, end: 65 },
    // 陳怡君小兩歲：她 60 歲＝本人 62 歲。時間軸是本人的年齡。
    { owner: "陳怡君", type: "工作", amount: 840_000, growth: 2, start: 38, end: 62 },
  ];

  c.expenses = [
    { name: "家庭生活費", cat: "生活", amount: 600_000, infl: true, start: 38, end: 88, cut: 10 },
    // 小樹 3 歲，到他 21 歲＝本人 56 歲為止。
    { name: "托育與才藝", cat: "生活", amount: 264_000, infl: true, start: 38, end: 56, cut: 15 },
    { name: "孝親費", cat: "孝親", amount: 144_000, infl: false, start: 38, end: 76, cut: 10 },
    { name: "綜合所得稅", cat: "稅賦", amount: 96_000, infl: false, start: 38, end: 65, cut: 0 },
  ];

  c.assets = [
    { name: "薪轉活存", owner: "林家豪", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 420_000, value: 420_000, ret: 0.5, income: 0, movable: true },
    { name: "緊急預備金定存", owner: "陳怡君", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 500_000, value: 500_000, ret: 1.5, income: 7_500, movable: true },
    { name: "台股 ETF（定期定額）", owner: "林家豪", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 1_050_000, value: 1_300_000, ret: 6, income: 39_000, movable: true },
    { name: "美股複委託", owner: "林家豪", mainCat: "可投資資產", type: "股票", cls: "流動", region: "美國", currency: "美金", fxRate: 31.5, cost: 18_000, value: 21_000, ret: 7, income: 300, movable: true },
    { name: "自住房（新北）", owner: "林家豪", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 12_800_000, value: 13_500_000, ret: 0, income: 0, movable: false },
  ];

  c.liabilities = [
    { name: "房貸", owner: "林家豪", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 9_200_000, rate: 2.1, repay: "本息攤還", pay: 38_300, months: 312, grace: 0, startAge: 36 },
  ];

  c.retire = {
    monthLiving: 65_000, replaceRate: 70, retireReturn: 3.5, retireInflation: 1.5,
    prepared: [
      { item: "勞保老年年金", age: 65, amount: 21_000, method: "月領" },
      { item: "勞退新制個人專戶", age: 65, amount: 2_400_000, method: "一次領" },
    ],
  };
  c.retireExpenses = [
    { name: "退休生活費", cat: "生活", subCat: "餐食", period: "年", amount: 480_000, infl: true, startAge: "", endAge: "" },
    { name: "醫療與保健", cat: "生活", subCat: "醫療/健康", period: "年", amount: 120_000, infl: true, startAge: "", endAge: "" },
    { name: "退休旅遊（前十年）", cat: "消費", subCat: "旅遊", period: "年", amount: 180_000, infl: true, startAge: 65, endAge: 75 },
    { name: "長期照護", cat: "生活", subCat: "醫療/健康", period: "年", amount: 420_000, infl: true, startAge: 82, endAge: "" },
  ];

  // startIn＝距今幾年。小雨 6 歲，18 歲上大學 → 12 年後；小樹 3 歲 → 15 年後。
  c.education = [
    { child: "林小雨", stage: "大學", annual: 250_000, years: 4, startIn: 12 },
    { child: "林小雨", stage: "研究所", annual: 280_000, years: 2, startIn: 16 },
    { child: "林小樹", stage: "大學", annual: 250_000, years: 4, startIn: 15 },
    { child: "林小樹", stage: "研究所", annual: 280_000, years: 2, startIn: 19 },
  ];

  c.goals = [
    // ⚠️ 車貸不填成數：引擎的購置貸款只做購屋／置產（車子不該被算成保值資產），
    //    填了也不會生效，留著只會讓人以為它有作用。
    { name: "換車", type: "購車", present: 900_000, minPresent: 600_000, start: 45, end: 45, freq: 0, growth: "固定", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 },
    // 賣舊買新：填的是**價差＋裝潢稅費**，不是新房總價。舊房子與舊房貸都還在模型裡跑
    //（引擎沒有「賣掉一間房、清掉一筆貸款」這個動作），所以只把實際多借的那一段放進來。
    // 六成貸款、2.15%、20 年 —— 三個欄位齊全，引擎會自己拆成頭期款＋逐年月付（見 goalLoans）。
    { name: "換屋價差與裝潢", type: "購屋", present: 5_400_000, minPresent: 4_200_000, start: 52, end: 52, freq: 0, growth: "固定", imp: 4, prepared: 0, loanRatio: 60, loanRate: 2.15, loanYears: 20, appreciation: 2 },
  ];
  c.travel = [
    { cat: "國內", sub: "認知旅遊", start: 38, end: 80, freq: 2, amount: 25_000, minAmount: 18_000, imp: 4 },
    { cat: "國外", sub: "認知旅遊", start: 40, end: 78, freq: 2, amount: 180_000, minAmount: 120_000, imp: 4 },
  ];
  c.hobby = [{ sub: "體能類", start: 38, end: 75, freq: 12, amount: 2_500, minAmount: 1_500, imp: 2 }];
  c.luxury = [{ sub: "首飾配件", start: 40, end: 40, freq: 1, amount: 150_000, minAmount: 0, imp: 1 }];

  c.needs = [
    // protectYears 20：撐到小樹經濟獨立為止，這是雙薪育兒家庭壽險需求的真正長度。
    { member: "林家豪", funeral: 800_000, protectYears: 20, estateTax: 0, room: 2_500, selfPay: 2_000, nursing: 2_200, miscDaily: 3_000, incomeCompDay: 0, incomeCompMonth: 60_000, disability: 5_000_000, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 3_000_000, monthCare: 40_000, careMonths: 120 },
    { member: "陳怡君", funeral: 800_000, protectYears: 20, estateTax: 0, room: 2_500, selfPay: 2_000, nursing: 2_200, miscDaily: 3_000, incomeCompDay: 0, incomeCompMonth: 45_000, disability: 4_000_000, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 3_000_000, monthCare: 40_000, careMonths: 120 },
    // 兩個孩子：保障年數 0、扶養比 0——他們不是經濟支柱，壽險的需求就只有喪葬費。
    // 引擎會依角色自動不把「清償負債」與「準備教育金」算到他們頭上（needCoversDebt／
    // needCoversEdu），所以這裡列出來是安全的，全家保障地圖也才完整。
    { member: "林小雨", funeral: 300_000, protectYears: 0, estateTax: 0, room: 2_000, selfPay: 1_500, nursing: 0, miscDaily: 1_000, incomeCompDay: 0, incomeCompMonth: 0, disability: 1_000_000, firstCancer: 500_000, cancerHosp: 2_000, critical: 1_000_000, monthCare: 0, careMonths: 0 },
    { member: "林小樹", funeral: 300_000, protectYears: 0, estateTax: 0, room: 2_000, selfPay: 1_500, nursing: 0, miscDaily: 1_000, incomeCompDay: 0, incomeCompMonth: 0, disability: 1_000_000, firstCancer: 500_000, cancerHosp: 2_000, critical: 1_000_000, monthCare: 0, careMonths: 0 },
  ];
  // 公司團保：不是自己買的保單，但確實有保障，所以走 coverages 的 comm 欄。
  c.coverages = [
    { member: "林家豪", kind: "壽險", comm: 1_000_000, social: 0 },
    { member: "林家豪", kind: "住院醫療", comm: 1_000, social: 0 },
    { member: "陳怡君", kind: "壽險", comm: 600_000, social: 0 },
  ];
  c.policies = [
    { insured: "林家豪", name: "定期壽險（20 年期）", subtype: "定期壽險", premium: 12_400, life: 3_000_000, accident: 1_000_000, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "林家豪", name: "終身醫療（實支實付）", subtype: "醫療險", premium: 38_600, life: 0, accident: 0, medical: 1_500, medMisc: 60_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "林家豪", name: "重大傷病定期", subtype: "重大疾病險", premium: 15_200, life: 0, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 500_000, cancerHosp: 0, critical: 1_000_000, monthCare: 0, cashValue: 0 },
    { insured: "陳怡君", name: "定期壽險（20 年期）", subtype: "定期壽險", premium: 8_100, life: 2_000_000, accident: 1_000_000, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "陳怡君", name: "終身醫療", subtype: "醫療險", premium: 32_400, life: 0, accident: 0, medical: 1_200, medMisc: 50_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "林小雨", name: "兒童醫療綜合", subtype: "醫療險", premium: 12_800, life: 0, accident: 500_000, medical: 1_000, medMisc: 30_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 300_000, cancerHosp: 2_000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "林小樹", name: "兒童醫療綜合", subtype: "醫療險", premium: 12_800, life: 0, accident: 500_000, medical: 1_000, medMisc: 30_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 300_000, cancerHosp: 2_000, critical: 0, monthCare: 0, cashValue: 0 },
  ];

  c.savings = [
    { name: "定期定額 ETF", subCat: "定期定額ETF/基金", period: "月", amount: 15_000 },
    { name: "子女教育儲蓄", subCat: "定期定額ETF/基金", period: "月", amount: 6_000 },
  ];
  c.intent = {
    purposes: ["想進行儲蓄，替未來準備", "想進行風險的保障評估", "人生模擬，了解一生金流"],
    targets: ["子女教養規劃", "退休生活規劃", "購屋規劃", "旅遊規劃"],
    mustHave: ["子女教養規劃", "退休生活規劃"],
  };
  c.legacy = { on: true, heirs: 2, perHeirCash: 3_000_000, perHeirNote: "兩個孩子各一份起步金", feedEstate: false };
  c.taxParams = { married: true, dependents: 2, otherDeduction: 0, estateDeduction: 0, houseAssessed: 1_100_000, landAssessed: 2_600_000, carTax: 11_920 };
  c.plan = {
    retireDelay: 0, movableToOverseas: 0,
    allocations: [
      { name: "全球股票 ETF（定期定額加碼）", pct: 45, ret: 6, benefit: "資產增值" },
      { name: "投資等級債 ETF", pct: 25, ret: 4, benefit: "降低波動、月現金流" },
      { name: "教育金專戶（儲蓄型）", pct: 20, ret: 2.5, benefit: "指定用途、時間確定" },
      { name: "生活預備金", pct: 10, ret: 1, benefit: "流動安全網" },
    ],
  };
  c.career = { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 1 };
  c.marriage = { plan: "否", age: "", budget: "", minBudget: "", importance: 0 };
  c.overseas = { hasAssets: "是", identity: "否", purpose: "投資", assetTypes: "股票" };
  c.tracking = [
    { year: 2025, age: 37, net: 5_100_000 },
    { year: 2026, age: 38, net: 6_041_000 },
  ];
  c.nextReview = "2027-03-01";
  c.reportNote =
    "兩份薪水撐得起現在，撐不起同時來的三件事：兩個孩子的學費、換屋、退休。" +
    "這份規劃不是要你們少花，是把「什麼時候會一起發生」先攤開來看，再決定哪一件先讓步。";
  return c;
}

// ══════════════════════════════════════════════════════════════════
// 2｜單身上班族　吳宜靜 29 歲
// 收入不差、看起來也沒亂花，但錢留不下來：房租吃掉四分之一，
// 還有一筆進修信貸，保障只有公司團保。財務階段落在**整裝期**——
// 這一份的重點不是投資，是「先讓收支轉正、把預備金補起來」。
// ══════════════════════════════════════════════════════════════════
export function single(): C {
  const c = base("吳宜靜");
  Object.assign(c.profile, {
    gender: "女", birth: "1997-09-08", age: 29, retireAge: 65, lifeExp: 90,
    jobType: "一般就業者", monthlySalary: 58000, jobCompany: "行銷顧問公司", jobTitle: "資深專員",
  });
  Object.assign(c.params, {
    inflation: 2, salaryGrowth: 3, invReturn: 5, tuitionGrowth: 3,
    planSaving: 0, emergencyMonths: 6, horizon: 90,
  });
  c.credit = { cards: 2, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: 690 };
  c.profile.credit = 690;
  c.riskQuiz = { ans: { ...RISK_MID } };

  c.members = [
    { name: "吳宜靜", role: "本人", gender: "女", age: 29, worked: 6, insType: "勞保", insSalary: 45800, nhiSalary: 45800, nhiDeps: 0, depRatio: 100, expRatio: 100, indepAge: "" },
  ];
  c.incomes = [
    { owner: "吳宜靜", type: "工作", amount: 812_000, growth: 3, start: 29, end: 65 },
  ];
  c.expenses = [
    { name: "生活費（含伙食交通）", cat: "生活", amount: 336_000, infl: true, start: 29, end: 90, cut: 15 },
    { name: "房租", cat: "居住", amount: 264_000, infl: true, start: 29, end: 36, cut: 10 },
    { name: "孝親費", cat: "孝親", amount: 96_000, infl: false, start: 29, end: 70, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 26_000, infl: false, start: 29, end: 65, cut: 0 },
    // 房租只到 36 歲——那一年買房，房貸月付由購屋目標自己長出來（不要手寫，會重複）。
  ];
  c.assets = [
    { name: "活存", owner: "吳宜靜", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 62_000, value: 62_000, ret: 0.5, income: 0, movable: true },
    { name: "數位帳戶", owner: "吳宜靜", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 80_000, value: 80_000, ret: 1.8, income: 1_440, movable: true },
    { name: "市值型 ETF", owner: "吳宜靜", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 360_000, value: 402_000, ret: 6, income: 12_060, movable: true },
  ];
  c.liabilities = [
    { name: "就學貸款", owner: "吳宜靜", mainCat: "信貸", currency: "台幣", fxRate: 1, balance: 168_000, rate: 1.15, repay: "本息攤還", pay: 4_800, months: 36, grace: 0, startAge: 27 },
    // 進修那 40 萬是刷分期＋信貸湊的。年輕人的資產負債表上最常見、也最少被拿出來談的一列。
    { name: "信用貸款（進修）", owner: "吳宜靜", mainCat: "信貸", currency: "台幣", fxRate: 1, balance: 312_000, rate: 6.8, repay: "本息攤還", pay: 9_600, months: 36, grace: 0, startAge: 28 },
  ];
  c.retire = {
    monthLiving: 45_000, replaceRate: 70, retireReturn: 3.5, retireInflation: 1.5,
    prepared: [
      { item: "勞保老年年金", age: 65, amount: 19_000, method: "月領" },
      { item: "勞退新制個人專戶", age: 65, amount: 3_600_000, method: "一次領" },
    ],
  };
  c.retireExpenses = [
    { name: "退休生活費", cat: "生活", subCat: "餐食", period: "年", amount: 360_000, infl: true, startAge: "", endAge: "" },
    { name: "醫療與保健", cat: "生活", subCat: "醫療/健康", period: "年", amount: 120_000, infl: true, startAge: "", endAge: "" },
    { name: "退休旅遊（前十五年）", cat: "消費", subCat: "旅遊", period: "年", amount: 150_000, infl: true, startAge: 65, endAge: 80 },
    { name: "長期照護", cat: "生活", subCat: "醫療/健康", period: "年", amount: 480_000, infl: true, startAge: 84, endAge: "" },
  ];
  c.education = [];
  c.goals = [
    // 總價 1,100 萬、貸八成、2.1%、30 年。三個欄位齊全 → 引擎自己拆成
    // 「36 歲扣頭期款」＋「36–65 歲每年扣月付」，房子也會進固定資產（見 goalLoans）。
    { name: "買第一間房", type: "購屋", present: 11_000_000, minPresent: 9_000_000, start: 36, end: 36, freq: 0, growth: "固定", imp: 5, prepared: 0, loanRatio: 80, loanRate: 2.1, loanYears: 30, appreciation: 2 },
    { name: "進修（在職專班）", type: "其他", present: 400_000, minPresent: 300_000, start: 32, end: 32, freq: 0, growth: "固定", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 },
  ];
  c.travel = [
    { cat: "國內", sub: "認知旅遊", start: 29, end: 82, freq: 2, amount: 15_000, minAmount: 10_000, imp: 4 },
    { cat: "國外", sub: "認知旅遊", start: 29, end: 78, freq: 1, amount: 90_000, minAmount: 60_000, imp: 5 },
  ];
  c.hobby = [
    { sub: "體能類", start: 29, end: 80, freq: 12, amount: 2_000, minAmount: 1_200, imp: 3 },
    { sub: "藝文類", start: 29, end: 80, freq: 4, amount: 3_000, minAmount: 1_500, imp: 2 },
  ];
  c.luxury = [{ sub: "包款", start: 31, end: 31, freq: 1, amount: 80_000, minAmount: 0, imp: 1 }];

  c.needs = [
    // 單身無扶養：壽險需求主要是喪葬與清償，不需要二十年的收入替代——
    // 這一格填多少，是這份範本最好講的一個「需求不是越大越好」的例子。
    { member: "吳宜靜", funeral: 800_000, protectYears: 0, estateTax: 0, room: 2_500, selfPay: 2_000, nursing: 2_200, miscDaily: 2_500, incomeCompDay: 0, incomeCompMonth: 40_000, disability: 5_000_000, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 3_000_000, monthCare: 40_000, careMonths: 120 },
  ];
  c.coverages = [
    { member: "吳宜靜", kind: "壽險", comm: 500_000, social: 0 },
    { member: "吳宜靜", kind: "住院醫療", comm: 1_000, social: 0 },
  ];
  c.policies = [
    { insured: "吳宜靜", name: "意外險（附加傷害醫療）", subtype: "意外險", premium: 4_200, life: 0, accident: 2_000_000, medical: 0, medMisc: 30_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "吳宜靜", name: "實支實付醫療（定期）", subtype: "醫療險", premium: 9_600, life: 0, accident: 0, medical: 1_000, medMisc: 40_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
  ];
  c.savings = [{ name: "定期定額 ETF", subCat: "定期定額ETF/基金", period: "月", amount: 6_000 }];
  c.intent = {
    purposes: ["想進行儲蓄，替未來準備", "想進行投資、活化資產", "想進行風險的保障評估"],
    targets: ["購屋規劃", "退休生活規劃", "旅遊規劃", "職涯規劃"],
    mustHave: ["購屋規劃"],
  };
  c.legacy = { on: false, heirs: 0, perHeirCash: 0, perHeirNote: "", feedEstate: false };
  c.taxParams = { married: false, dependents: 0, otherDeduction: 0, estateDeduction: 0, houseAssessed: 0, landAssessed: 0, carTax: 0 };
  c.plan = {
    retireDelay: 0, movableToOverseas: 0,
    allocations: [
      { name: "全球股票 ETF", pct: 60, ret: 6.5, benefit: "資產增值" },
      { name: "購屋自備款專戶（貨幣型）", pct: 25, ret: 1.8, benefit: "時間確定、不能承受波動" },
      { name: "生活預備金", pct: 15, ret: 1, benefit: "流動安全網" },
    ],
  };
  c.career = { plan: "轉職", switchAge: 33, switchFund: 300_000, startupType: "", startupBudget: "", importance: 3 };
  c.marriage = { plan: "是", age: 34, budget: 800_000, minBudget: 500_000, importance: 3 };
  c.overseas = { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" };
  c.tracking = [
    { year: 2025, age: 28, net: 92_000 },
    { year: 2026, age: 29, net: 64_000 },
  ];
  c.nextReview = "2027-02-01";
  c.reportNote =
    "你不是亂花錢，是每一筆都剛剛好，所以什麼都留不下來。" +
    "先做三件事：把 6.8% 的信貸清掉、把預備金補到六個月、把只有團保的保障接起來。" +
    "投資可以晚一年開始，這三件不行。";
  return c;
}

// ══════════════════════════════════════════════════════════════════
// 3｜中年企業主　張永昌 52 歲
// 資產大部分綁在公司裡，個人與公司的界線沒有分開，遺產稅曝險明顯。
// 這一份的重點是「帳面上很有錢」跟「這些錢動得了嗎」是兩回事。
// ══════════════════════════════════════════════════════════════════
export function bizOwner(): C {
  const c = base("張永昌");
  Object.assign(c.profile, {
    gender: "男", birth: "1974-01-20", age: 52, retireAge: 68, lifeExp: 88,
    jobType: "企業主", monthlySalary: 200000, jobCompany: "永昌精密工業有限公司", jobTitle: "負責人",
  });
  Object.assign(c.params, {
    inflation: 2, salaryGrowth: 2, invReturn: 5, tuitionGrowth: 3,
    planSaving: 0, emergencyMonths: 6, horizon: 88,
  });
  c.company = {
    name: "永昌精密工業有限公司", taxId: "12345678", industry: "金屬加工／精密機械",
    role: "負責人", sharePct: 80, annualRevenue: 82_000_000, netProfit: 9_600_000, ownerLoan: 5_200_000,
    note: "公司名下無不動產，廠房為租賃；業務與報價高度依賴負責人本人。",
  };
  c.credit = { cards: 6, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: 760 };
  c.profile.credit = 760;
  c.riskQuiz = { ans: { ...RISK_HIGH } };

  c.members = [
    { name: "張永昌", role: "本人", gender: "男", age: 52, worked: 28, insType: "勞保", insSalary: 45800, nhiSalary: 182000, nhiDeps: 1, depRatio: 100, expRatio: 30, indepAge: "" },
    { name: "李美惠", role: "配偶", gender: "女", age: 50, worked: 18, insType: "勞保", insSalary: 36300, nhiSalary: 45800, nhiDeps: 0, depRatio: 0, expRatio: 25, indepAge: "" },
    { name: "張子瑜", role: "子女", gender: "女", age: 23, worked: 1, insType: "勞保", insSalary: 28800, nhiSalary: 29500, nhiDeps: 0, depRatio: 0, expRatio: 20, indepAge: 24 },
    { name: "張子睿", role: "子女", gender: "男", age: 19, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 25, indepAge: 25 },
  ];
  c.incomes = [
    { owner: "張永昌", type: "工作", amount: 2_400_000, growth: 2, start: 52, end: 68 },
    { owner: "張永昌", type: "理財", subType: "事業盈餘分配", amount: 3_200_000, growth: 1, start: 52, end: 70 },
    { owner: "李美惠", type: "工作", amount: 720_000, growth: 1.5, start: 52, end: 62 },
  ];
  c.expenses = [
    { name: "家庭生活費", cat: "生活", amount: 1_080_000, infl: true, start: 52, end: 88, cut: 15 },
    { name: "孝親費", cat: "孝親", amount: 240_000, infl: false, start: 52, end: 68, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 620_000, infl: false, start: 52, end: 70, cut: 0 },
    { name: "子女海外進修", cat: "生活", amount: 900_000, infl: true, start: 52, end: 56, cut: 10 },
  ];
  c.assets = [
    { name: "活存與外幣存款", owner: "張永昌", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 3_200_000, value: 3_200_000, ret: 0.8, income: 0, movable: true },
    { name: "公司股權（80%）", owner: "張永昌", mainCat: "可投資資產", type: "其他", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 5_000_000, value: 48_000_000, ret: 0, income: 0, movable: false },
    { name: "股東往來（公司欠負責人）", owner: "張永昌", mainCat: "可投資資產", type: "其他", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 5_200_000, value: 5_200_000, ret: 0, income: 0, movable: true },
    { name: "台股（自營）", owner: "張永昌", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 6_800_000, value: 8_400_000, ret: 6, income: 336_000, movable: true },
    { name: "美元保單（增額）", owner: "李美惠", mainCat: "可投資資產", type: "基金", cls: "流動", region: "海外", currency: "美金", fxRate: 31.5, cost: 190_000, value: 214_000, ret: 4, income: 0, movable: true },
    { name: "自住房（台中）", owner: "張永昌", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 18_000_000, value: 26_000_000, ret: 0, income: 0, movable: false },
    { name: "收租店面", owner: "李美惠", mainCat: "可投資資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 12_000_000, value: 15_000_000, ret: 0, income: 660_000, movable: false },
  ];
  c.liabilities = [
    { name: "自住房貸", owner: "張永昌", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 6_800_000, rate: 2.05, repay: "本息攤還", pay: 46_000, months: 168, grace: 0, startAge: 44 },
    { name: "店面貸款", owner: "李美惠", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 7_200_000, rate: 2.3, repay: "本息攤還", pay: 41_500, months: 216, grace: 0, startAge: 46 },
  ];
  c.retire = {
    monthLiving: 120_000, replaceRate: 65, retireReturn: 3.5, retireInflation: 1.5,
    prepared: [
      { item: "勞保老年年金", age: 65, amount: 22_000, method: "月領" },
      { item: "勞退新制個人專戶", age: 65, amount: 2_800_000, method: "一次領" },
      { item: "美元保單年金化", age: 68, amount: 45_000, method: "月領" },
    ],
  };
  c.retireExpenses = [
    { name: "退休生活費", cat: "生活", subCat: "餐食", period: "年", amount: 960_000, infl: true, startAge: "", endAge: "" },
    { name: "醫療與保健", cat: "生活", subCat: "醫療/健康", period: "年", amount: 240_000, infl: true, startAge: "", endAge: "" },
    { name: "退休旅遊（前十年）", cat: "消費", subCat: "旅遊", period: "年", amount: 400_000, infl: true, startAge: 68, endAge: 78 },
    { name: "長期照護", cat: "生活", subCat: "醫療/健康", period: "年", amount: 600_000, infl: true, startAge: 82, endAge: "" },
  ];
  c.education = [
    { child: "張子睿", stage: "研究所", annual: 320_000, years: 2, startIn: 4 },
  ];
  c.goals = [
    { name: "交棒／股權移轉規劃費用", type: "其他", present: 2_000_000, minPresent: 1_500_000, start: 58, end: 58, freq: 0, growth: "固定", imp: 5, prepared: 0, loanRatio: 0, appreciation: 0 },
    { name: "換車", type: "購車", present: 2_500_000, minPresent: 1_800_000, start: 55, end: 55, freq: 0, growth: "固定", imp: 2, prepared: 0, loanRatio: 0, appreciation: 0 },
  ];
  c.travel = [
    { cat: "國外", sub: "認知旅遊", start: 52, end: 80, freq: 1, amount: 400_000, minAmount: 250_000, imp: 4 },
    { cat: "國內", sub: "認知旅遊", start: 52, end: 84, freq: 3, amount: 40_000, minAmount: 25_000, imp: 3 },
  ];
  c.hobby = [{ sub: "體能類", start: 52, end: 80, freq: 8, amount: 6_000, minAmount: 3_000, imp: 3 }];
  c.luxury = [{ sub: "鐘錶", start: 54, end: 54, freq: 1, amount: 600_000, minAmount: 0, imp: 1 }];

  c.needs = [
    // estateTax：企業主的壽險需求裡最容易被漏掉的一格——它不是給家人生活用的，
    // 是讓繼承人有現金去繳稅，不必賤賣股權或不動產。
    { member: "張永昌", funeral: 1_500_000, protectYears: 10, estateTax: 8_000_000, room: 4_000, selfPay: 3_000, nursing: 2_800, miscDaily: 4_000, incomeCompDay: 0, incomeCompMonth: 120_000, disability: 10_000_000, firstCancer: 2_000_000, cancerHosp: 4_000, critical: 5_000_000, monthCare: 60_000, careMonths: 120 },
    { member: "李美惠", funeral: 1_200_000, protectYears: 8, estateTax: 2_000_000, room: 4_000, selfPay: 3_000, nursing: 2_800, miscDaily: 4_000, incomeCompDay: 0, incomeCompMonth: 60_000, disability: 6_000_000, firstCancer: 2_000_000, cancerHosp: 4_000, critical: 5_000_000, monthCare: 60_000, careMonths: 120 },
  ];
  c.coverages = [{ member: "張永昌", kind: "壽險", comm: 0, social: 0 }];
  c.policies = [
    { insured: "張永昌", name: "終身壽險（早期投保）", subtype: "終身壽險", premium: 186_000, life: 6_000_000, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 3_400_000 },
    { insured: "張永昌", name: "終身醫療＋重大疾病", subtype: "醫療險", premium: 92_000, life: 0, accident: 1_000_000, medical: 3_000, medMisc: 100_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 2_000_000, monthCare: 0, cashValue: 0 },
    { insured: "李美惠", name: "增額終身壽險", subtype: "增額/儲蓄壽險", premium: 240_000, life: 3_000_000, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 4_100_000 },
    { insured: "李美惠", name: "終身醫療", subtype: "醫療險", premium: 68_000, life: 0, accident: 0, medical: 2_500, medMisc: 80_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "張子睿", name: "醫療綜合", subtype: "醫療險", premium: 24_000, life: 0, accident: 1_000_000, medical: 1_500, medMisc: 50_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 500_000, cancerHosp: 2_000, critical: 0, monthCare: 0, cashValue: 0 },
  ];
  c.savings = [
    { name: "美元保單保費", subCat: "儲蓄保險保費", period: "年", amount: 240_000 },
    { name: "定期定額 ETF", subCat: "定期定額ETF/基金", period: "月", amount: 50_000 },
  ];
  c.intent = {
    purposes: ["有節稅需求，想進行節稅", "想處理公司與個人的財務界線", "想進行投資、活化資產", "想評估稅務合規風險"],
    targets: ["傳承規劃", "事業退場規劃", "退休生活規劃", "企業風險保障", "報酬結構優化"],
    mustHave: ["傳承規劃", "事業退場規劃"],
  };
  c.legacy = { on: true, heirs: 2, perHeirCash: 20_000_000, perHeirNote: "股權與不動產各一份，現金補平差額", feedEstate: true };
  c.taxParams = { married: true, dependents: 1, otherDeduction: 0, estateDeduction: 0, houseAssessed: 2_400_000, landAssessed: 6_800_000, carTax: 28_220 };
  c.plan = {
    retireDelay: 0, movableToOverseas: 12_000_000,
    allocations: [
      { name: "海外保單（現金流／傳承）", pct: 35, ret: 5, benefit: "增加理財收入、傳承、節稅" },
      { name: "美國股票與 ETF", pct: 25, ret: 6.5, benefit: "資產增值" },
      { name: "投資等級債", pct: 20, ret: 4.2, benefit: "月現金流" },
      { name: "遺產稅預留金（壽險）", pct: 15, ret: 2, benefit: "繳稅現金，不必賤賣股權" },
      { name: "生活預備金", pct: 5, ret: 1, benefit: "流動安全網" },
    ],
  };
  c.career = { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 2 };
  c.marriage = { plan: "否", age: "", budget: "", minBudget: "", importance: 0 };
  c.overseas = { hasAssets: "是", identity: "否", purpose: "投資", assetTypes: "保單、股票" };
  c.tracking = [
    { year: 2025, age: 51, net: 88_400_000 },
    { year: 2026, age: 52, net: 97_538_000 },
  ];
  c.nextReview = "2026-12-15";
  c.reportNote =
    "帳面淨值近億，但七成綁在公司股權與不動產上——真正動得了的現金不到一成。" +
    "先把「公司的錢」與「你的錢」分清楚，再處理稅與交棒；順序反過來會很貴。";
  return c;
}

// ══════════════════════════════════════════════════════════════════
// 4｜屆臨退休　黃文彬 60 歲
// 五年後就要把「累積」切換成「提領」。子女已獨立，房貸快清完，
// 剩下的問題是：這些錢夠領到幾歲、順序怎麼排、長照那一段誰扛。
// ══════════════════════════════════════════════════════════════════
export function preRetire(): C {
  const c = base("黃文彬");
  Object.assign(c.profile, {
    gender: "男", birth: "1966-06-30", age: 60, retireAge: 65, lifeExp: 90,
    jobType: "一般就業者", monthlySalary: 115000, jobCompany: "機械設備公司", jobTitle: "廠務經理",
  });
  Object.assign(c.params, {
    inflation: 2, salaryGrowth: 1.5, invReturn: 4.5, tuitionGrowth: 3,
    planSaving: 0, emergencyMonths: 12, horizon: 90,
  });
  c.credit = { cards: 3, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: 780 };
  c.profile.credit = 780;
  c.riskQuiz = { ans: { ...RISK_LOW } };

  c.members = [
    { name: "黃文彬", role: "本人", gender: "男", age: 60, worked: 33, insType: "勞保", insSalary: 45800, nhiSalary: 115500, nhiDeps: 0, depRatio: 100, expRatio: 52, indepAge: "" },
    { name: "周淑芬", role: "配偶", gender: "女", age: 58, worked: 20, insType: "勞保", insSalary: 30300, nhiSalary: 36300, nhiDeps: 0, depRatio: 0, expRatio: 48, indepAge: "" },
  ];
  c.incomes = [
    { owner: "黃文彬", type: "工作", amount: 1_495_000, growth: 1.5, start: 60, end: 65 },
    // 周淑芬小兩歲：她 60 歲＝本人 62 歲。
    { owner: "周淑芬", type: "工作", amount: 560_000, growth: 1, start: 60, end: 62 },
    { owner: "黃文彬", type: "其他", subType: "租金收入", amount: 216_000, growth: 0, start: 60, end: 90 }, // 老家小套房收租
  ];
  c.expenses = [
    { name: "家庭生活費", cat: "生活", amount: 660_000, infl: true, start: 60, end: 90, cut: 10 },
    { name: "孝親費（母親安養機構）", cat: "孝親", amount: 420_000, infl: false, start: 60, end: 72, cut: 0 },
    { name: "綜合所得稅", cat: "稅賦", amount: 118_000, infl: false, start: 60, end: 65, cut: 0 },
  ];
  c.assets = [
    { name: "活存", owner: "黃文彬", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 600_000, value: 600_000, ret: 0.6, income: 0, movable: true },
    { name: "定存（分年到期）", owner: "周淑芬", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 900_000, value: 900_000, ret: 1.8, income: 16_200, movable: true },
    { name: "高股息 ETF", owner: "黃文彬", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 1_600_000, value: 1_750_000, ret: 5, income: 87_500, movable: true },
    { name: "投資等級債 ETF", owner: "黃文彬", mainCat: "可投資資產", type: "債券", cls: "流動", region: "海外", currency: "台幣", fxRate: 1, cost: 900_000, value: 900_000, ret: 4.2, income: 37_800, movable: true },
    { name: "儲蓄險（已繳滿）", owner: "周淑芬", mainCat: "可投資資產", type: "基金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 1_000_000, value: 1_200_000, ret: 2.2, income: 0, movable: true },
    { name: "自住房（桃園）", owner: "黃文彬", mainCat: "自用資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 8_500_000, value: 17_500_000, ret: 0, income: 0, movable: false },
    { name: "老家小套房（收租）", owner: "黃文彬", mainCat: "可投資資產", type: "不動產", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 3_200_000, value: 4_800_000, ret: 0, income: 216_000, movable: false },
  ];
  c.liabilities = [
    { name: "房貸（尾款）", owner: "黃文彬", mainCat: "房貸", currency: "台幣", fxRate: 1, balance: 1_450_000, rate: 1.95, repay: "本息攤還", pay: 32_400, months: 48, grace: 0, startAge: 42 },
  ];
  c.retire = {
    monthLiving: 78_000, replaceRate: 70, retireReturn: 3, retireInflation: 1.5,
    prepared: [
      { item: "勞保老年年金（本人）", age: 65, amount: 24_500, method: "月領" },
      { item: "勞退新制個人專戶（本人）", age: 65, amount: 3_900_000, method: "一次領" },
      { item: "勞保老年年金（配偶）", age: 67, amount: 16_800, method: "月領" },
    ],
  };
  c.retireExpenses = [
    { name: "退休生活費", cat: "生活", subCat: "餐食", period: "年", amount: 840_000, infl: true, startAge: "", endAge: "" },
    { name: "醫療與保健", cat: "生活", subCat: "醫療/健康", period: "年", amount: 240_000, infl: true, startAge: "", endAge: "" },
    { name: "退休旅遊（前十年）", cat: "消費", subCat: "旅遊", period: "年", amount: 300_000, infl: true, startAge: 65, endAge: 75 },
    { name: "長期照護（兩人）", cat: "生活", subCat: "醫療/健康", period: "年", amount: 1_320_000, infl: true, startAge: 80, endAge: "" },
  ];
  c.education = [];
  c.goals = [
    { name: "老屋整修（無障礙）", type: "其他", present: 1_200_000, minPresent: 800_000, start: 64, end: 64, freq: 0, growth: "固定", imp: 4, prepared: 0, loanRatio: 0, appreciation: 0 },
    { name: "換車（最後一台）", type: "購車", present: 1_000_000, minPresent: 700_000, start: 63, end: 63, freq: 0, growth: "固定", imp: 2, prepared: 0, loanRatio: 0, appreciation: 0 },
  ];
  c.travel = [
    { cat: "國外", sub: "認知旅遊", start: 65, end: 78, freq: 1, amount: 250_000, minAmount: 150_000, imp: 5 },
    { cat: "國內", sub: "認知旅遊", start: 60, end: 84, freq: 4, amount: 30_000, minAmount: 20_000, imp: 4 },
  ];
  c.hobby = [{ sub: "體能類", start: 60, end: 85, freq: 12, amount: 2_000, minAmount: 1_200, imp: 4 }];
  c.luxury = [];

  c.needs = [
    // 子女已獨立、房貸快清完：壽險的需求正在縮小，但長照與醫療正在放大。
    // 這一份最好講的一句話是「保障不是越買越多，是換位置」。
    { member: "黃文彬", funeral: 1_000_000, protectYears: 5, estateTax: 1_200_000, room: 3_500, selfPay: 3_000, nursing: 2_800, miscDaily: 3_500, incomeCompDay: 0, incomeCompMonth: 0, disability: 3_000_000, firstCancer: 1_500_000, cancerHosp: 4_000, critical: 3_000_000, monthCare: 60_000, careMonths: 120 },
    { member: "周淑芬", funeral: 1_000_000, protectYears: 5, estateTax: 0, room: 3_500, selfPay: 3_000, nursing: 2_800, miscDaily: 3_500, incomeCompDay: 0, incomeCompMonth: 0, disability: 3_000_000, firstCancer: 1_500_000, cancerHosp: 4_000, critical: 3_000_000, monthCare: 60_000, careMonths: 120 },
  ];
  c.coverages = [{ member: "黃文彬", kind: "壽險", comm: 800_000, social: 0 }];
  c.policies = [
    { insured: "黃文彬", name: "終身壽險（已繳費期滿）", subtype: "終身壽險", premium: 0, life: 2_000_000, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 1_800_000 },
    { insured: "黃文彬", name: "終身醫療（日額型）", subtype: "醫療險", premium: 46_000, life: 0, accident: 0, medical: 2_000, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 2_000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "周淑芬", name: "終身醫療（日額型）", subtype: "醫療險", premium: 41_000, life: 0, accident: 0, medical: 2_000, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 2_000, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "周淑芬", name: "儲蓄壽險（已繳滿）", subtype: "增額/儲蓄壽險", premium: 0, life: 1_500_000, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 3_850_000 },
  ];
  c.savings = [{ name: "退休加碼（債券 ETF）", subCat: "定期定額ETF/基金", period: "月", amount: 30_000 }];
  c.intent = {
    purposes: ["人生模擬，了解一生金流", "想進行風險的保障評估", "想進行投資、活化資產"],
    targets: ["退休生活規劃", "孝親規劃", "旅遊規劃", "傳承規劃"],
    mustHave: ["退休生活規劃"],
  };
  c.legacy = { on: true, heirs: 2, perHeirCash: 6_000_000, perHeirNote: "自住房留給長子，現金補給次女", feedEstate: true };
  c.taxParams = { married: true, dependents: 1, otherDeduction: 0, estateDeduction: 0, houseAssessed: 1_600_000, landAssessed: 4_200_000, carTax: 15_210 };
  c.plan = {
    retireDelay: 2, movableToOverseas: 0,
    allocations: [
      { name: "配息型債券 ETF", pct: 40, ret: 4.2, benefit: "月現金流、波動低" },
      { name: "高股息股票 ETF", pct: 25, ret: 5, benefit: "現金流＋抗通膨" },
      { name: "即期年金／保單年金化", pct: 20, ret: 3, benefit: "活多久領多久，不怕活太久" },
      { name: "長照專款（定存）", pct: 15, ret: 1.8, benefit: "指定用途、隨時動用" },
    ],
  };
  c.career = { plan: "無", switchAge: "", switchFund: "", startupType: "", startupBudget: "", importance: 0 };
  c.marriage = { plan: "否", age: "", budget: "", minBudget: "", importance: 0 };
  c.overseas = { hasAssets: "否", identity: "否", purpose: "", assetTypes: "" };
  c.tracking = [
    { year: 2025, age: 59, net: 25_150_000 },
    { year: 2026, age: 60, net: 26_200_000 },
  ];
  c.nextReview = "2026-11-01";
  c.reportNote =
    "房子很好，現金不夠——這是最典型的一種「看起來很穩」。" +
    "照現在的步調，退休缺口約 2,566 萬，資產大約在 72 歲轉負，而八十歲以後那一段長照，" +
    "現在的保單接不住。這不是要你少過一點，是要先決定：哪一段自己扛、哪一段交給工具。";
  return c;
}

// ══════════════════════════════════════════════════════════════════
// 5｜準新人雙薪　周承翰 32 歲（2026/10 加，第五份）
// 半年後結婚、兩年內想生第一胎、三年內買房買車、還借了一筆錢給弟弟。
// 這一份的任務是把 2026/09 之後上線的新模組一次填滿：副業、婚禮明細、生育規劃、
// 「這一間房」規格估值＋預售付款時程＋裝修貸、「這一台車」規格＋貸款＋換車循環＋舊車折價、
// 孝親給付三種、未來入帳兩層、生活願望細節欄、自訂關注議題、短期資金需求，
// 以及用正式流程函式走到「執行期」的願景處理流程（見 TEMPLATES 的 walk）。
//
// 人物誌：兩個人都不是高薪，但也沒亂花；問題是「所有大事都擠在 33～39 歲」——
// 結婚、兩胎、買房（預售屋三年才交屋）、換車，而退休一個字都還沒準備。
// ══════════════════════════════════════════════════════════════════
export function newlyweds(): C {
  const c = base("周承翰");
  Object.assign(c.profile, {
    gender: "男", birth: "1994-06-18", age: 32, retireAge: 63, lifeExp: 90,
    jobType: "一般就業者", monthlySalary: 65000, jobCompany: "軟體公司", jobTitle: "前端工程師",
    jobNote: "年薪含兩個月年終；假日接攝影案",
  });
  Object.assign(c.params, {
    inflation: 2, salaryGrowth: 3, invReturn: 5, tuitionGrowth: 3,
    planSaving: 0, emergencyMonths: 6, horizon: 90,
  });
  c.credit = { cards: 3, payFull: "是", firstCardOver1yr: "是", installment: "無", badRecord5yr: "否", recentApply: "無", score: 780 };
  c.profile.credit = 780;
  c.riskQuiz = { ans: { ...RISK_HIGH, 2: 2, 5: 2 } };

  c.members = [
    { name: "周承翰", role: "本人", gender: "男", age: 32, worked: 8, insType: "勞保", insSalary: 45800, nhiSalary: 66800, nhiDeps: 0, depRatio: 100, expRatio: 50, indepAge: "", jobType: "一般就業者", monthlySalary: 65000 },
    // 芷晴小兩歲：她的事件要換算回本人年齡（她 60 歲退休＝本人 62 歲）。
    { name: "林芷晴", role: "配偶", gender: "女", age: 30, worked: 6, insType: "勞保", insSalary: 45800, nhiSalary: 53000, nhiDeps: 0, depRatio: 0, expRatio: 50, indepAge: "", jobType: "一般就業者", monthlySalary: 52000 },
    // 父母是孝親的對象（careSec 的「對象」連動這兩位）。不是經濟支柱、不進需求分析表。
    { name: "周志明", role: "父", gender: "男", age: 62, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 0, indepAge: "" },
    { name: "陳淑芬", role: "母", gender: "女", age: 60, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 0, indepAge: "" },
    // 兩個孩子由生育規劃（c.birthPlan ＋ walk 裡的 applyBirthPlan）長出來，這裡不手寫。
  ];

  // 生育規劃：第一胎本人 34 歲、第二胎 37 歲。applyBirthPlan 會長出未出生成員、生育一次性、0–2 歲育兒列。
  c.birthPlan = [
    { bid: "nw-b1", atAge: 34, delivery: "自然產", care: "月子中心", careMonths: 1 },
    { bid: "nw-b2", atAge: 37, delivery: "剖腹產", care: "到宅月嫂", careMonths: 2 },
  ];

  c.incomes = [
    { name: "本人薪資（含年終）", owner: "周承翰", type: "工作", subType: "薪資", period: "年", amount: 910_000, growth: 3, start: 32, end: 63 },
    // 副業＝incomes 裡 owner＝本人、side:true 的列（成員卡片與收支資債改的是同一列）。
    { name: "婚禮／活動攝影接案", owner: "周承翰", type: "工作", subType: "兼職", period: "月", amount: 180_000, growth: 0, start: 32, end: 45, side: true },
    { name: "配偶薪資", owner: "林芷晴", type: "工作", subType: "薪資", period: "年", amount: 728_000, growth: 2.5, start: 32, end: 62 },
    { name: "線上日文課程分潤", owner: "林芷晴", type: "工作", subType: "兼職", period: "月", amount: 60_000, growth: 0, start: 32, end: 40, side: true },
  ];

  c.expenses = [
    { name: "兩人生活費（餐食・交通・日用）", cat: "生活", amount: 540_000, infl: true, start: 32, end: 90, cut: 15 },
    // 房租到交屋前一年（預售 36 歲簽約、三年工程期 → 39 歲交屋）；walk 裡再用 houseStopRent 對齊一次。
    { name: "房租（兩房・新北）", cat: "居住", subCat: "居住(房租)", amount: 300_000, infl: true, start: 32, end: 38, cut: 0 },
    { name: "寵物（兩隻貓）", cat: "生活", subCat: "寵物", amount: 48_000, infl: true, start: 32, end: 46, cut: 20 },
    { name: "綜合所得稅", cat: "稅賦", amount: 62_000, infl: false, start: 32, end: 63, cut: 0 },
    // 孝親：住在支出表（cat 孝親）、引擎只讀這裡。三種給付各一筆。
    { tag: "care", who: "周志明", name: "每月孝親金", cat: "孝親", subCat: "孝親金", period: "月", amount: 120_000, minAmount: 72_000, infl: true, cut: 0, once: false, start: 32, end: 55 },
    { tag: "care", who: "陳淑芬", name: "過年紅包", cat: "孝親", subCat: "孝親金", period: "年", amount: 24_000, infl: true, cut: 0, once: false, start: 32, end: 57 },
    // 一次性：爸爸 70 歲那年（本人 40）帶爸媽環島一趟。進贈與稅檢核。
    { tag: "care", who: "周志明", name: "父母七十歲環島旅行", cat: "孝親", subCat: "孝親金", period: "年", amount: 150_000, infl: true, cut: 0, once: true, start: 40, end: 40 },
  ];

  c.assets = [
    { name: "薪轉活存", owner: "周承翰", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 280_000, value: 280_000, ret: 0.5, income: 0, movable: true },
    { name: "結婚基金定存", owner: "周承翰", mainCat: "可投資資產", type: "定存", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 450_000, value: 450_000, ret: 1.6, income: 7_200, movable: true },
    { name: "台股市值型 ETF", owner: "周承翰", mainCat: "可投資資產", type: "股票", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 560_000, value: 680_000, ret: 6, income: 20_400, movable: true },
    { name: "美股 ETF（複委託）", owner: "周承翰", mainCat: "可投資資產", type: "股票", cls: "流動", region: "美國", currency: "美金", fxRate: 31.5, cost: 10_000, value: 12_000, ret: 7, income: 150, movable: true },
    // 借給弟弟創業的錢：是資產但還沒收到。到期屬性＝35 歲一次收回 40 萬（未來入帳第一層）。
    { name: "借給弟弟（創業周轉）", owner: "周承翰", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 400_000, value: 400_000, ret: 0, income: "", movable: false,
      matureAge: 35, matureAmt: 400_000, matureMode: "一次", matureNote: "口頭約定 2029 年還清，無息" },
    // 現況車輛：勾「可變賣」，購車目標用 sellAid 把它折價進頭期（walk 裡接上）。
    { name: "2016 Toyota Altis（二手買入）", owner: "周承翰", mainCat: "自用資產", type: "自用車輛", cls: "固定", region: "台灣", currency: "台幣", fxRate: 1, cost: 380_000, value: 220_000, ret: -8, income: 0, movable: false, sellable: true },
    { name: "配偶活存", owner: "林芷晴", mainCat: "自用資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 180_000, value: 180_000, ret: 0.5, income: 0, movable: true },
    { name: "配偶定期定額基金", owner: "林芷晴", mainCat: "可投資資產", type: "基金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: 360_000, value: 410_000, ret: 5.5, income: 0, movable: true },
  ];
  c.liabilities = [
    { name: "就學貸款（最後兩年）", owner: "周承翰", mainCat: "信貸", currency: "台幣", fxRate: 1, balance: 86_000, rate: 1.15, repay: "本息攤還", pay: 3_650, months: 24, grace: 0, startAge: 26 },
  ];

  // 未來入帳第二層：還不是資產的預期款。把握度只折投影、不動淨值。
  c.futureInflows = [
    { on: true, name: "員工限制型股票解禁", source: "其他", owner: "周承翰", age: 34, amount: 600_000, prob: 80, mode: "一次", years: "", sellAid: "", note: "2028 年第二批解禁，依今日股價估" },
    { on: true, name: "父母贊助購屋頭期", source: "遺產贈與", owner: "周承翰", age: 36, amount: 1_500_000, prob: 90, mode: "一次", years: "", sellAid: "", note: "爸媽口頭答應，簽約那年給；在免稅額內" },
  ];

  // 退休：逐項口徑（mode 由 migrateCase 依明細列判定）。勞保勞退概算由 syncLaborPrepared 自動帶入。
  c.retire = { monthLiving: 60_000, replaceRate: 70, retireReturn: 3.5, retireInflation: 1.5, prepared: [] };
  c.retireExpenses = [
    { name: "退休生活費（兩人）", cat: "生活", subCat: "餐食", period: "年", amount: 540_000, infl: true, startAge: "", endAge: "" },
    { name: "醫療與保健", cat: "生活", subCat: "醫療/健康", period: "年", amount: 120_000, infl: true, startAge: "", endAge: "" },
    { name: "退休旅遊（前十五年）", cat: "消費", subCat: "旅遊", period: "年", amount: 150_000, infl: true, startAge: 63, endAge: 78 },
    { name: "長期照護", cat: "生活", subCat: "醫療/健康", period: "年", amount: 480_000, infl: true, startAge: 84, endAge: "" },
  ];

  // 婚姻：33 歲。預算 74 萬 vs 最低 50 萬；婚禮費用明細五列（tag wedding）才是逐項真相，
  // applyMarriagePlan 看到明細列就不會再疊一筆「結婚（預算）」。
  c.marriage = { plan: "是", age: 33, latestAge: 35, budget: 740_000, minBudget: 500_000, importance: 5 };
  c.goals = [
    { on: true, tag: "wedding", name: "喜宴（場地與酒水）", type: "婚姻", present: 350_000, minPresent: 250_000, start: 33, end: 33, freq: 0, growth: "通膨", imp: 5, prepared: 0, loanRatio: 0, appreciation: 0 },
    { on: true, tag: "wedding", name: "婚紗攝影與禮服", type: "婚姻", present: 80_000, minPresent: 50_000, start: 33, end: 33, freq: 0, growth: "通膨", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 },
    { on: true, tag: "wedding", name: "婚戒與對戒", type: "婚姻", present: 60_000, minPresent: 40_000, start: 33, end: 33, freq: 0, growth: "通膨", imp: 4, prepared: 0, loanRatio: 0, appreciation: 0 },
    { on: true, tag: "wedding", name: "蜜月旅行（北海道）", type: "婚姻", present: 150_000, minPresent: 100_000, start: 33, end: 33, freq: 0, growth: "通膨", imp: 4, prepared: 0, loanRatio: 0, appreciation: 0 },
    { on: true, tag: "wedding", name: "聘金／儀式禮俗", type: "婚姻", present: 100_000, minPresent: 60_000, start: 33, end: 33, freq: 0, growth: "通膨", imp: 3, prepared: 0, loanRatio: 0, appreciation: 0 },
    // 購屋 36 歲：預售屋 桃園龜山 3 房 32 坪＋1 車位。總價走「這一間房」規格卡估值（priceManual 讓估值不覆蓋這個數）。
    // 預售付款時程用後台範本（訂簽開 15% → 工程期款 10% 分 3 年 → 交屋起貸、寬限 3 年）；pay 留空＝跟範本。
    // 裝修款 70 萬獨立成裝修貸（7 成、3.2%、7 年），不併總價。
    { on: true, name: "第一間房（預售・桃園龜山）", type: "購屋", present: 14_200_000, minPresent: 9_900_000, start: 36, end: 36, latest: 40, freq: 0, growth: "固定", imp: 5, prepared: 0,
      loanRatio: 75, loanRate: 2.2, loanYears: 30, appreciation: 2,
      condition: "預售", priceManual: true, minManual: true,
      spec: { city: "桃園市", district: "龜山區", type: "電梯大樓", rooms: 3, ping: 32, parking: 1, age: 0 },
      specMin: { city: "桃園市", district: "龜山區", type: "電梯大樓", rooms: 2, ping: 25, parking: 0, age: 0 },
      pay: {}, decoCost: 700_000, decoLoanRatio: 70, decoLoanRate: 3.2, decoLoanYears: 7 },
    // 購車 35 歲（第一胎出生後）：Toyota SUV 油電 新車、貸款 7 成 5 年；每 8 年換到 51 歲（35／43／51 三台）；
    // 舊 Altis 勾可變賣折價進頭期（sellAid 在 walk 裡接上）。養車成本六列由 carSyncCostRows 依規格推算。
    { on: true, name: "第一台家庭車（SUV 油電）", type: "購車", present: 1_250_000, minPresent: 900_000, start: 35, end: 51, latest: 38, freq: 0, growth: "固定", imp: 4, prepared: 0,
      loanRatio: 70, loanRate: 3.5, loanYears: 5, appreciation: 0,
      carMode: "貸款", condition: "新車", cycle: 8, priceManual: true, minManual: true,
      spec: { brand: "Toyota", segment: "SUV", power: "油電", cc: 2500, hp: 0, seats: 5, age: 0, km: 0, kmPerYear: 15000, ownParking: true } },
  ];

  // 生活願望：三張表都有細節欄（latest／end／freq／minAmount 收在「細節」）。
  c.travel = [
    { on: true, cat: "國外", sub: "消費旅遊", start: 34, end: 70, latest: 36, freq: 2, amount: 90_000, minAmount: 50_000, imp: 3 },
    { on: true, cat: "國內", sub: "鄉村旅遊", start: 36, end: 55, latest: 38, freq: 1, amount: 30_000, minAmount: 15_000, imp: 3 },
  ];
  c.hobby = [
    { on: true, sub: "娛樂創作類", start: 32, end: 60, freq: 1, amount: 40_000, minAmount: 15_000, imp: 3 },   // 攝影器材與鏡頭（也是副業工具）
    { on: true, sub: "體能類", start: 32, end: 75, freq: 12, amount: 1_800, minAmount: 1_200, imp: 2 },        // 兩人健身房月費
  ];
  c.luxury = [
    { on: true, sub: "首飾配件", start: 38, end: 38, freq: 1, amount: 80_000, minAmount: 0, imp: 1 },   // 結婚五週年
  ];

  // 短期資金需求：一年內婚禮尾款、兩年內預售訂簽開。
  c.shortTerm = [
    { name: "婚禮尾款（喜宴＋蜜月）", inYears: 1, amount: 500_000, minAmount: 350_000, prepared: 450_000, alt: "否" },
    { name: "預售屋訂簽開（總價 15%）", inYears: 4, amount: 2_130_000, minAmount: 1_500_000, prepared: 0, alt: "是" },
  ];

  c.needs = [
    // 保障年數 25：撐到第二胎（本人 37 歲生）經濟獨立。父母與未出生子女不進需求分析表。
    { member: "周承翰", funeral: 800_000, protectYears: 25, estateTax: 0, room: 2_500, selfPay: 2_000, nursing: 2_200, miscDaily: 3_000, incomeCompDay: 0, incomeCompMonth: 50_000, disability: 5_000_000, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 3_000_000, monthCare: 40_000, careMonths: 120 },
    { member: "林芷晴", funeral: 800_000, protectYears: 25, estateTax: 0, room: 2_500, selfPay: 2_000, nursing: 2_200, miscDaily: 3_000, incomeCompDay: 0, incomeCompMonth: 40_000, disability: 4_000_000, firstCancer: 1_000_000, cancerHosp: 3_000, critical: 3_000_000, monthCare: 40_000, careMonths: 120 },
  ];
  c.coverages = [
    { member: "周承翰", kind: "壽險", comm: 1_000_000, social: 0 },
    { member: "周承翰", kind: "住院醫療", comm: 1_500, social: 0 },
    { member: "林芷晴", kind: "壽險", comm: 500_000, social: 0 },
  ];
  c.policies = [
    { insured: "周承翰", name: "定期壽險（20 年期）", subtype: "定期壽險", premium: 9_800, life: 3_000_000, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "周承翰", name: "實支實付醫療（定期）", subtype: "醫療險", premium: 18_200, life: 0, accident: 0, medical: 2_000, medMisc: 200_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "周承翰", name: "意外險（附傷害醫療）", subtype: "意外險", premium: 3_600, life: 0, accident: 2_000_000, medical: 0, medMisc: 50_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "林芷晴", name: "實支實付醫療（定期）", subtype: "醫療險", premium: 16_400, life: 0, accident: 0, medical: 2_000, medMisc: 150_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    { insured: "林芷晴", name: "意外險", subtype: "意外險", premium: 3_000, life: 0, accident: 2_000_000, medical: 0, medMisc: 30_000, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 },
    // 爸媽多年前幫他買的儲蓄險：有現金價值（syncPolicyAsset 會鏡射成一列資產）。
    { insured: "周承翰", name: "六年期儲蓄險（已繳清）", subtype: "儲蓄險", premium: 0, life: 600_000, accident: 0, medical: 0, medMisc: 0, incomeCompDay: 0, incomeCompMonth: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 620_000 },
  ];

  c.savings = [
    { name: "定期定額 ETF（兩人）", subCat: "定期定額ETF/基金", period: "月", amount: 12_000 },
    { name: "購屋頭期專戶", subCat: "定存/儲蓄", period: "月", amount: 15_000 },
  ];
  c.intent = {
    purposes: ["想進行儲蓄，替未來準備", "想進行投資、活化資產", "想進行風險的保障評估", "人生模擬，了解一生金流"],
    // 自訂議題住 purposesCustom（normalizeIntent 會濾掉不在 PURPOSES 裡的字串）。
    purposesCustom: ["婚後兩個人的錢怎麼合併管理"],
    targets: ["婚姻規劃", "購屋規劃", "購車規劃", "子女教養規劃", "孝親規劃", "旅遊規劃", "休閒興趣規劃", "退休生活規劃", "職涯規劃"],
    mustHave: ["婚姻規劃", "購屋規劃", "子女教養規劃", "退休生活規劃"],
  };
  c.lifeGoals = [
    { name: "婚後三年內有自己的房子", priority: 1, value: "孩子出生前安定下來，不再搬家", importance: 5, linkModule: "置產", note: "" },
    { name: "兩個孩子都能念到大學", priority: 2, value: "給他們我沒有的選擇權", importance: 4, linkModule: "教育", note: "" },
    { name: "63 歲退休、每年帶爸媽出國一次", priority: 3, value: "趁爸媽還走得動", importance: 3, linkModule: "退休", note: "" },
  ];
  c.legacy = { on: true, heirs: 2, perHeirCash: 2_000_000, perHeirNote: "兩個孩子各一筆成家起步金", feedEstate: false };
  c.taxParams = { married: false, dependents: 0, otherDeduction: 0, estateDeduction: 0, houseAssessed: 0, landAssessed: 0, carTax: 11_920 };
  c.plan = {
    retireDelay: 0, movableToOverseas: 0,
    allocations: [
      { name: "全球股票 ETF（定期定額）", pct: 50, ret: 6, benefit: "長期增值" },
      { name: "購屋頭期專戶（高利活存／短天期定存）", pct: 35, ret: 1.8, benefit: "四年內要用、不能承受波動" },
      { name: "生活預備金", pct: 15, ret: 1, benefit: "流動安全網" },
    ],
  };
  c.career = { plan: "考慮轉職", switchAge: 36, switchFund: 200_000, startupType: "", startupBudget: "", importance: 3 };
  c.overseas = { hasAssets: "是", identity: "否", purpose: "投資", assetTypes: "股票" };
  c.tracking = [
    { year: 2025, age: 31, net: 1_780_000 },
    { year: 2026, age: 32, net: 2_250_000 },
  ];
  c.nextReview = "2027-01-15";
  c.reportNote =
    "兩個人加起來不算高薪，但也沒亂花。問題不是錢不夠，是結婚、兩胎、買房、換車全部擠在 33 到 39 歲，" +
    "而退休一個字都還沒開始準備。這份規劃先把這七年的錢攤開來看——哪一筆先、哪一筆可以等、" +
    "弟弟那 40 萬和爸媽答應的 150 萬什麼時候進來——再談要不要多賺、少花。";
  c.tags = ["示範範本", "準新人", "雙薪"];
  return c;
}


// 第五份的 walk（在瀏覽器裡逐步 eval；每一步都是 lantu-app.html 既有的全域函式）。
// ⚠️ 步驟順序有意義：生育先長成員，持有成本列要在購車／購屋目標齊全後再帶，流程最後走。
export const NEWLYWEDS_WALK: string[] = [
  // ① 生育規劃 → 未出生子女成員＋生育一次性＋0–2 歲育兒列
  "applyBirthPlan(true)",
  // ② 現況車輛接上購車目標（sellAid＝那台 Altis 的 aid）
  "(function(){var c=activeCase();var car=c.assets.filter(function(a){return /Altis/.test(a.name)})[0];var g=c.goals.filter(function(x){return x.type==='購車'&&!x.tag})[0];if(car&&g){g.sellAid=car.aid;}})()",
  // ③ 買房／買車之後的持有成本（預設列由規格推算；房的那組從交屋年起）
  "addDetailPresets('house')",
  "addDetailPresets('car')",
  // ④ 房租收到交屋前一年
  "(function(){var c=activeCase();var i=-1;c.goals.forEach(function(x,k){if(x.type==='購屋'&&!x.tag&&i<0)i=k});if(i>=0)houseStopRent(i);})()",
  // ⑤ 子女的其他準備基金：老大 30 歲結婚基金（進贈與稅檢核）
  "(function(){var c=activeCase();var kid=c.members.filter(function(m){return m.role==='子女'})[0];if(kid){addChildFund(kid.name,'結婚基金');var g=c.goals.filter(function(x){return x.childFundFor===kid.name})[0];if(g){g.present=1000000;g.minPresent=600000;}}})()",
  // ⑥ 願景處理流程：判定 → 缺口呈現（D1）→ 鎖願景 → 護欄 → 階段表 → 調整台 → 後果 → 行動清單 → 執行期
  "flowStart()",
  "flowGo('S1')",
  "flowDecide('S1','d1',{ok:true},'客戶確認願景是自己要的，看見缺口','S2')",
  "flowLockVision()",
  // 護欄只列最要緊的四項（兩人壽險、本人重病給付、預備金），不把十六個缺口全倒進行動清單
  // ⚠️ flowAddGuard 吃的是 guardCheck().rows 的索引，而每加一個動作 rows 就少一列——所以每加一個都重算一次、用名字＋成員找索引。
  "(function(){var c=activeCase();var want=[['壽險',primaryName(c)],['壽險',null],['重病給付',primaryName(c)],['reserve',null]];want.forEach(function(w){var G=guardCheck(c);for(var i=0;i<G.rows.length;i++){var r=G.rows[i];if(!(r.gap>0))continue;var hit=(w[0]==='reserve')?r.kind==='reserve':(r.name===w[0]&&(w[1]==null?r.member!==primaryName(c):r.member===w[1]));if(hit){flowAddGuard(i);break;}}});})()",
  "flowGo('S3')",
  "flowConfirmStages()",
  // 調整台：支出 −5,000／月（由上到下留／半／放）→ 收入拉到補平為止。
  // ⚠️ 先支出再收入：flowTuneApplyExp 收尾會用預設分法重寫收入兩個動作（不看 t.incSplit），
  //    反過來做的話「定期定額 8,000」會被洗回 0（2026/10/07 發現，待修）。
  "flowTuneDraft('exp',5000)",
  "flowTuneConfirm('exp')",
  "flowTuneModalClose()",
  // 收入：從 +20,000 起每次加 5,000，拉到投影補平為止（上限＝拉桿上限）；分法固定「工作 60%／定期定額 40%」
  "(function(){var c=activeCase();var K=flowTuneCaps(c);var v=20000;while(true){flowTuneDraft('inc',v);flowTuneConfirm('inc');var reg=Math.round(v*0.4/1000)*1000;flowTuneSetSplit('regular',reg);if(projection(c).shortPV<=0.5||v+5000>K.incMax)break;v+=5000;}})()",
  "flowTuneRoute('專業兼職')",
  "flowTuneModalClose()",
  // 閘門照引擎說的走：拉完補平了就直接進行動清單，沒補平才看後果、客戶接受
  "(function(){var c=activeCase();var t=flowTuneState(c);var closed=projection(c).shortPV<=0.5;flowTuneGate({closed:closed,reason:closed?'':'short',inc:t.inc,exp:t.exp},closed?'S6x':'S6');})()",
  "(function(){var f=flowOf(activeCase());if(f.step==='S6')flowAcceptConsequences();})()",
  "flowSetWrap('gain','原來最大的壓力不是房子，是七年內所有事都擠在一起')",
  "(function(){var c=activeCase();var a=(c.actions||[]).filter(function(x){return x.on!==false})[0];if(a)flowSetWrap('first',a.id);})()",
  "flowSetWrap('nextDate','2027-01-15')",
  "flowStartExec()",
  // 執行期：前兩個動作標「到位」、第三個「部分」，示範回訪對帳時有東西可對
  "(function(){var c=activeCase();var k=0;(c.actions||[]).forEach(function(a,i){if(a.on===false)return;k++;if(k<=2)flowSetStatus(i,'done');else if(k===3)flowSetStatus(i,'partial');});})()",
];

export const TEMPLATES = [
  { key: "dual", name: "雙薪育兒家庭", label: "38 歲・兩個孩子・房貸 920 萬", lifeStage: "家庭形成期", build: dualIncome },
  { key: "single", name: "單身上班族", label: "29 歲・未婚・租屋・想買第一間房", lifeStage: "單身期", build: single },
  { key: "biz", name: "中年企業主", label: "52 歲・公司負責人・傳承與交棒", lifeStage: "家庭成熟期", build: bizOwner },
  { key: "pre", name: "屆臨退休", label: "60 歲・五年後退休・子女已獨立", lifeStage: "退休準備期", build: preRetire },
  // walk：build.mjs 在瀏覽器裡、資料載入之後，用正式的函式把「要按按鈕才會長出來的東西」長出來——
  // 生育規劃三產物、買房／買車之後的持有成本列、現況車輛接上購車目標、房租收到交屋前一年，
  // 以及把願景處理流程走到「執行期」（教練打開就能示範回訪對帳）。每一步都是 lantu-app.html 既有的全域函式。
  { key: "newly", name: "準新人雙薪", label: "32 歲・半年後結婚・想生兩個・三年內買房買車", lifeStage: "家庭形成期", build: newlyweds, walk: NEWLYWEDS_WALK },
];
