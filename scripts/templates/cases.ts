// 四份共用示範範本的內容（2026 版）——這個檔案就是範本的原始碼。
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
    // 換屋後新增的貸款月付（賣舊買新、貸款金額變大的那一段）。
    // 舊房貸在 64 歲攤完，這一列從 52 歲接上去，到 77 歲為止。
    { name: "換屋後新增房貸月付", cat: "居住", amount: 300_000, infl: false, start: 52, end: 77, cut: 0 },
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
    { name: "換車", type: "購車", present: 900_000, minPresent: 600_000, start: 45, end: 45, freq: 0, growth: "固定", imp: 3, prepared: 0, loanRatio: 50, appreciation: 0 },
    // ⚠️ 購屋目標填的是**自備款＋裝潢稅費**，不是總價。
    //    引擎的一生金流（projection）沒有讀 goals[].loanRatio——填總價的話，
    //    52 歲那一年會被一次扣掉兩千多萬，圖上直接崩掉，而那不是這個家真正的現金流。
    //    貸款那一段以「換屋後房貸月付」那一列支出表示（見 expenses）。已列入回報給 Ray。
    { name: "換屋自備款與裝潢", type: "購屋", present: 5_400_000, minPresent: 4_200_000, start: 52, end: 52, freq: 0, growth: "固定", imp: 4, prepared: 0, loanRatio: 0, appreciation: 2 },
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
    // ⚠️ 兩個孩子**刻意不列進需求分析表**。需求分析問的是「這個人走了，家裡少掉什麼」，
    //    孩子不是經濟支柱，答案是喪葬費，不是房貸與學費。
    //    （順帶避開一個引擎面的問題：grossLifeNeed() 會把全部負債與教育金加進**每一位**
    //      被保人的壽險需求，不分他有沒有在賺錢——照填會讓 3 歲的孩子算出一千四百萬的
    //      壽險缺口。已列入回報給 Ray，這裡先用「只列經濟支柱」這個本來就正確的做法。）
    //    他們的醫療險仍在保單表裡，給付明細與保費投影都照算。
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
    // 36 歲買房：房租那一列結束，換成房貸月付（880 萬、2.1%、30 年 ≈ 33,000／月）。
    { name: "房貸月付（36 歲買房後）", cat: "居住", amount: 396_000, infl: false, start: 36, end: 66, cut: 0 },
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
    // 同上：填的是自備款＋裝潢稅費（總價約 1,100 萬、貸八成），不是總價。
    { name: "買第一間房（自備款與裝潢）", type: "購屋", present: 2_600_000, minPresent: 2_000_000, start: 36, end: 36, freq: 0, growth: "固定", imp: 5, prepared: 0, loanRatio: 0, appreciation: 2 },
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

export const TEMPLATES = [
  { key: "dual", name: "雙薪育兒家庭", label: "38 歲・兩個孩子・房貸 920 萬", lifeStage: "家庭形成期", build: dualIncome },
  { key: "single", name: "單身上班族", label: "29 歲・未婚・租屋・想買第一間房", lifeStage: "單身期", build: single },
  { key: "biz", name: "中年企業主", label: "52 歲・公司負責人・傳承與交棒", lifeStage: "家庭成熟期", build: bizOwner },
  { key: "pre", name: "屆臨退休", label: "60 歲・五年後退休・子女已獨立", lifeStage: "退休準備期", build: preRetire },
];
