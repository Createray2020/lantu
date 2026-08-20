// 台灣制度常數（單點維護）—— 稅制、勞保/勞退級距、執行業務費用標準。
//
// ⚠️ 這些數字每年會調整。**改任何一個都要同步改 EFFECTIVE_YEAR**，
//    `src/lib/taiwan.test.ts` 有一條護欄：申報年（今年）不得超過 EFFECTIVE_YEAR + 1，
//    跨年沒更新就會讓測試變紅，逼回頭查財政部/勞動部公告。
//
// public/lantu-app.html 是獨立 HTML 無法 import 本檔，另有一份同內容的常數；
// src/lib/engine.test.ts 的「雙實作對拍」會比對兩邊，改這裡務必同步改那裡。

// ─────────────────────────────────────────────
// 綜合所得稅
// ─────────────────────────────────────────────

/** TAX_BR / 免稅額 / 扣除額所適用的「所得年度」。2025 年度＝2026 年 5 月申報。 */
export const TAX_YEAR = 2025;

/** 綜所稅級距 [課稅淨額上限, 稅率, 累進差額]。來源：財政部綜所稅稅率級距表。 */
export const TAX_BR: [number, number, number][] = [
  [590000, 0.05, 0],
  [1330000, 0.12, 41300],
  [2660000, 0.2, 147700],
  [4980000, 0.3, 413700],
  [1e15, 0.4, 911700],
];

/** 免稅額（每人） */
export const EXEMPT_PER_PERSON = 97000;
/** 標準扣除額 — 有偶合併申報 */
export const STD_DED_MARRIED = 262000;
/** 標準扣除額 — 單身 */
export const STD_DED_SINGLE = 131000;
/** 薪資所得特別扣除額（每位薪資所得者上限） */
export const SALARY_SPECIAL = 218000;

// ─────────────────────────────────────────────
// 遺產稅
// ─────────────────────────────────────────────

/** ESTATE_* 與 EST_BR 所適用的年度。 */
export const ESTATE_YEAR = 2025;

/** 遺產稅級距 [課稅淨額上限, 稅率, 累進差額] */
export const EST_BR: [number, number, number][] = [
  [56210000, 0.1, 0],
  [112420000, 0.15, 2810500],
  [1e15, 0.2, 8431500],
];

/** 遺產稅免稅額 */
export const ESTATE_EXEMPT = 13330000;
/** 配偶扣除額 */
export const ESTATE_SPOUSE_DED = 5530000;
/** 直系血親卑親屬扣除額（每人） */
export const ESTATE_LINEAL_DED = 560000;
/** 父母扣除額（每人） */
export const ESTATE_PARENT_DED = 1380000;
/** 喪葬費扣除額 */
export const ESTATE_FUNERAL_DED = 1380000;

// ─────────────────────────────────────────────
// 勞保 / 勞退
// ─────────────────────────────────────────────

/** LABOR_* 所適用的年度。2026（民國 115）年 1 月 1 日生效。 */
export const LABOR_YEAR = 2026;

/** 勞工保險投保薪資分級表（月投保薪資）。第 1 級 29,500、天花板第 11 級 45,800。 */
export const LABOR_INS_GRADES = [
  29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800,
];

/**
 * 勞工退休金（新制）月提繳工資上限。
 * ⚠️ 這是**另一張表**，不是勞保投保薪資分級表（上限 45,800）。
 *    混用會讓月薪 10 萬的客戶勞退提繳被低估過半。
 */
export const LABOR_PENSION_CAP = 150000;
/** 雇主法定提繳率 */
export const LABOR_PENSION_RATE = 0.06;
/** 勞保老年年金 B 式給付率（平均月投保薪資 × 年資 × 1.55%） */
export const LABOR_INS_ANNUITY_RATE = 0.0155;
/**
 * 勞保老年年金 A 式：平均月投保薪資 × 年資 × 0.775% ＋ 3,000 元。
 * A、B 兩式**擇優**發給。低薪長年資的人 A 式常常比 B 式高
 * （例：投保 29,500、年資 30 年 → A 式 9,858、B 式 13,718，B 勝；
 *   投保 29,500、年資 15 年 → A 式 6,429、B 式 6,859，仍 B 勝；
 *   但投保 29,500、年資 8 年 → A 式 4,829、B 式 3,658，A 勝）。
 * 只算 B 式會系統性低估年資短的人。
 */
export const LABOR_INS_ANNUITY_RATE_A = 0.00775;
export const LABOR_INS_ANNUITY_BONUS_A = 3000;
/**
 * 請領勞保「老年年金」的最低保險年資。未滿 15 年只能請領「老年一次金」
 * （保險年資每滿 1 年發給 1 個月平均月投保薪資）。
 */
export const LABOR_ANNUITY_MIN_YEARS = 15;
/** 勞退新制上路年月（民國 94 年 7 月 1 日）。之前的年資屬舊制，不在新制個人專戶裡。 */
export const LABOR_PENSION_START_YM = '2005-07';
/** 勞退新制個人專戶的概估年化報酬（保守值；法定有「不低於兩年期定存利率」的保證收益）。 */
export const LABOR_PENSION_FUND_RATE = 0.03;

/**
 * 'YYYY-MM' → 到 asOf 為止的年資（取到小數一位）。
 * 格式不對、空值、或起算日在未來，一律回 0 —— 年資寧可少算也不要憑空生出來。
 */
export function yearsSinceYm(ym: string | null | undefined, asOf: Date = new Date()): number {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return 0;
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  if (m < 1 || m > 12) return 0;
  const v = (asOf.getFullYear() - y) + (asOf.getMonth() + 1 - m) / 12;
  return v <= 0 ? 0 : Math.floor(v * 10) / 10;
}

/** 實際月薪 → 勞保月投保薪資 */
export function laborInsSalary(monthly: number): number {
  const m = Number(monthly);
  if (!isFinite(m) || m <= 0) return 0;
  for (const g of LABOR_INS_GRADES) if (m <= g) return g;
  return LABOR_INS_GRADES[LABOR_INS_GRADES.length - 1];
}

/** 實際月薪 → 勞退月提繳工資（同樣分級，但上限是 150,000） */
export function laborPensionSalary(monthly: number): number {
  const m = Number(monthly);
  if (!isFinite(m) || m <= 0) return 0;
  for (const g of LABOR_INS_GRADES) if (m <= g) return g;
  // 超過勞保天花板之後，勞退仍依實際工資分級到 150,000 為止。
  return Math.min(Math.round(m), LABOR_PENSION_CAP);
}

// ─────────────────────────────────────────────
// 國民年金（勞動部勞工保險局公告）
// ─────────────────────────────────────────────

/** NP_* 所適用的年度。月投保金額 115（2026）年起適用。 */
export const NP_YEAR = 2026;

/**
 * 國民年金月投保金額。全體被保險人同一金額，沒有分級表。
 * 104–111 年 18,282／112–114 年 19,761／115 年起 21,103。
 */
export const NP_INSURED_MONTHLY = 21103;

/** 老年年金 A 式給付率（月投保金額 × 年資 × 0.65% ＋ 加計金額） */
export const NP_RATE_A = 0.0065;
/**
 * 老年年金 A 式加計金額。105–108 年 3,628／109–112 年 3,772／113 年起 4,049。
 * ⚠️ 2026/05 提出調高至 5,000 的修法案仍在立法院審議，三讀前一律用現行公告值。
 */
export const NP_BONUS_A = 4049;
/** 老年年金 B 式給付率（月投保金額 × 年資 × 1.3%） */
export const NP_RATE_B = 0.013;

/** 視同勞保系（可套勞保老年年金＋勞退新制）的投保類型 */
export const LABOR_LIKE_INS = ['勞保', '職業工會', '就業保險', '勞工職業災害保險'] as const;

/** 工作類別。家管／投資者沒有雇主：不套勞保投保薪資分級、無勞退提繳，預設以國民年金投保。 */
export const JOB_TYPES = ['一般就業者', '業務工作者', '企業主', '家管', '投資者', '其他'] as const;
export const NO_EMPLOYER_JOBS = ['家管', '投資者'] as const;

export function isNoEmployerJob(jobType: string): boolean {
  return (NO_EMPLOYER_JOBS as readonly string[]).includes(jobType);
}

/** 工作類別 → 預設投保類型 */
export function jobInsType(jobType: string): string {
  if (jobType === '業務工作者') return '職業工會';
  if (isNoEmployerJob(jobType)) return '國民年金';
  return '勞保';
}

/** 出生日期（YYYY-MM-DD）→ 足歲；格式不對或超出合理範圍回傳 null。 */
export function ageFromBirth(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const m = String(birth).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date();
  let a = t.getFullYear() - by;
  const mo = t.getMonth() + 1 - bm;
  if (mo < 0 || (mo === 0 && t.getDate() < bd)) a--;
  return a >= 0 && a <= 130 ? a : null;
}

// ─────────────────────────────────────────────
// 執行業務者費用標準
// ─────────────────────────────────────────────

/** PROF_EXPENSE 所適用的年度（財政部「執行業務者費用標準」）。 */
export const PROF_EXPENSE_YEAR = 2025;

/** [職業別, 費用率%]；null＝需自行輸入。執行業務所得＝收入×(1−費用率)，不適用薪資特別扣除。 */
export const PROF_EXPENSE: [string, number | null][] = [
  ["律師", 30],
  ["律師（法律扶助 / 義務辯護）", 50],
  ["會計師", 35],
  ["建築師", 35],
  ["技師", 35],
  ["地政士", 30],
  ["記帳士 / 記帳及報稅代理人", 35],
  ["保險經紀人", 26],
  ["一般經紀人", 20],
  ["著作人（稿費 / 版稅）", 30],
  ["著作人（自行出版）", 75],
  ["表演人", 45],
  ["藥師（非健保）", 20],
  ["營養師", 20],
  ["心理師", 20],
  ["命理卜卦", 20],
  ["公益彩券經銷商", 60],
  ["其他（自行輸入費用率）", null],
];

export function profStdRate(name: string): number | null {
  for (const [k, v] of PROF_EXPENSE) if (k === name) return v;
  return null;
}

/** 費用率：教練手動覆寫優先；否則取職業別標準；都沒有時以一般經紀人 20% 為保守預設。 */
export function profExpenseRate(tp: { profRate?: unknown; profOccupation?: string } | null | undefined): number {
  const t = tp || {};
  if (t.profRate != null && t.profRate !== "") {
    const r = Number(t.profRate);
    if (isFinite(r)) return r;
  }
  const s = profStdRate(t.profOccupation || "");
  return s == null ? 20 : s;
}

// ─────────────────────────────────────────────
// 房地產持有稅
// ─────────────────────────────────────────────

/** 房屋稅率（自住） */
export const HOUSE_TAX_RATE = 0.012;
/** 地價稅率（自用住宅用地） */
export const LAND_TAX_RATE = 0.002;
