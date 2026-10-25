// 帳務：尚未匯款總表 CSV（2026/10/16 Ray：不管哪個月還沒匯的，一鍵匯出給會計）。
// 後台權限；UTF-8 BOM（toCsv 帶）讓 Excel 雙擊就正確顯示中文；
// 銀行代碼與帳號用 ="0123" 的寫法，Excel 才不會把前導零吃掉或變成科學記號。

import { ensureCoach, isAdmin } from "@/lib/coach";
import { getAcctState } from "@/lib/acctStore";
import { unpaidCsvRows, UNPAID_CSV_HEADERS } from "@/lib/acctEngine";
import { CsvRaw, toCsv } from "@/lib/comp/csv";

export const dynamic = "force-dynamic";

// 只有「全數字」的帳號／代碼才包成公式文字；包成 CsvRaw 讓 toCsv 的公式注入防護放行這一格。
const asText = (s: string) => (s && /^[\d-]+$/.test(s) ? new CsvRaw(`="${s}"`) : s);

export async function GET() {
  const me = await ensureCoach();
  if (!me || !(await isAdmin(me))) return new Response("forbidden", { status: 403 });
  const S = await getAcctState();
  const rows = unpaidCsvRows(S).map((r) => r.map((v, i) => (i === 3 || i === 7 ? asText(v) : v)));
  const today = new Date().toISOString().slice(0, 10);
  const filename = `嵐途_尚未匯款_${today}.csv`;
  return new Response(toCsv([...UNPAID_CSV_HEADERS], rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="unpaid.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
