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

// 由「整裝」到「遠行」的旅程順序（教練端列表以整裝期優先）。
export const STAGE_ORDER = ["D", "C", "B", "A"] as const;

export function stageName(g: string | null | undefined): string {
  return STAGE_LABEL[g ?? ""] ?? "未評估";
}

export function stageTask(g: string | null | undefined): string {
  return STAGE_TASK[g ?? ""] ?? "";
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
