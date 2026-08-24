// 教練編號／客戶編號（2026/08/24 Ray 拍板）。
//
// 格式＝「身分前綴 + 西元年後兩碼 + 月 + 三碼流水號」：
//   教練 FC2609002 ＝ 2026 年 9 月第二位報聘的教練
//   客戶 2610005  ＝ 2026 年 10 月第五位客戶（客戶身分不加前綴）
//
// 兩條地基語意，動之前先想清楚：
//   ① 流水號**按月重新起算**，不是全站連號。所以 ym 一定要跟著發號當下的月份走。
//   ② 編號一旦發出就**永不變更**：教練停權再復權、客戶封存再啟用、改名、換教練，
//      通通不重發。客戶名片上、對帳單上、報告書上印的都是它。
//
// 月份一律以**台北時區**判定。Vercel 跑 UTC，台灣時間 9/1 早上七點在 UTC 還是 8/31——
// 用 UTC 會讓當月第一位客戶拿到上個月的號，而那個號很可能已經被用掉了（→ unique 撞號）。

/** 純函式層可測試的最小輸入。 */
export type CodeKind = "coach" | "client";

export const CODE_PREFIX: Record<CodeKind, string> = {
  coach: "FC",
  client: "",
};

/** 發號當下的 YYMM（台北時區）。 */
export function ymTaipei(now: Date = new Date(), timeZone = "Asia/Taipei"): string {
  // en-CA 給的是 YYYY-MM-DD，取 3~4 位的年尾兩碼與月份。
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return iso.slice(2, 4) + iso.slice(5, 7);
}

/**
 * 組出編號。
 * 流水號固定補到三碼；超過 999 就自然長成四碼（1000 → FC26091000），
 * **不截斷**——寧可號變長也不能兩個人同號。
 */
export function formatCode(kind: CodeKind, ym: string, seq: number): string {
  return CODE_PREFIX[kind] + ym + String(seq).padStart(3, "0");
}

/** 解析編號；格式不合回 null。用來判斷使用者輸入的是教練號還是客戶號。 */
export function parseCode(raw: string): { kind: CodeKind; ym: string; seq: number } | null {
  const s = (raw || "").trim().toUpperCase().replace(/[\s-]/g, "");
  const m = /^(FC)?(\d{4})(\d{3,})$/.exec(s);
  if (!m) return null;
  const kind: CodeKind = m[1] ? "coach" : "client";
  const ym = m[2];
  const mm = +ym.slice(2);
  if (mm < 1 || mm > 12) return null;
  return { kind, ym, seq: +m[3] };
}

/** 使用者輸入的正規化（去空白、去連字號、轉大寫）。查詢前一律先過這支。 */
export function normalizeCode(raw: string): string {
  return (raw || "").trim().toUpperCase().replace(/[\s-]/g, "");
}
