// 企業／稅務法規常數的伺服器端讀寫。與 financeCategories / eduCosts 同一個模式：
// unstable_cache + tag，後台一存 updateTag，iframe app 下次載入就吃到新數字。
//
// 程式端的 src/lib/bizTax.ts 是 seed 與 fallback——DB 沒有這一列就用內建值，
// 所以就算這張表整個是空的，畫面也不會壞（只是永遠停在改版當時的數字）。
import { unstable_cache, updateTag } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { bizTaxParams } from "@/Shared/db/schema";
import {
  BIZ_TAX_BASIS, PROFIT_TAX_RATE, UNDISTRIBUTED_RATE, DIVIDEND_SEPARATE_RATE,
  DIVIDEND_CREDIT_RATE, DIVIDEND_CREDIT_CAP, NHI_SUPP_RATE, NHI_SUPP_MIN,
  RENT_EXPENSE_RATE, VAT_RATE, CAR_DEPRECIATION_CAP, CAR_LEASE_DEPRECIATION_CAP,
  CAR_RENTAL_BIZ_CAP, PENALTY_VAT_MULT, PENALTY_VOUCHER_RATE,
  PLAN_DISCOUNT, CAP_INCOME_UP, CAP_EXPENSE_CUT, CAP_RATE, CAP_RETIRE_DELAY,
  CAP_RETIRE_CUT, CAP_VISION_CUT, CAP_RATE_STARTER,
  CHECKUP_BAND, TRIANGLE_RISK, TRIANGLE_INVEST,
  NHI_SUPP_CAP, NHI_SUPP_BONUS_MULT, NHI_SUPP_WAGE_MIN,
  QUAKE_BASIC_SUM, QUAKE_LODGING, PROP_PING_COST, PROP_BUILDING_RATIO,
  CAR_LIAB_BODILY, CAR_LIAB_PROPERTY, CALI_DEATH, CALI_MEDICAL,
  EMPLOYER_COMP_MONTHS,
} from "./bizTax";

export const BIZ_TAX_TAG = "biz-tax";

export type BizTaxUnit = "rate" | "money" | "x" | "num";
export type BizTaxRow = {
  key: string;
  label: string;
  grp: string;
  unit: BizTaxUnit;
  value: number;
  basis: string;
  note: string;
  sortOrder: number;
};

// 可由後台維護的清單。只放「純數字」——條號、刑度那些文字敘述留在 bizTax.ts，
// 因為它們一改通常是整段語意都變了，不是換個數字就好。
const seed: Omit<BizTaxRow, "sortOrder">[] = [
  { key: "PROFIT_TAX_RATE", label: "營利事業所得稅稅率", grp: "稅率", unit: "rate", value: PROFIT_TAX_RATE, basis: BIZ_TAX_BASIS, note: "所得稅法" },
  { key: "UNDISTRIBUTED_RATE", label: "未分配盈餘加徵稅率", grp: "稅率", unit: "rate", value: UNDISTRIBUTED_RATE, basis: BIZ_TAX_BASIS, note: "產創條例 §23-3 的實質投資可減除" },
  { key: "DIVIDEND_SEPARATE_RATE", label: "股利分開計稅稅率", grp: "稅率", unit: "rate", value: DIVIDEND_SEPARATE_RATE, basis: BIZ_TAX_BASIS, note: "所得稅法 §15" },
  { key: "DIVIDEND_CREDIT_RATE", label: "股利合併計稅可抵減率", grp: "稅率", unit: "rate", value: DIVIDEND_CREDIT_RATE, basis: BIZ_TAX_BASIS, note: "所得稅法 §15" },
  { key: "DIVIDEND_CREDIT_CAP", label: "股利抵減上限（每一申報戶）", grp: "稅率", unit: "money", value: DIVIDEND_CREDIT_CAP, basis: BIZ_TAX_BASIS, note: "" },
  { key: "NHI_SUPP_RATE", label: "二代健保補充保費費率", grp: "稅率", unit: "rate", value: NHI_SUPP_RATE, basis: BIZ_TAX_BASIS, note: "全民健康保險法" },
  { key: "NHI_SUPP_MIN", label: "補充保費單筆起扣門檻", grp: "稅率", unit: "money", value: NHI_SUPP_MIN, basis: BIZ_TAX_BASIS, note: "" },
  { key: "RENT_EXPENSE_RATE", label: "租賃所得必要費用標準減除率", grp: "稅率", unit: "rate", value: RENT_EXPENSE_RATE, basis: BIZ_TAX_BASIS, note: "無法舉證時適用" },
  { key: "VAT_RATE", label: "加值型營業稅稅率", grp: "稅率", unit: "rate", value: VAT_RATE, basis: BIZ_TAX_BASIS, note: "" },
  { key: "CAR_DEPRECIATION_CAP", label: "自購自用小客車折舊成本上限", grp: "查核準則", unit: "money", value: CAR_DEPRECIATION_CAP, basis: BIZ_TAX_BASIS, note: "查核準則 §95 第 13 款" },
  { key: "CAR_LEASE_DEPRECIATION_CAP", label: "使用權資產提折舊的成本上限", grp: "查核準則", unit: "money", value: CAR_LEASE_DEPRECIATION_CAP, basis: BIZ_TAX_BASIS, note: "查核準則 §95 第 16 款，112 年度起與自購同" },
  { key: "CAR_RENTAL_BIZ_CAP", label: "租賃業者本身購車折舊上限", grp: "查核準則", unit: "money", value: CAR_RENTAL_BIZ_CAP, basis: BIZ_TAX_BASIS, note: "出租方的優惠，不是承租企業的" },
  { key: "PENALTY_VAT_MULT", label: "虛報進項漏稅罰倍數上限", grp: "罰則", unit: "x", value: PENALTY_VAT_MULT, basis: BIZ_TAX_BASIS, note: "營業稅法 §51，並得停止營業" },
  { key: "PENALTY_VOUCHER_RATE", label: "未取得憑證罰鍰比率", grp: "罰則", unit: "rate", value: PENALTY_VOUCHER_RATE, basis: BIZ_TAX_BASIS, note: "稅捐稽徵法 §44" },
  // 規劃求解：調整方案的槓桿天花板。unit 用 "num"（純數值，不做小數/百分比換算）——
  // 這些值在引擎裡就是以「百分點」與「年」為單位，換算成小數反而會錯。
  { key: "PLAN_DISCOUNT", label: "保守情境折現率（%）", grp: "規劃求解", unit: "num", value: PLAN_DISCOUNT, basis: BIZ_TAX_BASIS, note: "缺口的第二個讀數，不採客戶自己的預期報酬" },
  { key: "CAP_RATE", label: "投資報酬率假設上限（%）", grp: "規劃求解", unit: "num", value: CAP_RATE, basis: BIZ_TAX_BASIS, note: "超過即判「此路不通」，是紅綠燈的意義所在" },
  { key: "CAP_RATE_STARTER", label: "啟程期(C) 報酬率上限（%）", grp: "規劃求解", unit: "num", value: CAP_RATE_STARTER, basis: BIZ_TAX_BASIS, note: "體質剛轉正，比一般更保守" },
  { key: "CAP_INCOME_UP", label: "工作收入可調升上限（%）", grp: "規劃求解", unit: "num", value: CAP_INCOME_UP, basis: BIZ_TAX_BASIS, note: "" },
  { key: "CAP_EXPENSE_CUT", label: "生活/消費可削減上限（%）", grp: "規劃求解", unit: "num", value: CAP_EXPENSE_CUT, basis: BIZ_TAX_BASIS, note: "" },
  { key: "CAP_RETIRE_DELAY", label: "延後退休上限（年）", grp: "規劃求解", unit: "num", value: CAP_RETIRE_DELAY, basis: BIZ_TAX_BASIS, note: "" },
  { key: "CAP_RETIRE_CUT", label: "退休生活水準可調降上限（%）", grp: "規劃求解", unit: "num", value: CAP_RETIRE_CUT, basis: BIZ_TAX_BASIS, note: "" },
  { key: "CAP_VISION_CUT", label: "願景下修上限（%）", grp: "規劃求解", unit: "num", value: CAP_VISION_CUT, basis: BIZ_TAX_BASIS, note: "100 ＝ 一路走到每一項的「金額(最低)」" },
  // 保單健檢：HAVE vs NEED 的判定門檻與理財金三角比例。同樣用 "num"（純數值百分比）。
  { key: "CHECKUP_BAND", label: "健檢「適中」寬容帶（%）", grp: "保單健檢", unit: "num", value: CHECKUP_BAND, basis: BIZ_TAX_BASIS, note: "|HAVE−NEED|÷NEED 在此帶內判「適中」；設 0 ＝ 只要不相等就判偏高/偏低" },
  { key: "TRIANGLE_RISK", label: "理財金三角：保障型佔年收入（%）", grp: "保單健檢", unit: "num", value: TRIANGLE_RISK, basis: BIZ_TAX_BASIS, note: "保費需求的分母，6:3:1 的 1" },
  { key: "TRIANGLE_INVEST", label: "理財金三角：理財型佔年收入（%）", grp: "保單健檢", unit: "num", value: TRIANGLE_INVEST, basis: BIZ_TAX_BASIS, note: "6:3:1 的 3" },
  // 二代健保：一般保費的費率與級距是制度常數，住 taiwan.ts；這裡只放補充保費那幾個
  // 「有可能單獨被調」的門檻。⚠️ NHI_SUPP_WAGE_MIN 必須與 taiwan.ts 的 NHI_SALARY_MIN
  // 相同（分級表第 1 級本來就釘在基本工資上），有護欄測試守著，改這裡也要改那裡。
  { key: "NHI_SUPP_CAP", label: "補充保費單次扣取上限", grp: "二代健保", unit: "money", value: NHI_SUPP_CAP, basis: BIZ_TAX_BASIS, note: "健保署補充保險費計算公式" },
  { key: "NHI_SUPP_BONUS_MULT", label: "高額獎金門檻＝投保金額倍數", grp: "二代健保", unit: "x", value: NHI_SUPP_BONUS_MULT, basis: BIZ_TAX_BASIS, note: "全年累計超過當月投保金額 4 倍的部分才計費" },
  { key: "NHI_SUPP_WAGE_MIN", label: "兼職所得起扣門檻（基本工資）", grp: "二代健保", unit: "money", value: NHI_SUPP_WAGE_MIN, basis: BIZ_TAX_BASIS, note: "⚠️ 與 taiwan.ts 的投保金額第 1 級同一個數，兩邊要一起改" },
  // 產物保險：法定值與市場估算值混在一組，note 有標明哪些是估算。
  { key: "QUAKE_BASIC_SUM", label: "住宅地震基本保險 保險金額", grp: "產物保險", unit: "money", value: QUAKE_BASIC_SUM, basis: BIZ_TAX_BASIS, note: "法定定額，每一住宅一張" },
  { key: "QUAKE_LODGING", label: "住宅地震基本保險 臨時住宿費用", grp: "產物保險", unit: "money", value: QUAKE_LODGING, basis: BIZ_TAX_BASIS, note: "法定；未達全損的紅單 10 萬，期間合計上限 20 萬" },
  { key: "PROP_PING_COST", label: "建物重置成本 每坪單價", grp: "產物保險", unit: "money", value: PROP_PING_COST, basis: BIZ_TAX_BASIS, note: "⚠️ 估算值。產險公會造價表區間 4.3~13.2 萬，取中值；理想上應做成地區×樓層的表" },
  { key: "PROP_BUILDING_RATIO", label: "建物佔房地市價比例（粗估）", grp: "產物保險", unit: "rate", value: PROP_BUILDING_RATIO, basis: BIZ_TAX_BASIS, note: "⚠️ 估算值、無權威來源。只在教練沒填建坪時用；市區可能僅 15~20%、郊區可到 50%" },
  { key: "CAR_LIAB_BODILY", label: "第三人責任(任意) 體傷每人建議額", grp: "產物保險", unit: "money", value: CAR_LIAB_BODILY, basis: BIZ_TAX_BASIS, note: "⚠️ 市場級距 150 萬~1000 萬，無法定標準" },
  { key: "CAR_LIAB_PROPERTY", label: "第三人責任(任意) 財損每次事故建議額", grp: "產物保險", unit: "money", value: CAR_LIAB_PROPERTY, basis: BIZ_TAX_BASIS, note: "⚠️ 市場級距 20~100 萬，無法定標準" },
  { key: "CALI_DEATH", label: "強制車險 死亡/失能給付上限", grp: "產物保險", unit: "money", value: CALI_DEATH, basis: BIZ_TAX_BASIS, note: "金管會保險局，115.07.01 起由 200 萬提高" },
  { key: "CALI_MEDICAL", label: "強制車險 傷害醫療給付上限", grp: "產物保險", unit: "money", value: CALI_MEDICAL, basis: BIZ_TAX_BASIS, note: "與死亡/失能合計上限 320 萬" },
  { key: "EMPLOYER_COMP_MONTHS", label: "職災死亡補償月數", grp: "產物保險", unit: "num", value: EMPLOYER_COMP_MONTHS, basis: BIZ_TAX_BASIS, note: "勞基法 §59：死亡補償 40 個月＋喪葬費 5 個月" },
];

export function defaultBizTaxRows(): BizTaxRow[] {
  return seed.map((s, i) => ({ ...s, sortOrder: i }));
}

export async function listBizTaxParams(): Promise<BizTaxRow[]> {
  const rows = await db.select().from(bizTaxParams).orderBy(asc(bizTaxParams.sortOrder));
  return rows.map((r) => ({
    key: r.key, label: r.label, grp: r.grp, unit: r.unit as BizTaxUnit,
    value: r.value, basis: r.basis ?? "", note: r.note ?? "", sortOrder: r.sortOrder,
  }));
}

/**
 * 給 iframe app 的 payload。
 * ⚠️ 刻意做成「DB 有就覆蓋、沒有就用內建值」的合併，而不是「DB 有幾列就給幾列」——
 * 否則有人在後台誤刪一列，前端那個常數會變成 undefined，試算會靜靜地算出 NaN。
 */
export const getBizTaxPayload = unstable_cache(
  async (): Promise<{ values: Record<string, number>; basis: string }> => {
    let rows: BizTaxRow[] = [];
    try { rows = await listBizTaxParams(); } catch { rows = []; }
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const values: Record<string, number> = {};
    let basis = BIZ_TAX_BASIS;
    for (const d of defaultBizTaxRows()) {
      const r = byKey.get(d.key);
      values[d.key] = r && Number.isFinite(r.value) ? r.value : d.value;
      if (r?.basis && r.basis > basis) basis = r.basis;   // 取最新的一個基準日對外顯示
    }
    return { values, basis };
  },
  ["lantu-biz-tax"],
  { tags: [BIZ_TAX_TAG] },
);

const num = (v: unknown, field: string): number => {
  const x = Number(v);
  if (!Number.isFinite(x) || x < 0) throw new Error(`invalid-${field}`);
  return x;
};

export type BizTaxInput = { key: string; value: number | string; basis?: string; note?: string };

export async function saveBizTaxParam(input: BizTaxInput): Promise<void> {
  const d = defaultBizTaxRows().find((x) => x.key === input.key);
  if (!d) throw new Error("unknown-key");   // 只認得內建清單裡的 key，不開放新增
  const value = num(input.value, "value");
  // 比率一律以小數存（0.2 而不是 20），存進來大於 1 幾乎一定是把百分比當數字填了
  if (d.unit === "rate" && value > 1) throw new Error("rate-must-be-decimal");
  await db.insert(bizTaxParams).values({
    key: d.key, label: d.label, grp: d.grp, unit: d.unit, value,
    basis: (input.basis ?? d.basis) || null, note: (input.note ?? d.note) || null,
    sortOrder: d.sortOrder, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: bizTaxParams.key,
    set: { value, basis: (input.basis ?? d.basis) || null, note: (input.note ?? d.note) || null, updatedAt: new Date() },
  });
  updateTag(BIZ_TAX_TAG);
}

export async function resetBizTaxParam(key: string): Promise<void> {
  await db.delete(bizTaxParams).where(eq(bizTaxParams.key, key));   // 刪掉＝回到程式內建值
  updateTag(BIZ_TAX_TAG);
}
