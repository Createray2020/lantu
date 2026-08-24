// 保險公司清單的程式端 seed 與 fallback。
//
// 這一份是「公司名稱」，不是商品。放進程式碼的理由跟 financeCategories.defaults 一樣：
// DB 空的、離線、或 API 掛了的時候，保單登錄的公司欄仍然要有可選清單，
// 否則會退回自由文字——打錯一個字，跨客戶的保費統計就少一家。
//
// ⚠️ 與 public/lantu-app.html 的 INS_CO_FALLBACK 由 insProducts.drift.test.ts 逐字對拍，
// 改任一邊都要同步改另一邊。
export const INS_COMPANIES_LIFE = [
  "三商美邦", "安達", "凱基", "中華郵政", "元大", "友邦", "台灣", "全球", "合作金庫", "安聯",
  "宏泰", "法國巴黎", "保誠", "南山", "國泰", "第一金", "富邦", "新光", "臺銀", "遠雄",
] as const;

export const INS_COMPANIES_PROP = [
  "中信產險", "兆豐產險", "安達產物", "旺旺友聯產物", "明台產物", "法國巴黎產物", "南山產物",
  "泰安產物", "國泰產物", "第一產物", "富邦產物", "華南產物", "新光產物", "新安東京產物",
  "臺灣產物", "和泰產物",
] as const;

export const INS_COMPANIES_OTHER = ["國外公司", "國外公司(產物)"] as const;

export type InsProductRow = {
  id?: string;
  company: string;
  code: string;
  name: string;
  kind: string;
  mainRider: string;
  onSale: boolean;
  bigCat: string;
  sortOrder: number;
};

/** 商品總類：與 insure80 的分類對齊，做為後台輸入的下拉選項。 */
export const INS_PRODUCT_KINDS = [
  "終身壽險", "定期壽險", "意外", "醫療", "防癌", "重大疾病", "特定傷病", "年金", "外幣",
  "投資型", "失能", "婦嬰", "長期照顧", "豁免保費", "萬能", "專案商品", "公司團險",
] as const;

/** 公司層的預設列（code/name 留空字串——UNIQUE 對 NULL 視為互異，用空字串才擋得住重複）。 */
export function defaultInsProductRows(): InsProductRow[] {
  const mk = (company: string, bigCat: string, i: number): InsProductRow => ({
    company, code: "", name: "", kind: "", mainRider: "", onSale: true, bigCat, sortOrder: i,
  });
  const out: InsProductRow[] = [];
  INS_COMPANIES_LIFE.forEach((c) => out.push(mk(c, "人身", out.length)));
  INS_COMPANIES_PROP.forEach((c) => out.push(mk(c, "產物", out.length)));
  out.push(mk("國外公司", "人身", out.length));
  out.push(mk("國外公司(產物)", "產物", out.length));
  return out;
}
