// AI 助理的欄位註冊表（2026/10/25 Ray 拍板啟動顧問端助理）。
//
// 這張表是助理「找到對應位置」的唯一依據：模型看到的是這裡的中文名稱／別名／型別／選項，
// 回來的是資料路徑（arr＋index＋field），不是畫面上的任何東西。版面怎麼改都不影響它；
// 會影響它的只有 c.* 的資料結構——所以 assistantFields.drift.test.ts 把每一欄釘在
// public/lantu-app.html 的 addRow 範本（TPL）與 sampleCase().profile 上：範本少一個 key、
// 或這裡寫了範本沒有的 key，npm run check 直接紅。
//
// 首波八個資料面（2026/10/25 Ray 拍板「只改既有欄位的值＋常用表新增一列」）：
//   profile／members／incomes／expenses／assets／liabilities／policies／goals。
// 沒登記的欄位助理一律回「這個我還不能幫你填」，不猜。
//
// ⚠️ 金額一律**年化**存（period 只影響輸入與顯示，見 setAmtByPeriod／shownAmt）。
//    助理回的是「照 period 說的金額」（月就是每月），annualize 標記的欄位由 resolveOps 乘回去。
// ⚠️ 細類（subType／subCat／type／mainCat）要走 setCat() 才會連動大類與 risk／cls／consumerDebt，
//    所以這些欄位標 via:'cat'；保單險種細分走 setPolicySub()（會換 claimNote 範本），標 via:'polsub'。

export type FieldVia = "set" | "cat" | "polsub" | "memrole" | "debtuse";
export type FieldType = "text" | "num" | "money" | "bool" | "select" | "member" | "pct" | "date";

export type FieldDef = {
  key: string;
  label: string;
  aliases?: string[];
  type: FieldType;
  /** 固定選項；細類改用 cats（後台字典，執行時填入）。 */
  options?: string[];
  /** 細類字典：kind 對 financeCategories 的 CatKind，level 'parent'＝大類、'sub'＝細類。 */
  cats?: { kind: "income" | "expense" | "asset" | "liability"; level: "parent" | "sub" };
  via?: FieldVia;
  /** 'period'＝依同列 period 欄（月→×12）年化後再寫。 */
  annualize?: "period";
  hint?: string;
};

export type ArrayDef = {
  arr: string;
  label: string;
  aliases: string[];
  /** 'list'＝陣列（有 index）；'object'＝單一物件（profile）。 */
  kind: "list" | "object";
  /** 規劃器「資料」大分頁底下的子分頁（app.dataTab），套用後跳過去用。 */
  tab: string;
  /** 可不可以新增一列。 */
  addable: boolean;
  /** 用來讓模型與教練認出「哪一列」的欄位（列清單會印這些）。 */
  show: string[];
  /** 這些 key 為真的列是投影列，不給改（薪資自動列／保費自動列／健保自動列／明細表的 tag 列）。 */
  protectedWhen?: string[];
  fields: FieldDef[];
};

const PERIOD: FieldDef = { key: "period", label: "週期", aliases: ["每月", "每年", "月繳", "年繳"], type: "select", options: ["年", "月"] };
const OWNER: FieldDef = { key: "owner", label: "持有人", aliases: ["誰的", "名下"], type: "member" };
const START: FieldDef = { key: "start", label: "起始歲", aliases: ["從幾歲開始", "起"], type: "num" };
const END: FieldDef = { key: "end", label: "結束歲", aliases: ["到幾歲", "訖"], type: "num" };

export const ASSISTANT_ARRAYS: ArrayDef[] = [
  {
    arr: "profile",
    label: "本人基本資料",
    aliases: ["本人", "客戶本人", "基本資料"],
    kind: "object",
    tab: "family",
    addable: false,
    show: ["name"],
    fields: [
      { key: "name", label: "姓名", type: "text" },
      { key: "gender", label: "性別", type: "select", options: ["男", "女"] },
      { key: "birth", label: "生日", aliases: ["出生日期"], type: "date", hint: "YYYY-MM-DD" },
      { key: "age", label: "年齡", aliases: ["歲"], type: "num" },
      { key: "retireAge", label: "預計退休年齡", aliases: ["退休年齡", "幾歲退休"], type: "num" },
      { key: "lifeExp", label: "預期壽命", aliases: ["活到幾歲", "規劃到幾歲"], type: "num" },
      { key: "monthlySalary", label: "本人月薪", aliases: ["月薪", "薪水", "每月薪資"], type: "money", hint: "每月；收入表的薪資列由它自動長出" },
      { key: "jobType", label: "工作類別", aliases: ["職業類型"], type: "select", options: ["一般就業者", "業務工作者", "企業主", "家管", "投資者", "其他"] },
    ],
  },
  {
    arr: "members",
    label: "家庭成員",
    aliases: ["家人", "成員", "配偶", "太太", "先生", "小孩", "子女", "父母"],
    kind: "list",
    tab: "family",
    addable: true,
    show: ["name", "role", "age"],
    fields: [
      { key: "name", label: "姓名", aliases: ["名字"], type: "text" },
      { key: "role", label: "關係", aliases: ["角色", "身分"], type: "select", via: "memrole", options: ["本人", "配偶", "父", "母", "子女", "長輩", "其他"] },
      { key: "gender", label: "性別", type: "select", options: ["男", "女"] },
      { key: "age", label: "年齡", aliases: ["歲"], type: "num" },
      { key: "expRatio", label: "生活支出佔比%", aliases: ["支出比例"], type: "pct" },
      { key: "depRatio", label: "依賴度%", aliases: ["被扶養比例"], type: "pct" },
      { key: "indepAge", label: "財務獨立歲", aliases: ["幾歲獨立"], type: "num" },
      { key: "worked", label: "勞保年資", aliases: ["工作年資"], type: "num" },
      { key: "insSalary", label: "投保薪資", aliases: ["勞保投保級距"], type: "money" },
    ],
  },
  {
    arr: "incomes",
    label: "收入",
    aliases: ["收入表", "薪資", "獎金", "租金收入", "股利"],
    kind: "list",
    tab: "finance",
    addable: true,
    show: ["name", "owner", "subType", "period", "amount"],
    protectedWhen: ["salaryAuto"],
    fields: [
      { key: "name", label: "項目", aliases: ["名稱"], type: "text" },
      OWNER,
      { key: "type", label: "類別", aliases: ["大類"], type: "select", cats: { kind: "income", level: "parent" }, via: "cat" },
      { key: "subType", label: "子類別", aliases: ["細類", "細項"], type: "select", cats: { kind: "income", level: "sub" }, via: "cat" },
      PERIOD,
      { key: "amount", label: "金額", aliases: ["多少錢", "每月", "每年"], type: "money", annualize: "period", hint: "依週期填（月＝每月金額）" },
      { key: "growth", label: "成長率%", aliases: ["每年成長"], type: "pct" },
      START,
      END,
    ],
  },
  {
    arr: "expenses",
    label: "支出",
    aliases: ["支出表", "開銷", "花費", "生活費", "房租", "學費", "保費", "孝親"],
    kind: "list",
    tab: "finance",
    addable: true,
    show: ["name", "cat", "subCat", "period", "amount"],
    protectedWhen: ["premAuto", "nhiAuto", "tag"],
    fields: [
      { key: "name", label: "項目", aliases: ["名稱"], type: "text" },
      { key: "cat", label: "分類", aliases: ["大類"], type: "select", cats: { kind: "expense", level: "parent" }, via: "cat" },
      { key: "subCat", label: "細項", aliases: ["細類", "子類別"], type: "select", cats: { kind: "expense", level: "sub" }, via: "cat" },
      PERIOD,
      { key: "amount", label: "金額", aliases: ["多少錢", "每月", "每年"], type: "money", annualize: "period", hint: "依週期填（月＝每月金額）" },
      { key: "infl", label: "隨通膨成長", aliases: ["通膨"], type: "bool" },
      { key: "cut", label: "可刪減%", aliases: ["可以砍多少"], type: "pct" },
      START,
      END,
    ],
  },
  {
    arr: "assets",
    label: "資產",
    aliases: ["資產表", "存款", "股票", "基金", "房子", "不動產", "定存", "現金"],
    kind: "list",
    tab: "finance",
    addable: true,
    show: ["name", "owner", "type", "value"],
    fields: [
      { key: "name", label: "名稱", aliases: ["項目"], type: "text" },
      OWNER,
      { key: "mainCat", label: "主分類", aliases: ["大類"], type: "select", cats: { kind: "asset", level: "parent" }, via: "cat" },
      { key: "type", label: "類型", aliases: ["細類", "資產類型"], type: "select", cats: { kind: "asset", level: "sub" }, via: "cat" },
      { key: "value", label: "現值", aliases: ["市值", "金額", "餘額", "多少錢"], type: "money", hint: "原幣" },
      { key: "cost", label: "成本", aliases: ["買價", "投入成本"], type: "money" },
      { key: "ret", label: "預期報酬率%", aliases: ["報酬率", "殖利率"], type: "pct" },
      { key: "income", label: "年收益", aliases: ["每年配息", "租金"], type: "money", hint: "留空＝用報酬率推" },
      { key: "currency", label: "幣別", type: "select", options: ["台幣", "美金", "人民幣", "日圓", "港幣", "其他"] },
      { key: "cls", label: "流動性", type: "select", options: ["流動", "固定"] },
      { key: "region", label: "地區", type: "select", options: ["台灣", "美國", "韓國", "其他海外"] },
    ],
  },
  {
    arr: "liabilities",
    label: "負債",
    aliases: ["負債表", "貸款", "房貸", "車貸", "信貸", "卡債", "借款", "債務"],
    kind: "list",
    tab: "finance",
    addable: true,
    show: ["name", "owner", "mainCat", "balance", "pay"],
    fields: [
      { key: "name", label: "項目", aliases: ["名稱"], type: "text" },
      OWNER,
      { key: "mainCat", label: "主分類", aliases: ["大類", "貸款類型"], type: "select", cats: { kind: "liability", level: "parent" }, via: "cat" },
      { key: "subCat", label: "細項", aliases: ["細類"], type: "select", cats: { kind: "liability", level: "sub" }, via: "cat" },
      // 用途＝借來的錢去了哪裡（2026/10/25 負債改看目的分類）。走 setDebtUse 才會同步 consumerDebt 衍生值。
      { key: "use", label: "用途", aliases: ["借來做什麼", "貸款用途", "拿去"], type: "select", via: "debtuse", options: ["自用", "投資", "消費", "其他"], hint: "自用（自住房、自用車、就學）／投資／消費／其他（轉借親友、週轉）" },
      { key: "balance", label: "餘額", aliases: ["剩多少", "本金餘額", "還欠"], type: "money", hint: "原幣" },
      { key: "rate", label: "年利率%", aliases: ["利率"], type: "pct" },
      { key: "pay", label: "月付金", aliases: ["每月還", "月繳", "每月付"], type: "money", hint: "每月" },
      { key: "months", label: "剩餘月數", aliases: ["還剩幾期", "剩幾個月", "剩幾年"], type: "num", hint: "年要換成月" },
      { key: "grace", label: "寬限期(月)", aliases: ["寬限"], type: "num" },
      { key: "repay", label: "攤還方式", type: "select", options: ["本息攤還", "本金平均", "只付利息", "暫緩還款"] },
      { key: "currency", label: "幣別", type: "select", options: ["台幣", "美金", "其他"] },
    ],
  },
  {
    arr: "policies",
    label: "保單",
    aliases: ["保險", "保單表", "壽險", "醫療險", "意外險", "癌症險", "實支實付", "長照險"],
    kind: "list",
    tab: "coverage",
    addable: true,
    show: ["name", "insured", "subtype", "premium", "payMode"],
    fields: [
      { key: "name", label: "商品名稱", aliases: ["保單名稱"], type: "text" },
      { key: "insurer", label: "保險公司", aliases: ["公司"], type: "text" },
      { key: "insured", label: "被保險人", aliases: ["被保人", "保誰"], type: "member" },
      { key: "owner", label: "要保人", aliases: ["繳費的人"], type: "member" },
      { key: "beneficiary", label: "受益人", type: "text" },
      { key: "bigCat", label: "大類", type: "select", options: ["人身", "產物"] },
      { key: "subtype", label: "險種細分", aliases: ["險種", "什麼險"], type: "select", via: "polsub", options: ["終身壽險", "定期壽險", "增額/儲蓄壽險", "投資型壽險", "住院醫療(日額)", "實支實付", "手術", "重大傷病", "防癌(一次金)", "防癌(住院日額)", "重大疾病", "特定傷病", "意外身故/失能", "意外醫療", "長期照顧", "失能扶助", "失能所得", "年金", "汽車強制", "汽車第三人責任", "汽車車體", "汽車竊盜", "機車強制", "機車第三人", "住宅火險", "地震險", "居家綜合", "個人責任", "公共意外", "雇主責任", "旅平險", "海外突發疾病", "寵物險", "商業火險", "其他"] },
      { key: "policyKind", label: "主約／附約", type: "select", options: ["主約", "附約"] },
      { key: "premium", label: "保費", aliases: ["每期保費", "一年繳多少"], type: "money", hint: "每期（依繳別）" },
      { key: "payMode", label: "繳別", aliases: ["怎麼繳"], type: "select", options: ["年繳", "半年繳", "季繳", "月繳"] },
      { key: "payYears", label: "繳費年期", aliases: ["繳幾年"], type: "num" },
      { key: "paidYears", label: "已繳年數", aliases: ["繳了幾年"], type: "num" },
      { key: "effDate", label: "生效日", aliases: ["投保日"], type: "date", hint: "YYYY-MM-DD" },
      { key: "status", label: "狀態", type: "select", options: ["有效", "繳費中", "已繳清", "停效", "失效"] },
      { key: "life", label: "壽險保額", aliases: ["身故保額", "保額"], type: "money" },
      { key: "accident", label: "意外保額", aliases: ["意外身故／失能保額"], type: "money" },
      { key: "medical", label: "住院日額", aliases: ["日額", "住院一天"], type: "money" },
      { key: "medMisc", label: "實支實付限額", aliases: ["雜費限額", "實支"], type: "money" },
      { key: "critical", label: "重大疾病一次金", aliases: ["重疾"], type: "money" },
      { key: "firstCancer", label: "癌症一次金", aliases: ["防癌一次金"], type: "money" },
      { key: "cancerHosp", label: "癌症住院日額", type: "money" },
      { key: "monthCare", label: "長照月給付", aliases: ["長照", "失能扶助金"], type: "money", hint: "每月" },
      { key: "incomeCompDay", label: "薪資補償(日)", type: "money" },
      { key: "incomeCompMonth", label: "薪資補償(月)", type: "money" },
      { key: "cashValue", label: "現金價值／保價金", aliases: ["保價金", "解約金"], type: "money" },
    ],
  },
  {
    arr: "goals",
    label: "目標／置產／願望",
    aliases: ["目標", "買房", "購屋", "買車", "購車", "結婚", "生小孩", "創業", "願望", "夢想"],
    kind: "list",
    tab: "goals",
    addable: true,
    show: ["name", "type", "present", "start"],
    protectedWhen: ["tag"],
    fields: [
      { key: "on", label: "納入規劃", aliases: ["要算", "納入"], type: "bool" },
      { key: "name", label: "名稱", type: "text" },
      { key: "type", label: "類型", type: "select", options: ["購屋", "置產", "購車", "土地", "婚姻", "生育", "孝親", "職涯轉換", "創業", "傳承", "其他"] },
      { key: "present", label: "金額(理想)", aliases: ["預算", "金額", "多少錢", "總價"], type: "money", hint: "現值" },
      { key: "minPresent", label: "金額(最低)", aliases: ["最少", "底線"], type: "money" },
      { key: "start", label: "起始歲", aliases: ["幾歲要", "幾歲買"], type: "num" },
      { key: "end", label: "結束歲", type: "num" },
      { key: "latest", label: "最晚完成歲", aliases: ["最晚"], type: "num" },
      { key: "freq", label: "頻率(年)", aliases: ["每幾年一次"], type: "num", hint: "0＝一次性" },
      { key: "growth", label: "成長依據", type: "select", options: ["通膨", "薪資", "固定"] },
      { key: "appreciation", label: "年漲幅%", type: "pct" },
      { key: "loanRatio", label: "貸款成數%", aliases: ["貸幾成"], type: "pct" },
      { key: "imp", label: "重要度(1–5)", aliases: ["重要性", "優先"], type: "num" },
      { key: "prepared", label: "已備", aliases: ["已經存了", "準備好的"], type: "money" },
    ],
  },
];

export function arrayDef(arr: string): ArrayDef | null {
  return ASSISTANT_ARRAYS.find((a) => a.arr === arr) ?? null;
}
export function fieldDef(arr: string, key: string): FieldDef | null {
  return arrayDef(arr)?.fields.find((f) => f.key === key) ?? null;
}

/** 給 drift 測試用：每個資料面登記了哪些 key。 */
export function registeredKeys(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const a of ASSISTANT_ARRAYS) out[a.arr] = a.fields.map((f) => f.key);
  return out;
}
