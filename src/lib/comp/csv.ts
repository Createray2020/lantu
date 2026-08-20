// CSV 產生與解析（純函式，零依賴）。
//
// 為什麼是 CSV 不是 .xlsx：會計要的是「能開、能貼進他自己的表」，
// CSV 加上 BOM 之後 Excel 直接雙擊就正確顯示中文，而且不必為了一個匯出多背一個套件。
// 真的需要多工作表／格式的 .xlsx 再換 exceljs。

/** Excel 相容：欄位含逗號、引號、換行時加引號，內部引號成對。 */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 產出 CSV 字串（含 UTF-8 BOM，否則 Excel 開中文會變亂碼）。 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const body = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return `﻿${body}`;
}

/**
 * 解析 CSV。支援引號包住的欄位、欄位內換行與 "" 逸出。
 * 手寫而不是用套件：格式固定、量不大，而且匯入要能逐列報錯，
 * 套件的容錯行為反而會把壞資料默默吃掉。
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  // 去掉尾端全空的列（檔案最後常多一個換行）。
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** 把 CSV 表格轉成物件陣列，以第一列為表頭。 */
export function csvToObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const table = parseCsv(text);
  if (!table.length) return { headers: [], rows: [] };
  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
  return { headers, rows };
}

/** 民國年、斜線、點號都轉成 YYYY-MM-DD；認不出來回 null。 */
export function normalizeDate(v: string): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2,4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y < 1911) y += 1911;          // 民國年
  const mm = String(Number(m[2])).padStart(2, "0");
  const dd = String(Number(m[3])).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** 去掉千分位與貨幣符號的數字解析；認不出來回 null（不回 0，0 是有意義的值）。 */
export function normalizeNumber(v: string): number | null {
  const s = (v || "").replace(/[,$＄\s元]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
