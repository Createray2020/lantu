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
