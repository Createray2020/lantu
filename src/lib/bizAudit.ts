// 企業財報勾稽檢核（驗算層）。純函式，不碰 db、不改資料、不擋存檔。
//
// 為什麼要有這一層：
// 財報與 401 是少數「可以自我驗算」的文件——資產＝負債＋權益、
// 銷項稅額＝應稅銷售額×5%、6 期 401 銷售額合計≈損益表營業收入。
// 有這些恆等式在，一個 key 錯的數字（78,000,000 打成 7,800,000）當場就會露餡；
// 沒有的話，它會安靜地把整合式個人資產負債表、股權估值、遺產稅全部帶偏，
// 而畫面上完全看不出來。
//
// 這一層也是「財報拍照擷取」的落地基礎（見專案記憶 財報擷取_待金鑰）：
// 擷取只是換掉輸入方式，回來的數字一樣要跑這一套才准自動填。
// 動工時直接 import 本檔，**不要另外寫一套**。
//
// ⚠️ public/lantu-app.html 是獨立 HTML 無法 import 本檔，另有一份同邏輯的實作；
//    src/lib/bizModule.test.ts 會「跑同一份 fixture 比對兩邊輸出」，改這裡務必同步改那裡。
//
// 三個語意原則（別「順手優化」掉）：
//   1. 原料不足一律 'na'（資料不足），絕不當成 'ok'。把沒問到的當成沒問題是這類檢核最危險的失誤。
//   2. 檢核只說「對不起來」，不改資料、不擋存檔。
//   3. 「對不起來不是罪，說不出理由才是」——每一項都能填原因，填了就從 fail 降成 warn 並留紀錄。

import { fmtMoney } from "@/lib/money";

export type AuditLevel = "ok" | "warn" | "fail" | "na";

export type AuditItem = {
  id: string;
  group: "資產負債表" | "損益表" | "401 內部" | "跨文件";
  title: string;
  level: AuditLevel;
  detail: string;   // 算出來的實際數字，讓人看得到差在哪
  fix: string;      // 不通過時該去確認什麼
};

/* eslint-disable @typescript-eslint/no-explicit-any */

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};
// 「有填」與「填 0」是兩回事：沒填要回 na，填 0 是一個真實的答案。
const has = (v: unknown): boolean => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
const fmt = fmtMoney; // 格式規格集中在 @/lib/money
const pctOf = (a: number, b: number): number => (b === 0 ? 0 : Math.abs(a) / Math.abs(b));

/** 容差：財報上的數字常有千元位四捨五入，差幾百塊不算對不起來。 */
export const TOLERANCE_ABS = 1000;
/** 比率型容差：跨文件差異在 2% 以內視為正常（開票時點差異本來就會有）。 */
export const TOLERANCE_RATE = 0.02;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(TOLERANCE_ABS, Math.abs(b) * 0.001);

/** 401 與帳載收入的合理差異來源（手冊第 4.7 節）。逐項填金額後，剩下的才是「無法解釋的差額」。 */
export const RECONCILE_REASONS = [
  "開票時點與收入認列時點差異",
  "外銷零稅率（收入認列與報關時點不同）",
  "非營業收入（利息、租金、處分資產）未開發票",
  "預收款已開票但尚未認列收入",
  "視為銷貨（自用、贈送、樣品）",
  "跨期折讓與退回",
  "免稅銷售額",
  "其他（請於備註說明）",
] as const;

export type ReconcileRow = { year: number | string; reason: string; amount: number; note?: string };

/**
 * 跑完整組檢核。
 * @param c 一份 case（吃 companies[0] / bizYears / vat401 / reconcile / auditNotes）
 */
export function auditBiz(c: any): AuditItem[] {
  const co = (Array.isArray(c?.companies) ? c.companies[0] : null) || {};
  const years: any[] = Array.isArray(c?.bizYears) ? c.bizYears : [];
  const vats: any[] = Array.isArray(c?.vat401) ? c.vat401 : [];
  const notes: Record<string, string> = (c?.auditNotes && typeof c.auditNotes === "object") ? c.auditNotes : {};
  const out: AuditItem[] = [];

  const push = (id: string, group: AuditItem["group"], title: string, level: AuditLevel, detail: string, fix: string) => {
    // 「說得出理由」就從 fail 降成 warn——對不起來不是罪，說不出理由才是。
    const why = (notes[id] || "").trim();
    if (level === "fail" && why) out.push({ id, group, title, level: "warn", detail: `${detail}　｜　已說明：${why}`, fix });
    else out.push({ id, group, title, level, detail, fix });
  };

  // ── 資產負債表 ──
  const ta = n(co.totalAsset), td = n(co.totalDebt), eq = co.equity;
  if (!has(co.totalAsset) || !has(co.totalDebt) || !has(eq)) {
    push("bs.identity", "資產負債表", "資產 ＝ 負債 ＋ 權益", "na",
      "尚未填「股東權益」（選填）——填了才驗得動這條恆等式", "在公司概況補上財報上的股東權益數字");
  } else {
    const diff = ta - (td + n(eq));
    push("bs.identity", "資產負債表", "資產 ＝ 負債 ＋ 權益", near(ta, td + n(eq)) ? "ok" : "fail",
      `資產 ${fmt(ta)}　負債 ${fmt(td)}　權益 ${fmt(n(eq))}　差額 ${fmt(diff)}`,
      "三個數字是財報上分別印出來的，對不起來通常是其中一個 key 錯了");
  }

  const parts = [["現金", co.cash], ["應收帳款", co.ar], ["存貨", co.inventory]] as const;
  const filled = parts.filter((p) => has(p[1]));
  if (!has(co.totalAsset) || !filled.length) {
    push("bs.parts", "資產負債表", "現金＋應收＋存貨 ≤ 總資產", "na", "尚未填總資產或三項科目", "補上第二批的訊號原料");
  } else {
    const sub = filled.reduce((s, p) => s + n(p[1]), 0);
    push("bs.parts", "資產負債表", "現金＋應收＋存貨 ≤ 總資產", sub <= ta + TOLERANCE_ABS ? "ok" : "fail",
      `${filled.map((p) => `${p[0]} ${fmt(n(p[1]))}`).join("　")}　合計 ${fmt(sub)}　總資產 ${fmt(ta)}`,
      "流動資產科目的合計不可能超過總資產，先確認單位（千元 vs 元）");
  }

  if (!has(co.retained) || !has(eq)) {
    push("bs.retained", "資產負債表", "累積未分配盈餘 ≤ 股東權益", "na", "尚未填未分配盈餘或股東權益", "兩個都填了才驗得動");
  } else {
    push("bs.retained", "資產負債表", "累積未分配盈餘 ≤ 股東權益", n(co.retained) <= n(eq) + TOLERANCE_ABS ? "ok" : "fail",
      `未分配盈餘 ${fmt(n(co.retained))}　股東權益 ${fmt(n(eq))}`,
      "未分配盈餘是權益的一部分，不可能比權益大");
  }

  // ── 損益表（逐年）──
  const sorted = years.slice().sort((a, b) => n(b.year) - n(a.year));
  if (!sorted.length) {
    push("is.structure", "損益表", "毛利 ≥ 營業利益，且都 ≤ 營收", "na", "尚未填三年財務摘要", "在公司概況的「三年財務摘要」補上");
    push("is.nonop", "損益表", "淨利與營業利益的差＝業外損益", "na", "尚未填三年財務摘要", "同上");
    push("is.trend", "損益表", "三年趨勢無異常跳動", "na", "至少要兩個年度才看得出趨勢", "同上");
  } else {
    const bad = sorted.filter((y) => has(y.rev) && has(y.gross) && has(y.op) && (n(y.gross) > n(y.rev) + TOLERANCE_ABS || n(y.op) > n(y.gross) + TOLERANCE_ABS));
    push("is.structure", "損益表", "毛利 ≥ 營業利益，且都 ≤ 營收", bad.length ? "fail" : "ok",
      bad.length ? bad.map((y) => `${n(y.year)}：營收 ${fmt(n(y.rev))}　毛利 ${fmt(n(y.gross))}　營業利益 ${fmt(n(y.op))}`).join("；")
        : sorted.filter((y) => has(y.rev)).map((y) => `${n(y.year)} 毛利率 ${(pctOf(n(y.gross), n(y.rev)) * 100).toFixed(1)}%`).join("　"),
      "毛利不可能大於營收、營業利益不可能大於毛利；先確認欄位有沒有填錯格");

    const nonop = sorted.filter((y) => has(y.op) && has(y.net) && n(y.op) !== 0 && pctOf(n(y.net) - n(y.op), n(y.op)) > 0.3);
    push("is.nonop", "損益表", "淨利與營業利益的差＝業外損益", nonop.length ? "fail" : "ok",
      nonop.length ? nonop.map((y) => `${n(y.year)}：營業利益 ${fmt(n(y.op))} → 稅後淨利 ${fmt(n(y.net))}（差 ${fmt(n(y.net) - n(y.op))}）`).join("；")
        : "各年度的業外損益都在營業利益的 30% 以內",
      "先看營業利益、不要先看淨利——淨利可能是賣掉一台車撐起來的，那不是本業能力。差距大請說明業外項目");

    if (sorted.length < 2) {
      push("is.trend", "損益表", "三年趨勢無異常跳動", "na", "只有一個年度，看不出趨勢", "補上前兩年");
    } else {
      const jumps: string[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i], b = sorted[i + 1];
        if (has(a.rev) && has(b.rev) && n(b.rev) > 0 && pctOf(n(a.rev) - n(b.rev), n(b.rev)) > 0.5) {
          jumps.push(`${n(b.year)}→${n(a.year)} 營收 ${fmt(n(b.rev))} → ${fmt(n(a.rev))}`);
        }
      }
      push("is.trend", "損益表", "三年趨勢無異常跳動", jumps.length ? "fail" : "ok",
        jumps.length ? jumps.join("；") : `${sorted.length} 個年度，年增率都在 ±50% 以內`,
        "單年變動超過五成通常有事（單一大案、業務轉型、或 key 錯位數），請確認並說明");
    }
  }

  // ── 401 內部 ──
  if (!vats.length) {
    ["vat.outTax", "vat.payable", "vat.exclusive", "vat.zero"].forEach((id) =>
      push(id, "401 內部", ID_TITLE[id], "na", "尚未填 401 期別", "在公司概況的「近 6 期 401」補上"));
  } else {
    const withTax = vats.filter((v) => has(v.outTax));
    if (!withTax.length) {
      push("vat.outTax", "401 內部", ID_TITLE["vat.outTax"], "na", "尚未填「銷項稅額(107)」（選填）", "填了才驗得動 5% 這條");
    } else {
      const wrong = withTax.filter((v) => !near(n(v.outTax), (n(v.sales) - n(v.zeroRate)) * 0.05));
      push("vat.outTax", "401 內部", ID_TITLE["vat.outTax"], wrong.length ? "fail" : "ok",
        wrong.length ? wrong.map((v) => `${v.period}：應稅 ${fmt(n(v.sales) - n(v.zeroRate))} × 5% ＝ ${fmt((n(v.sales) - n(v.zeroRate)) * 0.05)}，表上是 ${fmt(n(v.outTax))}`).join("；")
          : `${withTax.length} 期都對得上`,
        "二聯式發票金額是含稅的，換算時要除以 1.05——這是最常見的填報錯誤之一");
    }

    const withBoth = vats.filter((v) => has(v.outTax) && has(v.inTax));
    if (!withBoth.length) {
      push("vat.payable", "401 內部", ID_TITLE["vat.payable"], "na", "尚未填銷項(107)與進項(108)稅額（選填）", "兩欄都填了才驗得動這條");
    } else {
      // 刻意只驗上界，不驗等號：111 還會被**上期留抵**再抵掉一段，
      // 而表上只有「本期累積留抵(115)」、沒有「上期留抵」，硬要求相等會把正常的案子誤判成錯。
      // 抓得到的真錯誤：應納超過銷項減進項、或進項大於銷項卻還有應納。
      const wrong = withBoth.filter((v) => {
        const net = n(v.outTax) - n(v.inTax);
        return net >= 0 ? n(v.payable) > net + TOLERANCE_ABS : !near(n(v.payable), 0);
      });
      push("vat.payable", "401 內部", ID_TITLE["vat.payable"], wrong.length ? "fail" : "ok",
        wrong.length ? wrong.map((v) => `${v.period}：107 ${fmt(n(v.outTax))} − 108 ${fmt(n(v.inTax))} ＝ ${fmt(n(v.outTax) - n(v.inTax))}，111 卻填 ${fmt(n(v.payable))}`).join("；")
          : `${withBoth.length} 期都在合理範圍`,
        "應納稅額不可能超過「銷項減進項」；進項大於銷項時 111 應為 0，差額走 112 溢付與 115 留抵");
    }

    const both = vats.filter((v) => n(v.payable) > 0 && n(v.carry) > 0);
    push("vat.exclusive", "401 內部", ID_TITLE["vat.exclusive"], both.length ? "fail" : "ok",
      both.length ? both.map((v) => `${v.period}：應納 ${fmt(n(v.payable))} 與留抵 ${fmt(n(v.carry))} 同時大於 0`).join("；")
        : `${vats.length} 期都沒有同時出現`,
      "同一期要嘛應納、要嘛留抵，不會兩個都有——通常是把不同期的數字填在同一列");

    const zeroBad = vats.filter((v) => n(v.zeroRate) > n(v.sales) + TOLERANCE_ABS);
    push("vat.zero", "401 內部", ID_TITLE["vat.zero"], zeroBad.length ? "fail" : "ok",
      zeroBad.length ? zeroBad.map((v) => `${v.period}：零稅率 ${fmt(n(v.zeroRate))} > 銷售額 ${fmt(n(v.sales))}`).join("；")
        : `${vats.length} 期的零稅率都在銷售額之內`,
      "零稅率銷售額是總銷售額的一部分，不可能比它大");
  }

  // ── 跨文件 ──
  const rec = crossCheck(c);
  if (rec.status === "na") {
    push("x.vat-vs-is", "跨文件", "6 期 401 銷售額合計 vs 損益表營業收入", "na", rec.detail, "兩邊都填了才對得起來");
  } else {
    push("x.vat-vs-is", "跨文件", "6 期 401 銷售額合計 vs 損益表營業收入", rec.status,
      `401 合計 ${fmt(rec.vatTotal)}　帳載營收 ${fmt(rec.bookRev)}　差額 ${fmt(rec.diff)}（${(rec.rate * 100).toFixed(1)}%）` +
      (rec.explained ? `　已說明 ${fmt(rec.explained)}　未解釋 ${fmt(rec.unexplained)}` : ""),
      "這是國稅局最基本的查核動作。對不起來不是罪，說不出理由才是——用下方的差異調節表逐項說明");
  }

  const b1 = [["年營收", co.annualRevenue, "rev"], ["稅後淨利", co.netProfit, "net"], ["總資產", co.totalAsset, "asset"], ["總負債", co.totalDebt, "debt"]] as const;
  const latest = sorted[0];
  if (!latest) {
    push("x.batch1", "跨文件", "第一批五個數字 vs 三年財務摘要", "na", "尚未填三年財務摘要", "補上最新年度即可比對");
  } else {
    const mismatch = b1.filter((f) => has(f[1]) && has(latest[f[2]]) && !near(n(f[1]), n(latest[f[2]])));
    push("x.batch1", "跨文件", "第一批五個數字 vs 三年財務摘要", mismatch.length ? "fail" : "ok",
      mismatch.length ? mismatch.map((f) => `${f[0]}：第一批 ${fmt(n(f[1]))}　${n(latest.year)} 年度 ${fmt(n(latest[f[2]]))}`).join("；")
        : `與 ${n(latest.year)} 年度一致`,
      "兩邊指的是同一年就該一樣。常見成因是先填了第一批，後來補三年財報時改了數字卻沒回頭改");
  }

  return out;
}

const ID_TITLE: Record<string, string> = {
  "vat.outTax": "銷項稅額 ＝（銷售額 − 零稅率）× 5%",
  "vat.payable": "111 本期應納 ≤ 107 − 108（上期留抵會再抵掉一段）",
  "vat.exclusive": "應納與留抵不會同時大於 0",
  "vat.zero": "零稅率銷售額 ≤ 總銷售額",
};

/** 401 與帳載收入的差異調節。回傳夠前端直接畫出調節表的所有數字。 */
export function crossCheck(c: any): {
  status: AuditLevel; vatTotal: number; bookRev: number; diff: number; rate: number;
  explained: number; unexplained: number; year: number; detail: string;
} {
  const years: any[] = Array.isArray(c?.bizYears) ? c.bizYears : [];
  const vats: any[] = Array.isArray(c?.vat401) ? c.vat401 : [];
  const recs: ReconcileRow[] = Array.isArray(c?.reconcile) ? c.reconcile : [];
  const empty = { vatTotal: 0, bookRev: 0, diff: 0, rate: 0, explained: 0, unexplained: 0, year: 0 };

  if (!vats.length || !years.length) {
    return { ...empty, status: "na", detail: !vats.length ? "尚未填 401 期別" : "尚未填三年財務摘要" };
  }
  const latest = years.slice().sort((a, b) => n(b.year) - n(a.year))[0];
  const year = n(latest.year);
  const bookRev = n(latest.rev);
  if (!bookRev) return { ...empty, status: "na", year, detail: `${year} 年度尚未填營收` };

  const vatTotal = vats.reduce((s, v) => s + n(v.sales), 0);
  const diff = vatTotal - bookRev;
  const explained = recs.filter((r) => n(r.year) === year).reduce((s, r) => s + n(r.amount), 0);
  const unexplained = diff - explained;
  const rate = pctOf(unexplained, bookRev);
  // 未解釋差額在 2% 以內＝正常（開票時點差異本來就會有）；超過 10% 才算真的說不過去。
  const status: AuditLevel = rate <= TOLERANCE_RATE ? "ok" : rate <= 0.1 ? "warn" : "fail";
  return { status, vatTotal, bookRev, diff, rate, explained, unexplained, year, detail: "" };
}

/** 摘要：給分析頁與 E1 頁首用。 */
export function auditSummary(items: AuditItem[]): { ok: number; warn: number; fail: number; na: number; total: number } {
  return {
    ok: items.filter((x) => x.level === "ok").length,
    warn: items.filter((x) => x.level === "warn").length,
    fail: items.filter((x) => x.level === "fail").length,
    na: items.filter((x) => x.level === "na").length,
    total: items.length,
  };
}
