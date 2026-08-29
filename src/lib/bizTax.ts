// 企業／稅務法規常數（台灣）。
//
// 為什麼要獨立一支：這一塊的數字改得比個人稅制勤，而且改了沒更新比不寫更危險
// （網路上大量文章還停在舊法——例如稅捐稽徵法 §41 的罰金上限，110 年修法後從
// 6 萬提高到 1,000 萬，仍有非常多資料寫舊的）。全部集中在這裡、標明資料基準日，
// 讓「哪些數字會過期」一眼看得完。
//
// ⚠️ public/lantu-app.html 是獨立 HTML 無法 import 本檔，另有一份同內容的常數；
//    src/lib/bizModule.test.ts 會正則比對兩邊，改這裡務必同步改那裡（測試會擋）。
//
// ⚠️ 本檔所有內容僅供理解架構與結構試算之用，不構成稅務、法律或投資建議。
//    稅法與函釋時有修正、個案認定高度依賴具體事實，實際執行請與會計師確認。

// 資料基準日：畫面上每個吃這些常數的區塊都會顯示它。
export const BIZ_TAX_BASIS = "2026-08";

// ── 稅率 ──
/** 營利事業所得稅稅率。 */
export const PROFIT_TAX_RATE = 0.2;
/** 未分配盈餘加徵稅率（產創條例 §23-3 的實質投資可減除）。 */
export const UNDISTRIBUTED_RATE = 0.05;
/** 股利「分開計稅」稅率。 */
export const DIVIDEND_SEPARATE_RATE = 0.28;
/** 股利「合併計稅」可抵減率。 */
export const DIVIDEND_CREDIT_RATE = 0.085;
/** 股利合併計稅的抵減上限（每一申報戶）。 */
export const DIVIDEND_CREDIT_CAP = 80000;
/** 二代健保補充保費費率。 */
export const NHI_SUPP_RATE = 0.0211;
/** 二代健保補充保費的單筆起扣門檻。 */
export const NHI_SUPP_MIN = 20000;
/**
 * NHI_SUPP_* 所適用的年度。
 * ⚠️ 2025 年底提出、2026 上半年吵翻天的「股利／利息／租金改按年度結算」新制
 *    已由行政院喊卡（衛福部：尋求更有共識的做法），未三讀前一律用現行單次扣取制。
 */
export const NHI_SUPP_YEAR = 2026;
/** 補充保費的單次扣取上限（每一次給付的計費金額上限）。 */
export const NHI_SUPP_CAP = 10000000;
/** 高額獎金的起扣門檻＝當月投保金額的幾倍（累計超過的部分才計費）。 */
export const NHI_SUPP_BONUS_MULT = 4;
/**
 * 兼職所得的起扣門檻＝基本工資。
 * ⚠️ 這個數字與 src/lib/taiwan.ts 的 NHI_SALARY_MIN（健保投保金額第 1 級）是同一個數
 *    ——分級表第 1 級本來就是釘在基本工資上。兩處都要改，nhiSupp.test.ts 有一條護欄擋著。
 */
export const NHI_SUPP_WAGE_MIN = 29500;

// ── 產物保險（住宅火險／地震險／車險／責任險）──
// ⚠️ 這一組不是稅法，是「產險需求端要用什麼基準推」的可治理參數。
//    住宅地震基本保險的兩個數字是法定的；其餘是市場級距，一律當估算值、畫面上要標。
/** PROP_* / QUAKE_* / CALI_* 的資料基準年度。 */
export const PROP_INS_YEAR = 2026;
/** 住宅地震基本保險：建築物損失保險金額（法定定額，每一住宅）。 */
export const QUAKE_BASIC_SUM = 1500000;
/** 住宅地震基本保險：臨時住宿費用（全損 20 萬；紅單未達全損 10 萬，保單期間合計上限 20 萬）。 */
export const QUAKE_LODGING = 200000;
/**
 * 建物重置成本的每坪單價（元/坪）。
 * ⚠️ **估算值**：產險公會「臺灣地區住宅類建築造價參考表」依地區與總樓層數
 *    從 4.3 萬到 13.2 萬不等（鋼骨造再加 16%、磚木石金屬構造 2.5 萬）。
 *    系統取中間值當預設，教練一定要能覆寫。
 */
export const PROP_PING_COST = 70000;
/** 建物重置成本佔房地市價的推估比例（沒填建坪時的粗估）。⚠️ 純估算，區域差異極大。 */
export const PROP_BUILDING_RATIO = 0.3;
/** 汽車第三人責任險（任意）體傷每人的建議保額。市場級距 150 萬～1,000 萬。 */
export const CAR_LIAB_BODILY = 3000000;
/** 汽車第三人責任險（任意）財損每次事故的建議保額。市場級距 20 萬～100 萬。 */
export const CAR_LIAB_PROPERTY = 500000;
/** 強制汽車責任保險：死亡／失能給付上限（115.07.01 起由 200 萬提高至 300 萬）。 */
export const CALI_DEATH = 3000000;
/** 強制汽車責任保險：傷害醫療費用給付上限。 */
export const CALI_MEDICAL = 200000;
/** 勞基法 §59 職災死亡補償的月數（喪葬費 5 個月＋死亡補償 40 個月）。雇主責任險保額的推估基礎。 */
export const EMPLOYER_COMP_MONTHS = 45;
/**
 * 公共意外責任保險的常見法定最低保額基準
 * [每一個人體傷, 每一事故體傷, 每一事故財損, 保險期間總額]。
 * ⚠️ 全國沒有單一標準，這是多數縣市自治條例與大型活動投保基準共用的那一組數字。
 */
export const PUBLIC_LIAB_STD = [3000000, 15000000, 2000000, 34000000];
/** 租賃所得的必要費用標準減除率（無法舉證時適用）。 */
export const RENT_EXPENSE_RATE = 0.43;
/** 營業稅（加值型）稅率。 */
export const VAT_RATE = 0.05;

// ── 查核準則 / 函釋的關鍵金額 ──
/** 自購自用小客車計提折舊的實際成本上限（查核準則 §95 第 13 款）。 */
export const CAR_DEPRECIATION_CAP = 2500000;
/**
 * 承租小客車以「使用權資產」入帳提折舊者的成本上限（查核準則 §95 第 16 款）。
 * 自 112 年度起與自購同為 250 萬——「租車可以繞過折舊上限」這個說法已經失效。
 */
export const CAR_LEASE_DEPRECIATION_CAP = 2500000;
/** 小客車租賃業者本身購車的折舊上限。這是出租方的優惠，不是承租企業的。 */
export const CAR_RENTAL_BIZ_CAP = 5000000;

// ── 罰則（第三部：發票與節稅的紅線）──
/** 稅捐稽徵法 §41：以詐術或不正當方法逃漏稅捐。 */
export const PENALTY_EVASION = { law: "稅捐稽徵法 §41", jail: "5 年以下有期徒刑", fine: 10000000 };
/** 稅捐稽徵法 §43：教唆或幫助犯 §41 之罪（介紹買賣發票的中間人也在射程內）。 */
export const PENALTY_ASSIST = { law: "稅捐稽徵法 §43", jail: "3 年以下有期徒刑", fine: 1000000 };
/**
 * 商業會計法 §71：明知為不實之事項而填製會計憑證或記入帳冊。
 * 處罰對象明文包含「依法受託代他人處理會計事務之人員」——記帳士與會計師也在射程內，
 * 這是為什麼專業人士對這件事的態度會非常保守。
 */
export const PENALTY_FALSE_BOOK = { law: "商業會計法 §71", jail: "5 年以下有期徒刑、拘役", fine: 600000 };
/** 營業稅法 §51：虛報進項稅額，追繳稅款外按所漏稅額處 5 倍以下罰鍰，並得停止營業。 */
export const PENALTY_VAT_MULT = 5;
/** 稅捐稽徵法 §44：應取得而未取得憑證，就查明認定之總額處 5% 以下罰鍰。 */
export const PENALTY_VOUCHER_RATE = 0.05;
/** 核課期間：有無依規定申報、有無故意以詐欺方法逃漏，適用 5 年或 7 年。 */
export const ASSESSMENT_YEARS = [5, 7];

// ── 水位標準 ──
/** 公司營運週轉金建議水位（月數）。 */
export const CORP_RESERVE_MONTHS = [3, 6];
/** 企業主家庭緊急預備金建議水位（月數）——比受薪者高，因為收入波動大。 */
export const OWNER_EMERGENCY_MONTHS = [6, 12];

/** 五條資金通道。公司的錢合法變成你的錢只有這五條路，不能有第六種。 */
export const MONEY_CHANNELS = ["薪資", "董監酬勞", "盈餘分配(股利)", "租金", "借款", "費用報銷"] as const;

/** 企業主的退場三條路。準備方式完全不同，必須先選定。 */
export const EXIT_PATHS: { name: string; prep: string; years: string }[] = [
  { name: "傳承接班", prep: "接班人培養、股權移轉安排、稅負規劃、治理制度", years: "5～10 年" },
  { name: "出售事業", prep: "財務透明化、去老闆化（降低對他個人的依賴）、估值提升", years: "3～5 年" },
  { name: "收攤清算", prep: "清算稅負、員工安置、資產處分", years: "1～2 年" },
];

/** 企業階段 → 該階段該解的題。最常見的錯誤是跨階段操作。 */
export const BIZ_STAGES: { name: string; focus: string }[] = [
  { name: "生存期", focus: "現金流管理、帳務基礎、稅務合規" },
  { name: "成長期", focus: "股權設定、第一輪外部資金、單位經濟效益驗證" },
  { name: "擴張期", focus: "擴編、資本支出決策、財務基礎建設、長短期資金配置" },
  { name: "成熟期", focus: "IPO 或控股架構、傳承與退場規劃" },
];

// ── 規劃求解參數（調整方案的缺口求解器）──
// 這一組不是法規，是「什麼樣的建議算得上合理」的天花板。放進後台是為了讓它可被治理：
// 教練不能自己把報酬率上限拉到 15% 再宣稱缺口補平了——那樣紅綠燈就失去意義。
/** 保守情境折現率 %（缺口的第二個讀數，不採客戶自己的預期報酬）。 */
export const PLAN_DISCOUNT = 2.5;
/** 工作收入可調升上限 %。 */
export const CAP_INCOME_UP = 30;
/** 生活/消費支出可削減上限 %。 */
export const CAP_EXPENSE_CUT = 30;
/** 投資報酬率假設上限 %。 */
export const CAP_RATE = 8;
/** 延後退休上限（年）。 */
export const CAP_RETIRE_DELAY = 10;
/** 退休生活水準可調降上限 %。 */
export const CAP_RETIRE_CUT = 25;
/** 願景下修上限 %（100 ＝ 一路走到每一項的「金額(最低)」）。 */
export const CAP_VISION_CUT = 100;
/** 啟程期(C) 的報酬率上限，比一般更保守。 */
export const CAP_RATE_STARTER = 6;

// ── 保單健檢參數 ──
// insure80 的健檢只有「偏低／偏高／適中」三值，但沒有公布寬容帶。
// 實測它 11.1 萬 vs 12 萬（差 7.5%）判「適中」，所以它是有帶的；我們把它明寫成可治理的參數。
/** 適中帶 %：|HAVE−NEED| ÷ NEED 落在此帶內視為「適中」。 */
export const CHECKUP_BAND = 10;
/** 理財金三角：保障型（風險管理）佔年收入 %。 */
export const TRIANGLE_RISK = 10;
/** 理財金三角：理財型（投資理財）佔年收入 %。 */
export const TRIANGLE_INVEST = 30;
