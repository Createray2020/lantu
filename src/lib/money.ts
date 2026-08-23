// 全站金額格式化的唯一真相。
//
// 為什麼要有這一支：2026/08 的盤點在 repo 裡數出 14 支各自為政的格式化函式
// （兩支同名 fmtMoney 實作不同、兩支同名 show 在不同檔案、13 處 .toLocaleString()
// 連 locale 參數都沒帶——那會跟著瀏覽器語系跑）。同一筆金額在不同分頁長不一樣，
// 教練切分頁時容易看錯位數。所有「金額 → 給人看的文字」一律走這裡。
//
// 標準規格（2026/08/23 拍板）：
//   ・整數，四捨五入到元，不留小數
//   ・千位逗號
//   ・不帶「元」也不帶 NT$（單位寫在欄位標題／旁邊，需要前綴時用 fmtNTD）
//   ・無效值（null / undefined / NaN / Infinity）顯示破折號，不是 0
//
// ⚠️ 兩個例外，不要套進來：
//   1. CSV 匯出／匯入範本（src/lib/comp/csv.ts、api/comp/export、importCases 的
//      importTemplateRows）必須是裸值——normalizeNumber() 在匯入端主動剝逗號，
//      這條「匯出→回填→匯入」的來回路徑要求純數字。
//   2. public/lantu-app.html 有自己的一份對照實作（fmt / amtFmt / amtRaw），
//      因為那是不經打包的獨立單檔。行為必須一致，由 money.drift.test.ts 對拍。

/** 千位逗號（整數）。與 lantu-app.html 的 fmt()、engine.ts 的 fmt() 同一套 regex。 */
function group(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  // 使用者貼進來的值可能已經帶逗號或「元」。
  return Number(String(v).replace(/[,$＄\s元]/g, ""));
}

/**
 * 金額 → 顯示文字。無效值回破折號。
 * 「沒有資料」與「真的是 0」是兩回事，不要把 null 顯示成 0。
 */
export function fmtMoney(v: unknown): string {
  const n = toNum(v);
  if (!Number.isFinite(n)) return "—";
  return group(String(Math.round(n)));
}

/** 同 fmtMoney，但無效值當 0（用在「合計」這種空白會很怪的位置）。 */
export function fmtMoney0(v: unknown): string {
  const n = toNum(v);
  return group(String(Number.isFinite(n) ? Math.round(n) : 0));
}

/** 帶 NT$ 前綴。 */
export function fmtNTD(v: unknown): string {
  const s = fmtMoney(v);
  return s === "—" ? s : "NT$" + s;
}

/** 元 → 萬（整數，一樣補千分位）。破千萬的房貸會是 1,234 萬。 */
export function fmtWan(nt: unknown): string {
  const n = toNum(nt);
  if (!Number.isFinite(n)) return "—";
  return group(String(Math.round(n / 10000)));
}

/**
 * 圖表座標軸用的縮寫（億／萬）。位數多的軸標籤攤開會互相重疊。
 * 與 lantu-app.html 的 cfAxis() 行為一致。
 */
export function fmtCompact(v: unknown): string {
  const n = toNum(v);
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sg = n < 0 ? "-" : "";
  if (a >= 1e8) return sg + (a / 1e8).toFixed(a >= 1e9 ? 0 : 1) + "億";
  if (a >= 1e4) return sg + group(String(Math.round(a / 1e4))) + "萬";
  return fmtMoney(n);
}

// ===== 金額輸入欄 =====
// <input type="number"> 規格上就顯示不了逗號，所以金額欄一律 text + inputmode="numeric"，
// 自己補逗號、自己保住游標。送進 state／引擎前一定要過 parseMoney()，
// 否則 Number('1,200') = NaN 會靜默存成 0。

/** 邊打邊補逗號。允許開頭負號，其餘非數字一律丟掉。 */
export function amtFmt(v: unknown): string {
  const t = String(v === null || v === undefined ? "" : v);
  if (t === "") return "";
  const neg = /^\s*-/.test(t);
  const d = t.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  if (d === "") return neg ? "-" : "";
  return (neg ? "-" : "") + group(d);
}

/** 拆掉逗號，回純數字字串（給 Number() 吃）。 */
export function amtRaw(v: unknown): string {
  return String(v === null || v === undefined ? "" : v).replace(/,/g, "");
}

/** 輸入字串 → number。空字串與無效值回 0。 */
export function parseMoney(v: unknown): number {
  const n = Number(amtRaw(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 邊打邊格式化後，把游標放回使用者原本那個數字上。
 * 回傳新的 value 與游標位置——不直接碰 DOM，方便 React 與測試共用。
 */
export function amtCaret(value: string, caret: number): { value: string; caret: number } {
  const keep = value.slice(0, caret).replace(/[^\d]/g, "").length;
  const after = amtFmt(value);
  if (after === value) return { value, caret };
  let i = 0;
  let seen = 0;
  while (i < after.length && seen < keep) {
    if (/\d/.test(after[i])) seen++;
    i++;
  }
  return { value: after, caret: i };
}
