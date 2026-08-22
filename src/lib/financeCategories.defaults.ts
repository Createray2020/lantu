// 收支資債「細類」預設清單（平台級；後台 /admin/categories 可增刪改排序停用）。
//
// 兩層結構的理由：引擎公式直接吃「大類」——
//   支出 cat==='消費'|'其他' → 可刪減支出；資產 mainCat==='可投資資產' → 核心資產；
//   負債 mainCat==='信貸' → 消費性負債；收入 subType==='執行業務所得' → 走費用率扣除。
// 所以大類寫死不開放，後台只管「細類」，每個細類必須指名它預設落在哪個大類。
//
// parent  = 選這個細類時自動帶入的大類（進階欄仍可覆寫，例如不動產可自用可投資）
// risk    = 資產：是否計入「風險性資產」（引擎會把這個旗標寫進該筆資料，取代舊的字串比對）
// liq     = 資產：預設流動性（流動／固定）
// consumer= 負債：是否算「消費性負債」（同上，寫進資料列）
// note    = 選了要提示補明細（目前只有「其他」）
export type CatKind = "income" | "expense" | "saving" | "asset" | "liability";

export type CatSeed = {
  kind: CatKind;
  parent: string;
  label: string;
  risk?: boolean;
  liq?: "流動" | "固定";
  consumer?: boolean;
  note?: boolean;
};

// 各 kind 的合法大類（引擎語意層，固定不開放編輯）
export const CAT_PARENTS: Record<CatKind, readonly string[]> = {
  income: ["工作", "理財", "其他"],
  expense: ["生活", "貸款", "消費", "稅賦", "孝親", "保險", "其他"],
  saving: ["儲蓄理財"],
  asset: ["自用資產", "可投資資產"],
  liability: ["房貸", "車貸", "信貸", "其他"],
} as const;

export const CAT_KIND_LABEL: Record<CatKind, string> = {
  income: "收入",
  expense: "支出",
  saving: "儲蓄理財投入",
  asset: "資產",
  liability: "負債",
};

const income: CatSeed[] = [
  { kind: "income", parent: "工作", label: "薪資" },
  { kind: "income", parent: "工作", label: "執行業務所得" },
  { kind: "income", parent: "工作", label: "年終獎金" },
  { kind: "income", parent: "工作", label: "三節獎金" },
  { kind: "income", parent: "工作", label: "績效/季獎金" },
  { kind: "income", parent: "工作", label: "佣金/業績獎金" },
  { kind: "income", parent: "工作", label: "加班費" },
  { kind: "income", parent: "工作", label: "兼職" },
  { kind: "income", parent: "工作", label: "差旅/交通補貼" },
  { kind: "income", parent: "工作", label: "股票/員工分紅" },
  { kind: "income", parent: "理財", label: "租金收入" },
  { kind: "income", parent: "理財", label: "股利/利息" },
  { kind: "income", parent: "理財", label: "存款利息" },
  { kind: "income", parent: "理財", label: "基金/ETF 配息" },
  { kind: "income", parent: "理財", label: "債券配息" },
  { kind: "income", parent: "理財", label: "資本利得(已實現)" },
  { kind: "income", parent: "理財", label: "事業盈餘分配" },
  { kind: "income", parent: "理財", label: "版稅/權利金" },
  { kind: "income", parent: "理財", label: "加密資產收益" },
  { kind: "income", parent: "理財", label: "其他理財收入" },
  { kind: "income", parent: "其他", label: "退休金/年金" },
  { kind: "income", parent: "其他", label: "政府補助/津貼" },
  { kind: "income", parent: "其他", label: "育兒津貼" },
  { kind: "income", parent: "其他", label: "子女孝養金" },
  { kind: "income", parent: "其他", label: "保險給付" },
  { kind: "income", parent: "其他", label: "贍養費/扶養費" },
  { kind: "income", parent: "其他", label: "親友資助" },
  { kind: "income", parent: "其他", label: "贈與/中獎" },
  { kind: "income", parent: "其他", label: "其他", note: true },
];

const expense: CatSeed[] = [
  { kind: "expense", parent: "生活", label: "餐食" },
  { kind: "expense", parent: "生活", label: "居住(房租)" },
  { kind: "expense", parent: "生活", label: "管理費/修繕" },
  { kind: "expense", parent: "生活", label: "水電瓦斯" },
  { kind: "expense", parent: "生活", label: "電信網路" },
  { kind: "expense", parent: "生活", label: "交通/油資" },
  { kind: "expense", parent: "生活", label: "通勤/停車" },
  { kind: "expense", parent: "生活", label: "日用品" },
  { kind: "expense", parent: "生活", label: "醫療/健康" },
  { kind: "expense", parent: "生活", label: "子女教養" },
  { kind: "expense", parent: "生活", label: "育兒/托育" },
  { kind: "expense", parent: "貸款", label: "自用住宅貸款" },
  { kind: "expense", parent: "貸款", label: "投資性房屋貸款" },
  { kind: "expense", parent: "貸款", label: "汽車貸款" },
  { kind: "expense", parent: "貸款", label: "機車貸款" },
  { kind: "expense", parent: "貸款", label: "信用貸款" },
  { kind: "expense", parent: "貸款", label: "信用卡分期/零卡分期" },
  { kind: "expense", parent: "貸款", label: "就學貸款" },
  { kind: "expense", parent: "貸款", label: "其他貸款支出", note: true },
  { kind: "expense", parent: "消費", label: "治裝/美容" },
  { kind: "expense", parent: "消費", label: "休閒娛樂" },
  { kind: "expense", parent: "消費", label: "旅遊" },
  { kind: "expense", parent: "消費", label: "3C/家電" },
  { kind: "expense", parent: "消費", label: "社交應酬" },
  { kind: "expense", parent: "消費", label: "人情往來(紅白包)" },
  { kind: "expense", parent: "消費", label: "訂閱服務" },
  { kind: "expense", parent: "消費", label: "寵物" },
  { kind: "expense", parent: "消費", label: "菸酒" },
  { kind: "expense", parent: "消費", label: "個人成長/進修" },
  { kind: "expense", parent: "消費", label: "醫美/非生活必需治裝" },
  { kind: "expense", parent: "消費", label: "奢侈品" },
  { kind: "expense", parent: "稅賦", label: "綜合所得稅" },
  { kind: "expense", parent: "稅賦", label: "房屋稅" },
  { kind: "expense", parent: "稅賦", label: "地價稅" },
  { kind: "expense", parent: "稅賦", label: "牌照稅/燃料費" },
  { kind: "expense", parent: "稅賦", label: "營業稅/營所稅" },
  { kind: "expense", parent: "稅賦", label: "遺產稅/贈與稅" },
  { kind: "expense", parent: "稅賦", label: "其他稅費" },
  { kind: "expense", parent: "孝親", label: "孝親金" },
  { kind: "expense", parent: "孝親", label: "長輩生活費" },
  { kind: "expense", parent: "孝親", label: "長輩醫療/照護" },
  { kind: "expense", parent: "保險", label: "壽險保費" },
  { kind: "expense", parent: "保險", label: "醫療/健康險保費" },
  { kind: "expense", parent: "保險", label: "意外險保費" },
  { kind: "expense", parent: "保險", label: "投資型保單保費" },
  { kind: "expense", parent: "保險", label: "年金險保費" },
  { kind: "expense", parent: "保險", label: "車險/住宅火險" },
  { kind: "expense", parent: "保險", label: "勞健保自付" },
  { kind: "expense", parent: "保險", label: "國民年金保費" },
  { kind: "expense", parent: "其他", label: "慈善捐贈" },
  { kind: "expense", parent: "其他", label: "投資扣款/定期定額" },
  { kind: "expense", parent: "其他", label: "其他", note: true },
];

// 儲蓄理財投入（Excel「家庭支出綜合統計表」下半段）。
// 這一塊在原表是放在「總支出」之外的——它不是花掉，是換一個口袋放。
// 引擎的「有效儲蓄率」分子就是它，所以獨立成一個 kind，不混進 expense。
const saving: CatSeed[] = [
  { kind: "saving", parent: "儲蓄理財", label: "零存整付存款" },
  { kind: "saving", parent: "儲蓄理財", label: "儲蓄保險保費" },
  { kind: "saving", parent: "儲蓄理財", label: "定期定額ETF/基金" },
  { kind: "saving", parent: "儲蓄理財", label: "定期定額股票" },
  { kind: "saving", parent: "儲蓄理財", label: "勞退自提" },
  { kind: "saving", parent: "儲蓄理財", label: "投資型保單投資保費" },
  { kind: "saving", parent: "儲蓄理財", label: "定期定額海外/複委託" },
  { kind: "saving", parent: "儲蓄理財", label: "跟會(互助會)" },
  { kind: "saving", parent: "儲蓄理財", label: "其他儲蓄投資", note: true },
];

const asset: CatSeed[] = [
  { kind: "asset", parent: "自用資產", label: "現金", liq: "流動" },
  { kind: "asset", parent: "自用資產", label: "活期存款", liq: "流動" },
  { kind: "asset", parent: "自用資產", label: "自住不動產", liq: "固定" },
  { kind: "asset", parent: "自用資產", label: "自用車輛", liq: "固定" },
  { kind: "asset", parent: "自用資產", label: "動產-珠寶名錶", liq: "固定" },
  { kind: "asset", parent: "自用資產", label: "動產-藝術/收藏", liq: "固定" },
  { kind: "asset", parent: "自用資產", label: "動產-3C/設備", liq: "固定" },
  { kind: "asset", parent: "自用資產", label: "動產-家具家電", liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "定存", liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "外幣存款", liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "貨幣型基金", liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "儲蓄險現金價值", liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "保單現金價值", liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "股票", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "基金", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "ETF", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "債券", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "期貨/選擇權", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "投資型保單", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "加密貨幣", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "黃金/貴金屬", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "REITs", risk: true, liq: "流動" },
  { kind: "asset", parent: "可投資資產", label: "不動產", risk: true, liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "出租不動產", risk: true, liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "土地", risk: true, liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "車位", risk: true, liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "未上市股權/事業投資", risk: true, liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "私募/另類投資", risk: true, liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "勞退專戶", liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "應收帳款/借出款", liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "互助會(會錢)", liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "信託資產", liq: "固定" },
  { kind: "asset", parent: "可投資資產", label: "其他", liq: "流動", note: true },
];

const liability: CatSeed[] = [
  { kind: "liability", parent: "房貸", label: "自住房貸" },
  { kind: "liability", parent: "房貸", label: "投資房貸" },
  { kind: "liability", parent: "房貸", label: "二胎房貸" },
  { kind: "liability", parent: "房貸", label: "房屋修繕貸款" },
  { kind: "liability", parent: "車貸", label: "汽車貸款" },
  { kind: "liability", parent: "車貸", label: "機車貸款" },
  { kind: "liability", parent: "信貸", label: "信用貸款", consumer: true },
  { kind: "liability", parent: "信貸", label: "信用卡循環", consumer: true },
  { kind: "liability", parent: "信貸", label: "現金卡/預借現金", consumer: true },
  { kind: "liability", parent: "信貸", label: "分期付款", consumer: true },
  { kind: "liability", parent: "信貸", label: "卡債協商", consumer: true },
  { kind: "liability", parent: "信貸", label: "就學貸款" },
  { kind: "liability", parent: "其他", label: "私人借款(親友)" },
  { kind: "liability", parent: "其他", label: "民間借貸", consumer: true },
  { kind: "liability", parent: "其他", label: "保單借款" },
  { kind: "liability", parent: "其他", label: "股票質押借款" },
  { kind: "liability", parent: "其他", label: "不動產質借" },
  { kind: "liability", parent: "其他", label: "企業/營運週轉貸款" },
  { kind: "liability", parent: "其他", label: "融資租賃" },
  { kind: "liability", parent: "其他", label: "應付稅款" },
  { kind: "liability", parent: "其他", label: "其他", note: true },
];

export const DEFAULT_FINANCE_CATEGORIES: readonly CatSeed[] = [
  ...income,
  ...expense,
  ...saving,
  ...asset,
  ...liability,
];
