// 客戶管理前端共用的格式化 / 標籤（純函式，client 元件可用）。
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtDate(v: string | null | undefined): string {
  return v ? v : "—";
}

// 財務階段：內部值仍為 A/B/C/D（plans.health_grade），此處只做顯示層對照。
// 與 public/lantu-app.html 及 src/lib/engine.ts 的 STAGE 必須保持一致。
export const STAGE_LABEL: Record<string, string> = {
  D: "整裝期",
  C: "啟程期",
  B: "前行期",
  A: "遠行期",
};

export const STAGE_TASK: Record<string, string> = {
  D: "讓收支轉正、備妥緊急預備金與基本保障",
  C: "把儲蓄變成會生錢的資產，建立理財收入",
  B: "資產配置、抗風險，朝願景累積",
  A: "願景擴張、傳承與稅務配置",
};

// 判定條件（關卡制，與 engine.ts health() 的 grade 判定完全對應）。
export const STAGE_GATE: Record<string, string> = {
  D: "財務安全度 < 60 分，或年結餘為負",
  C: "安全度 ≥ 60 分且收支為正，但財務自由度 < 20%",
  B: "財務自由度 ≥ 20%，但願景達成度 < 60%",
  A: "安全度 ≥ 60、自由度 ≥ 20%、願景達成度 ≥ 60% 全數達標",
};

// 這階段代表什麼、為什麼課題是那一項。
export const STAGE_DESC: Record<string, string> = {
  D: "旅程的起點。先把地基補好——讓收支有結餘、備妥緊急預備金與基本保障，才有餘力談累積。",
  C: "地基已穩、正式上路。收入幾乎仍全靠工作，重點是把儲蓄轉成會生息的資產，讓理財收入長出來。",
  B: "資產已開始替你工作。重點轉為配置與抗風險，穩定朝退休、教育、置產等願景累積。",
  A: "三項指標都到位。可以把重心放在願景擴張、資產傳承與稅務效率。",
};

// 三個判定指標的計算標準。
export const STAGE_METRICS: ReadonlyArray<readonly [string, string]> = [
  ["財務安全度", "收支平衡×25 ＋ 緊急預備金×15 ＋ 信用×15 ＋ 負債平衡×15 ＋ 風險保全×30，滿分 100 分"],
  ["財務自由度", "理財收入 ÷ 家庭總支出 × 100%（理財收入能覆蓋多少比例的支出）"],
  ["願景達成度", "資產淨值 ÷ 願景總需求 × 100%（退休、教育、置產等目標的累積進度）"],
];

// 由「整裝」到「遠行」的旅程順序（教練端列表以整裝期優先）。
export const STAGE_ORDER = ["D", "C", "B", "A"] as const;

export function stageName(g: string | null | undefined): string {
  return STAGE_LABEL[g ?? ""] ?? "未評估";
}

export function stageTask(g: string | null | undefined): string {
  return STAGE_TASK[g ?? ""] ?? "";
}

export function stageGate(g: string | null | undefined): string {
  return STAGE_GATE[g ?? ""] ?? "";
}

export function stageDesc(g: string | null | undefined): string {
  return STAGE_DESC[g ?? ""] ?? "";
}

export function stageColor(g: string | null | undefined): string {
  switch (g) {
    case "D": return "#8fa6b8";
    case "C": return "#7fa8a0";
    case "B": return "#c9a86b";
    case "A": return "#e0c88b";
    default: return "#6b7d8f";
  }
}

export const STATUS_LABEL: Record<string, string> = {
  active: "進行中",
  pending: "待處理",
  archived: "已封存",
};

export const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  delivered: "已交付",
  active: "執行中",
  archived: "已封存",
};

export const REVIEW_TYPE_LABEL: Record<string, string> = {
  intro: "初談",
  review: "檢視",
  quarter: "季檢視",
  half: "半年檢視",
  annual: "年度重製",
  adhoc: "臨時",
};

export const CLIENT_SOURCES = ["原生人脈", "活動認識", "網路開發", "廣告開發", "人脈轉介", "客戶轉介", "公司分配", "其他"] as const;
export const REVIEW_TYPES = ["intro", "review", "quarter", "half", "annual", "adhoc"] as const;
