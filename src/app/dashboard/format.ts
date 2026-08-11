// 客戶管理前端共用的格式化 / 標籤（純函式，client 元件可用）。
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtDate(v: string | null | undefined): string {
  return v ? v : "—";
}

export function gradeColor(g: string | null | undefined): string {
  switch (g) {
    case "A": return "#7bbf6a";
    case "B": return "#5aa9c9";
    case "C": return "#c99a5b";
    case "D": return "#d9773f";
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
