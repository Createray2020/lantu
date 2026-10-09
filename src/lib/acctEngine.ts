// 帳務後台（組織營業損益）的純計算（2026/09/29）。
//
// 原型：docs/帳務後台_原型.html（Ray 對過版面說「放進後台」）。這裡的公式與原型逐字同一套，
// acctEngine.test.ts 用原型的示範資料對拍。
//
// 三層口徑：營業額 → 減「拆分給別人」＝營業毛利 → 減固定支出、減營業稅 ＝ 淨利。
// 拆分一列可以是比例（占單價 %）或固定金額；營業稅單獨列一層（營所稅先不算）；數量與固定支出按月存。

/**
 * 拆分模式（2026/10/08 依 Ray 的「嵐途_財務對帳表.xlsx」加三種）：
 *   pct  ＝ 占收款金額的比例（系統 80%…）
 *   amt  ＝ 固定金額（系統 4,800／600…）
 *   pool ＝ 分潤池：這一筆有幾位分潤人，就查 params.poolTiers 的切法（1 人 30；2 人 25／5…）。v 不用。
 *   keep ＝ 公司自留比例（培訓 20%）：不是匯款，但要先從餘額扣掉再算 rest
 *   rest ＝ 餘額再分：收款 − 上面全部 之後的比例（講師一 80%／講師二 20%）
 * 公司實收 ＝ 收款 − 所有要匯出去的錢（pct／amt／pool／rest），keep 自然留在公司。
 */
export type SplitMode = "pct" | "amt" | "pool" | "keep" | "rest";
export type AcctSplit = { to: string; mode: SplitMode; v: number };
/**
 * 推薦端的人（職級由低到高）：[0]＝推薦人，之後是推薦人**原有輔導鏈**逐層往上（V7.2 §14）。
 * rankCode＝報名付款當時的職級快照——之後升階不改歷史收益（§38之5）。
 */
export type Sharer = { name: string; coachId?: string | null; rankCode?: string | null };
/**
 * 逐筆收款（acct_receipts）：對帳表的一列。
 * payees：某個拆分列（以 split.to 為鍵）這一筆實際匯給誰（講師一→王老師）；沒填就用拆分列的名字。
 */
export type Receipt = {
  id: string; ym: string; itemId: string; on: string; amount: number; last5: string;
  payer: string; payerCoachId?: string | null; sharers: Sharer[]; payees: Record<string, string>; note: string; void: boolean;
  /** 退款（含部分退款）：以最終實收＝amount − refund 重算（V7.2 §41）。 */
  refund: number;
  /** case＝從「案件與分潤」帶進來的顧問費（唯讀）；coach＝教練建客戶時勾付費寫的顧問費；manual＝後台手記 */
  source: "manual" | "case" | "coach";
  caseId?: string | null;
  /** 顧問費：客戶、執案教練、開發教練 */
  clientId?: string | null; execCoachId?: string | null; promoCoachId?: string | null;
  /** 後台查帳確認。false＝待查帳：收款明細看得到，但不進營業額、分潤匯款與實績 */
  verified: boolean;
  enteredBy?: string | null;
  /** 已算好的拆分（case／coach 用）：直接當拆分結果，不再套項目的 splits */
  allocs?: ReceiptRow[];
};
/** 名冊精簡列：職級與直屬主管用來展開推薦端輔導鏈。 */
export type CoachLite = { id: string; name: string; rankCode?: string | null; uplineId?: string | null };
/**
 * 推薦人的推薦端名單（V7.2 §14）：本人在前，沿**原有輔導鏈**往上到頂；每一層帶當下職級快照。
 * 不套代管（§13 代管是顧問費差階的規則，推薦端沿原有鏈）。鏈成環或超過 12 層就停。
 */
export function referralChain(coachId: string, coachList: CoachLite[]): Sharer[] {
  const byId = new Map(coachList.map((c) => [c.id, c]));
  const out: Sharer[] = [];
  const seen = new Set<string>();
  let cur = byId.get(coachId);
  while (cur && !seen.has(cur.id) && out.length < 12) {
    seen.add(cur.id);
    out.push({ name: cur.name, coachId: cur.id, rankCode: cur.rankCode ?? null });
    cur = cur.uplineId ? byId.get(cur.uplineId) : undefined;
  }
  return out;
}
/** 正式職級（不是實習／結業）：已報聘的人報名課程不計推薦（§14-3）。 */
export const isFormalRank = (code: string | null | undefined) => !!code && code !== "INTERN" && code !== "PARTNER";
/** 受款人簿（payees）的一列：教練一人一列（coachId），外部受款人（創造共好、講師、場地）coachId 為空。 */
export type TaxMode = "" | "invoice" | "withhold";
export type PayeeRec = {
  id: string; coachId: string | null; name: string; bankCode: string; bankName: string; branch: string; accountName: string; accountNo: string;
  taxMode: TaxMode; note: string;
};
export const TAX_MODE_LABEL: Record<TaxMode, string> = { "": "未設定", invoice: "開發票", withhold: "扣執行業務所得" };
/** 扣繳參數：執行業務所得扣繳率、二代健保補充保費率、起扣點（同一人同月合計未達免扣）。 */
export type TaxParams = { withholdRate: number; nhiRate: number; threshold: number };
export const ACCT_DEFAULT_TAX: TaxParams = { withholdRate: 10, nhiRate: 2.11, threshold: 20000 };
/** 某月某受款人的「已匯」紀錄（acct_payouts）。 */
export type PayoutMark = { paidOn: string; amount: number; note: string };
export type ReceiptRow = { to: string; v: number; mode: SplitMode; label: string; coachId?: string | null };
export type ReceiptResult = { amount: number; rows: ReceiptRow[]; payout: number; keep: number; company: number; warn: string | null };
/** source：這個項目由哪個系統事件自動入帳（apply＝報聘核准／license＝培訓帳號開通）；空＝只手填。 */
export type AcctSource = "apply" | "license" | "case";
export type AcctItem = { id: string; name: string; price: number; splits: AcctSplit[]; source?: AcctSource | ""; cat?: string };
/** 系統入帳的一筆（acct_entries）：金額是事件當下的單價快照。 */
export type SysRow = { id: string; itemId: string; coachId: string; coachName: string; source: AcctSource; amount: number; void: boolean; createdAt: string };
export type AcctMonth = { qty: Record<string, number>; fixed: { name: string; amt: number }[] };
/**
 * referralRates：各身分／職級的課程與專案推薦率（V7.2 §14：INTERN／PARTNER 10、C 20、S 25、CHIEF 30）；
 * referralCap：整條推薦端上限（30）。poolTiers 是 2026/10/08 的舊切法表，V7.2 之後只當 rankCode 缺漏時的備援。
 * annualFee：年度合作費依職級（§31）；earlyApplyFee：提前報聘首期 6,000。
 */
export type AcctParams = {
  vatRate: number; poolTiers: number[][]; tax: TaxParams;
  referralRates: Record<string, number>; referralCap: number;
  annualFee: Record<string, number>; earlyApplyFee: number;
};
export type AcctGoal = { netTarget: number };
/** 月目標：跟 AcctMonth 同一個形狀（目標筆數、目標固定支出），多一個目標淨利。另一張表存，不跟實際帳混。 */
export type AcctTarget = AcctMonth & { net: number };
export type AcctState = {
  items: AcctItem[];
  months: Record<string, AcctMonth>;   // 'YYYY-MM' 實際
  targets: Record<string, AcctTarget>; // 'YYYY-MM' 目標
  draft: AcctTarget | null;            // 目標工作台的草稿（Ray：目標不綁期間，設好了再存入哪個月）
  sys?: Record<string, SysRow[]>;      // 'YYYY-MM' → 系統入帳事件（含作廢的，作廢不計）
  receipts?: Record<string, Receipt[]>; // 'YYYY-MM' → 逐筆收款（對帳表），作廢不計
  payouts?: Record<string, Record<string, PayoutMark>>; // 'YYYY-MM' → 受款人 → 已匯
  coachList?: CoachLite[];             // 名冊（給匯款人／分潤人對名字、帶職級與輔導鏈用）
  payeeBook?: PayeeRec[];              // 受款人簿
  params: AcctParams;
  goal: AcctGoal;
};
/** what-if 拉桿：單價 %、拆分比例 ±點、數量 %、固定支出 %（都是相對現況） */
export type AcctAdj = { price?: number; split?: number; qty?: number; fix?: number };

export type UnitResult = { price: number; split: number; rows: { to: string; v: number }[]; gp: number; gm: number };
export type ItemResult = { it: AcctItem; q: number; u: UnitResult; rev: number; gp: number; sysN: number; manualQ: number; rcN: number };
export type MonthResult = {
  rev: number; split: number; gp: number; gm: number;
  fixed: number; vat: number; net: number; nm: number;
  byItem: ItemResult[]; byTo: Record<string, number>;
};

export const ACCT_DEFAULT_TIERS: number[][] = [[30], [25, 5]];
export const ACCT_DEFAULT_REFERRAL: Record<string, number> = { INTERN: 10, PARTNER: 10, C1: 20, C2: 20, C3: 20, S1: 25, S2: 25, S3: 25, CHIEF: 30 };
export const ACCT_DEFAULT_ANNUAL_FEE: Record<string, number> = { C1: 6000, C2: 6000, C3: 6000, S1: 12000, S2: 12000, S3: 18000, CHIEF: 24000 };
export const ACCT_DEFAULT_PARAMS: AcctParams = {
  vatRate: 5, poolTiers: ACCT_DEFAULT_TIERS, tax: ACCT_DEFAULT_TAX,
  referralRates: ACCT_DEFAULT_REFERRAL, referralCap: 30, annualFee: ACCT_DEFAULT_ANNUAL_FEE, earlyApplyFee: 6000,
};
/** 年度合作費：依職級；沒設定的職級（實習、結業）回 0。提前報聘用 earlyApplyFee。 */
export function annualFeeOf(params: AcctParams, rankCode: string | null | undefined, early = false): number {
  if (early) return params.earlyApplyFee;
  return params.annualFee[rankCode ?? ""] ?? 0;
}
export const SPLIT_MODE_LABEL: Record<SplitMode, string> = { pct: "比例 %", amt: "固定金額", pool: "分潤池（依切法表）", keep: "公司自留 %", rest: "餘額再分 %" };
export const ACCT_DEFAULT_GOAL: AcctGoal = { netTarget: 0 };

export const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export function prevYm(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return ymOf(new Date(y, m - 2, 1));
}
export function nextYm(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return ymOf(new Date(y, m, 1));
}
export const isYm = (s: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s ?? ""));

/**
 * 一筆收款怎麼拆（對帳表一列的公式）。what-if 的 adj.split 只動 pct 列。
 * 順序：pct／amt／pool／keep 先算 → 餘額 ＝ 收款 − 這些 → rest 列吃餘額的比例。
 */
export function calcReceipt(it: AcctItem, amount: number, sharers: Sharer[], payees: Record<string, string>, params: AcctParams, adj: AcctAdj = {}, allocs?: ReceiptRow[]): ReceiptResult {
  // 案件帶進來的：拆分已由 comp 引擎算好（含差階、平階、代管），這裡照單全收
  if (allocs) {
    let payout = 0, keep = 0;
    for (const r of allocs) { if (r.mode === "keep") keep += r.v; else payout += r.v; }
    return { amount, rows: allocs, payout, keep, company: amount - payout, warn: null };
  }
  const tiers = params.poolTiers?.length ? params.poolTiers : ACCT_DEFAULT_TIERS;
  const rows: ReceiptRow[] = [];
  let warn: string | null = null;
  let first = 0;
  const nameOf = (s: AcctSplit) => (payees[s.to] || s.to).trim();
  for (const s of it.splits) {
    if (s.mode === "rest") continue;
    if (s.mode === "pool") {
      const n = sharers.length;
      if (!n) continue;
      const cap = params.referralCap ?? 30;
      const rates = params.referralRates ?? ACCT_DEFAULT_REFERRAL;
      const hasRanks = sharers.every((sh) => sh.rankCode && rates[sh.rankCode] !== undefined);
      if (hasRanks) {
        // V7.2 §14：推薦人先取自己的推薦率，上層逐層取正差額，整條不超過 cap；平階／倒掛為 0。
        let acc = 0;
        sharers.forEach((sh, i) => {
          const r = Math.min(cap, rates[sh.rankCode!]);
          const share = Math.max(0, r - acc);
          acc = Math.max(acc, r);
          const v = amount * share / 100;
          first += v;
          rows.push({ to: sh.name.trim() || `推薦${i + 1}`, v, mode: "pool", label: i === 0 ? `推薦人 ${sh.rankCode} ${r}%` : `差階 ${sh.rankCode} ${r}−${r - share}＝${share}%`, coachId: sh.coachId ?? null });
        });
      } else {
        // 備援：沒有職級快照（舊資料／手填名字）→ 用切法表
        const tier = tiers[n - 1] ?? tiers[tiers.length - 1];
        warn = "分潤人沒有職級快照，先用切法表；請改用「推薦人」挑人讓系統帶職級";
        sharers.forEach((sh, i) => { const v = amount * (tier[i] ?? 0) / 100; first += v; rows.push({ to: sh.name.trim() || `分潤${i + 1}`, v, mode: "pool", label: `分潤${["一", "二", "三", "四", "五"][i] ?? i + 1} ${tier[i] ?? 0}%`, coachId: sh.coachId ?? null }); });
      }
      continue;
    }
    const v = s.mode === "amt" ? s.v : amount * Math.max(0, s.v + (s.mode === "pct" ? (adj.split ?? 0) : 0)) / 100;
    first += v;
    rows.push({ to: nameOf(s), v, mode: s.mode, label: s.mode === "keep" ? `公司自留 ${s.v}%` : s.mode === "amt" ? "固定" : `${s.v}%` });
  }
  const remain = Math.max(0, amount - first);
  for (const s of it.splits) if (s.mode === "rest") rows.push({ to: nameOf(s), v: remain * s.v / 100, mode: "rest", label: `餘額 ${s.v}%` });
  // V7.2 §40：分潤金額以元為單位四捨五入（what-if 試算時不取整，曲線才平滑）
  if (!adj.split && !adj.price) for (const r of rows) r.v = Math.round(r.v);
  let payout = 0, keep = 0;
  for (const r of rows) { if (r.mode === "keep") keep += r.v; else payout += r.v; }
  return { amount, rows, payout, keep, company: amount - payout, warn };
}
/** 一筆收款的「最終實收」：金額 − 退款。 */
export const netOf = (x: Pick<Receipt, "amount" | "refund">) => Math.max(0, x.amount - (x.refund || 0));

function unitFromAllocs(price: number, allocs: ReceiptRow[]): UnitResult {
  const rows = allocs.filter((r) => r.mode !== "keep").map((r) => ({ to: r.to, v: r.v }));
  const split = rows.reduce((a, r) => a + r.v, 0);
  return { price, split, rows, gp: price - split, gm: price ? (price - split) / price : 0 };
}
/** 單筆：售價、拆出多少、單筆毛利、毛利率。沒有收款資料時（手填筆數、目標）當作沒有分潤人。 */
export function unitOf(it: AcctItem, adj: AcctAdj = {}, basePrice?: number, params: AcctParams = ACCT_DEFAULT_PARAMS, sharers: Sharer[] = [], payees: Record<string, string> = {}): UnitResult {
  const price = (basePrice ?? it.price) * (1 + (adj.price ?? 0) / 100);
  const rr = calcReceipt(it, price, sharers, payees, params, adj);
  const rows = rr.rows.filter((r) => r.mode !== "keep").map((r) => ({ to: r.to, v: r.v }));
  return { price, split: rr.payout, rows, gp: rr.company, gm: price ? rr.company / price : 0 };
}

/** 一份月資料（實際或目標都行）的損益結構。 */
export function calcData(items: AcctItem[], m: AcctMonth, params: AcctParams, adj: AcctAdj = {}, sys: SysRow[] = [], receipts: Receipt[] = []): MonthResult {
  let rev = 0, split = 0, gp = 0;
  const byItem: ItemResult[] = [];
  const byTo: Record<string, number> = {};
  const scale = 1 + (adj.qty ?? 0) / 100;
  for (const it of items) {
    const manualQ = (m.qty[it.id] ?? 0) * scale;
    const u = unitOf(it, adj, undefined, params);
    let irev = u.price * manualQ, isplit = u.split * manualQ, igp = u.gp * manualQ;
    for (const r of u.rows) byTo[r.to] = (byTo[r.to] ?? 0) + r.v * manualQ;
    // 系統入帳：每一筆用它自己的快照金額算（不同期間價格不同），拆分規則套現在的
    const rows = sys.filter((x) => x.itemId === it.id && !x.void);
    for (const x of rows) {
      const ux = unitOf(it, adj, x.amount, params);
      irev += ux.price * scale; isplit += ux.split * scale; igp += ux.gp * scale;
      for (const r of ux.rows) byTo[r.to] = (byTo[r.to] ?? 0) + r.v * scale;
    }
    // 逐筆收款（對帳表）：每一筆用自己的金額、分潤人、受款人算
    const rcs = receipts.filter((x) => x.itemId === it.id && !x.void && x.verified !== false);
    for (const x of rcs) {
      const ux = x.allocs ? unitFromAllocs(netOf(x), x.allocs) : unitOf(it, adj, netOf(x), params, x.sharers, x.payees);
      irev += ux.price * scale; isplit += ux.split * scale; igp += ux.gp * scale;
      for (const r of ux.rows) byTo[r.to] = (byTo[r.to] ?? 0) + r.v * scale;
    }
    const q = manualQ + (rows.length + rcs.length) * scale;
    rev += irev; split += isplit; gp += igp;
    byItem.push({ it, q, u, rev: irev, gp: igp, sysN: rows.length, manualQ, rcN: rcs.length });
  }
  const fixed = m.fixed.reduce((a, f) => a + (Number(f.amt) || 0), 0) * (1 + (adj.fix ?? 0) / 100);
  const vat = rev * params.vatRate / 100;
  const net = gp - fixed - vat;
  return { rev, split, gp, gm: rev ? gp / rev : 0, fixed, vat, net, nm: rev ? net / rev : 0, byItem, byTo };
}
/** 某一個月的實際損益結構。沒有那個月回 null。 */
export function calcMonth(S: AcctState, ym: string, adj: AcctAdj = {}): MonthResult | null {
  const m = S.months[ym];
  return m ? calcData(S.items, m, S.params, adj, S.sys?.[ym] ?? [], S.receipts?.[ym] ?? []) : null;
}
/** 某一個月的目標損益結構（目標筆數 × 現在的單價與拆分）。沒設目標回 null。 */
export function calcTarget(S: AcctState, ym: string): MonthResult | null {
  const t = S.targets?.[ym];
  return t ? calcData(S.items, t, S.params) : null;
}

export type CompareRow = { key: string; name: string; target: number; actual: number; diff: number; netEffect: number };
export type Compare = {
  net: { target: number; actual: number; diff: number };        // target＝目標淨利（存的那個數字）
  rev: { target: number; actual: number; diff: number };
  gp: { target: number; actual: number; diff: number };
  fixed: { target: number; actual: number; diff: number };
  items: CompareRow[];   // 逐項筆數：diff＝實際−目標；netEffect＝這個差對淨利的影響（Δ筆數 × 每筆淨貢獻）
  fixedRows: CompareRow[];  // 逐列固定支出（同名合併）：netEffect＝−Δ金額
  drivers: string[];     // 差最大的前幾個原因，給一句話結論用
};
/** 目標 vs 實際的差異拆解。 */
export function compareMonth(S: AcctState, ym: string): Compare | null {
  const t = S.targets?.[ym], a = S.months[ym];
  if (!t || !a) return null;
  const sys = S.sys?.[ym] ?? [], rcs = S.receipts?.[ym] ?? [];
  const rt = calcData(S.items, t, S.params), ra = calcData(S.items, a, S.params, {}, sys, rcs);
  const items: CompareRow[] = S.items.map((it) => {
    const u = unitOf(it, {}, undefined, S.params);
    const net1 = u.gp - u.price * S.params.vatRate / 100;
    const target = t.qty[it.id] ?? 0, actual = (a.qty[it.id] ?? 0) + sys.filter((x) => x.itemId === it.id && !x.void).length + rcs.filter((x) => x.itemId === it.id && !x.void).length;
    return { key: it.id, name: it.name, target, actual, diff: actual - target, netEffect: (actual - target) * net1 };
  });
  const sumBy = (rows: { name: string; amt: number }[]) => { const o: Record<string, number> = {}; for (const f of rows) o[f.name] = (o[f.name] ?? 0) + f.amt; return o; };
  const ft = sumBy(t.fixed), fa = sumBy(a.fixed);
  const names = Array.from(new Set([...Object.keys(ft), ...Object.keys(fa)]));
  const fixedRows: CompareRow[] = names.map((n) => ({ key: n, name: n, target: ft[n] ?? 0, actual: fa[n] ?? 0, diff: (fa[n] ?? 0) - (ft[n] ?? 0), netEffect: -((fa[n] ?? 0) - (ft[n] ?? 0)) }));
  const cands = [
    ...items.filter((x) => x.diff !== 0).map((x) => ({ e: x.netEffect, s: `${x.name}${x.diff > 0 ? "多賣" : "少賣"} ${Math.abs(x.diff)} 筆` })),
    ...fixedRows.filter((x) => x.diff !== 0).map((x) => ({ e: x.netEffect, s: `${x.name}${x.diff > 0 ? "多花" : "少花"} ${Math.round(Math.abs(x.diff)).toLocaleString("zh-TW")}` })),
  ].sort((x, y) => Math.abs(y.e) - Math.abs(x.e)).slice(0, 3);
  const pair = (target: number, actual: number) => ({ target, actual, diff: actual - target });
  return {
    net: pair(t.net, ra.net), rev: pair(rt.rev, ra.rev), gp: pair(rt.gp, ra.gp), fixed: pair(rt.fixed, ra.fixed),
    items, fixedRows, drivers: cands.map((c) => `${c.s}（${c.e >= 0 ? "+" : "−"}${Math.round(Math.abs(c.e)).toLocaleString("zh-TW")}）`),
  };
}

// ---------- 匯款對帳（誰、多少） ----------
export type PayoutSrc = { receiptId: string; itemName: string; on: string; payer: string; v: number; label: string };
export type PayoutTax = { mode: TaxMode; withhold: number; nhi: number; net: number; applied: boolean };
export type PayoutLine = {
  key: string;            // 已匯紀錄的鍵：對得上受款人簿就是 p:<id>，否則 n:<名字>
  payee: string;          // 顯示名
  rec: PayeeRec | null;   // 受款人簿那一列（帳號、稅務方式）
  due: number; srcs: PayoutSrc[]; mark: PayoutMark | null; remaining: number;
  tax: PayoutTax;         // 扣繳：net＝實匯
};
export type PayoutSummary = { lines: PayoutLine[]; due: number; net: number; paid: number; remaining: number; company: number; received: number; warns: string[]; payDate: string; pending: { n: number; amount: number } };
/** 結算發放日（V7.2 §40）：前一曆月入帳的分潤於次月 5 日發放；遇六日提前到週五。 */
export function settlementDate(ym: string, day = 5): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, day));   // 次月 day 日
  const wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (wd === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}
export const payeeKey = (rec: PayeeRec | null, name: string) => rec ? `p:${rec.id}` : `n:${name}`;
/** 名字（或教練 id）對到受款人簿：先用 coachId，再用名字（受款人簿的名字或教練顯示名）。 */
export function resolvePayee(book: PayeeRec[], name: string, coachId?: string | null, coachList: { id: string; name: string }[] = []): PayeeRec | null {
  const n = name.trim();
  if (coachId) { const r = book.find((p) => p.coachId === coachId); if (r) return r; }
  const byName = book.find((p) => p.name.trim() === n);
  if (byName) return byName;
  const c = coachList.find((k) => k.name === n);
  if (c) { const r = book.find((p) => p.coachId === c.id); if (r) return r; }
  return null;
}
/** 扣繳：扣執行業務所得者，同月合計達起扣點才扣；其他一律實匯＝應付。 */
export function taxOf(mode: TaxMode, due: number, t: TaxParams): PayoutTax {
  if (mode !== "withhold" || due < t.threshold || due <= 0) return { mode, withhold: 0, nhi: 0, net: due, applied: false };
  const withhold = Math.round(due * t.withholdRate / 100), nhi = Math.round(due * t.nhiRate / 100);
  return { mode, withhold, nhi, net: due - withhold - nhi, applied: true };
}
/** 某一個月：每個受款人應付多少、從哪幾筆來、扣繳後實匯、匯了沒。公司自留（keep）與公司實收不在裡面。 */
export function payoutsOf(S: AcctState, ym: string): PayoutSummary {
  const by: Record<string, PayoutLine> = {};
  const warns: string[] = [];
  const book = S.payeeBook ?? [], tax = S.params.tax ?? ACCT_DEFAULT_TAX;
  let company = 0, received = 0;
  const blank: PayoutTax = { mode: "", withhold: 0, nhi: 0, net: 0, applied: false };
  const pending = { n: 0, amount: 0 };
  for (const x of S.receipts?.[ym] ?? []) {
    if (x.void) continue;
    if (x.verified === false) { pending.n++; pending.amount += netOf(x); continue; }
    const it = S.items.find((i) => i.id === x.itemId);
    if (!it) continue;
    const rr = calcReceipt(it, netOf(x), x.sharers, x.payees, S.params, {}, x.allocs);
    received += netOf(x); company += rr.company;
    if (rr.warn) warns.push(`${x.on} ${x.payer}：${rr.warn}`);
    if (x.sharers.length && x.payerCoachId) {
      const pc = (S.coachList ?? []).find((c) => c.id === x.payerCoachId);
      if (pc && isFormalRank(pc.rankCode)) warns.push(`${x.on} ${x.payer} 已是正式教練（${pc.rankCode}），依制度不計課程推薦——請把推薦人清空`);
      if (x.sharers[0]?.coachId === x.payerCoachId) warns.push(`${x.on} ${x.payer} 推薦人是本人，依制度不計推薦`);
    }
    for (const r of rr.rows) {
      if (r.mode === "keep" || !r.v) continue;
      const rec = resolvePayee(book, r.to, r.coachId, S.coachList ?? []);
      const key = payeeKey(rec, r.to);
      const l = (by[key] ??= { key, payee: rec?.name || r.to, rec, due: 0, srcs: [], mark: null, remaining: 0, tax: blank });
      l.due += r.v;
      l.srcs.push({ receiptId: x.id, itemName: it.name, on: x.on, payer: x.payer, v: r.v, label: r.label });
    }
  }
  const marks = S.payouts?.[ym] ?? {};
  let due = 0, net = 0, paid = 0;
  const lines = Object.values(by).sort((a, b) => b.due - a.due).map((l) => {
    const mark = marks[l.key] ?? null;
    const t = taxOf(l.rec?.taxMode ?? "", l.due, tax);
    const p = mark ? mark.amount : 0;
    due += l.due; net += t.net; paid += p;
    return { ...l, mark, tax: t, remaining: t.net - p };
  });
  return { lines, due, net, paid, remaining: net - paid, company, received, warns, payDate: settlementDate(ym), pending };
}
/** 某受款人（key）在某月的對帳單；沒有這個人回 null。 */
export function statementOf(S: AcctState, ym: string, key: string): PayoutLine | null {
  return payoutsOf(S, ym).lines.find((l) => l.key === key) ?? null;
}
/** 某受款人所有有紀錄的月份（給「我的分潤」列月）。 */
export function statementMonths(S: AcctState, key: string): string[] {
  return Object.keys(S.receipts ?? {}).sort().reverse().filter((ym) => payoutsOf(S, ym).lines.some((l) => l.key === key));
}

/** 損益兩平營業額：固定支出 ÷（毛利率 − 營業稅率）。毛利率不夠蓋稅時回 Infinity。 */
export function breakeven(r: MonthResult, vatRate: number): number {
  const d = r.gm - vatRate / 100;
  return d > 0 ? r.fixed / d : Infinity;
}

export type GoalSolve = {
  need: number;   // 目標淨利 ＋ 固定支出 ＝「毛利 − 營業稅」要到多少
  have: number;   // 目前的 毛利 − 營業稅
  gap: number;    // 還差多少（≤0 已達標）
  k: number;      // 等比放大倍率（現況組合全部乘 k 就到目標；已達標時 needQ 維持現況，不會叫人少賣）
  perItem: { id: string; name: string; q: number; needQ: number; aloneQ: number | null }[];  // aloneQ＝單靠這一項要再多賣幾筆
};
/** 目標淨利 → 以現在的毛利結構反推要賣幾筆。 */
export function goalSolve(S: AcctState, r: MonthResult): GoalSolve {
  const need = S.goal.netTarget + r.fixed;
  const have = r.gp - r.vat;
  const gap = need - have;
  const k = have > 0 ? need / have : Infinity;
  const perItem = r.byItem.map((b) => {
    const net1 = b.u.gp - b.u.price * S.params.vatRate / 100;   // 每多賣一筆對「毛利−稅」的貢獻
    return { id: b.it.id, name: b.it.name, q: b.q, needQ: gap > 0 && Number.isFinite(k) ? Math.ceil(b.q * k) : b.q, aloneQ: gap > 0 ? (net1 > 0 ? Math.ceil(gap / net1) : null) : 0 };
  });
  return { need, have, gap, k, perItem };
}

/** 目標工作台：以某一份基準（通常是最近一個月的實際）等比放大到目標淨利，回建議筆數。基準毛利扣稅 ≤0 時回基準筆數。 */
export function suggestQty(items: AcctItem[], base: AcctMonth, netTarget: number, params: AcctParams): Record<string, number> {
  const r = calcData(items, base, params);
  const have = r.gp - r.vat, need = netTarget + r.fixed;
  const k = have > 0 && need > have ? need / have : 1;
  const out: Record<string, number> = {};
  for (const it of items) out[it.id] = Math.ceil((base.qty[it.id] ?? 0) * k);
  return out;
}

/** 四根槓桿各動 1 單位，淨利差多少（給「可調整的地方」那一行）。 */
export function leverSensitivity(S: AcctState, ym: string): { split1: number; price1: number; qty1: number; fix1: number } {
  const r = calcMonth(S, ym);
  if (!r) return { split1: 0, price1: 0, qty1: 0, fix1: 0 };
  const d = (adj: AcctAdj) => (calcMonth(S, ym, adj)?.net ?? r.net) - r.net;
  return { split1: d({ split: -1 }), price1: d({ price: 1 }), qty1: d({ qty: 1 }), fix1: -d({ fix: 1 }) };
}

// ---------- 正規化（DB 讀進來的東西不能信） ----------
const num0 = (v: unknown) => { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
export function normItems(v: unknown): AcctItem[] {
  if (!Array.isArray(v)) return [];
  const out: AcctItem[] = [];
  for (const x of v as Partial<AcctItem>[]) {
    if (!x || typeof x !== "object" || !x.id) continue;
    const splits = Array.isArray(x.splits) ? (x.splits as Partial<AcctSplit>[]).filter((s) => s && typeof s === "object").map((s) => ({
      to: String(s.to ?? "").trim(), mode: (["pct", "amt", "pool", "keep", "rest"].includes(String(s.mode)) ? s.mode : "pct") as SplitMode, v: Math.max(0, num0(s.v)),
    })) : [];
    const source = x.source === "apply" || x.source === "license" || x.source === "case" ? x.source : "";
    const cat = String(x.cat ?? "").trim();
    out.push({ id: String(x.id), name: String(x.name ?? "").trim(), price: Math.max(0, num0(x.price)), splits, ...(source ? { source } : {}), ...(cat ? { cat } : {}) });
  }
  return out;
}
export function normMonth(v: unknown): AcctMonth {
  const m = (v && typeof v === "object" ? v : {}) as Partial<AcctMonth>;
  const qty: Record<string, number> = {};
  if (m.qty && typeof m.qty === "object") for (const [k, q] of Object.entries(m.qty)) qty[k] = Math.max(0, num0(q));
  const fixed = Array.isArray(m.fixed) ? (m.fixed as { name?: unknown; amt?: unknown }[]).filter((f) => f && typeof f === "object").map((f) => ({ name: String(f.name ?? "").trim(), amt: Math.max(0, num0(f.amt)) })) : [];
  return { qty, fixed };
}
export function normTarget(v: unknown): AcctTarget {
  const m = normMonth(v);
  const t = (v && typeof v === "object" ? v : {}) as { net?: unknown };
  return { ...m, net: Math.max(0, num0(t.net)) };
}
export function normParams(v: unknown): AcctParams {
  const p = (v && typeof v === "object" ? v : {}) as Partial<AcctParams>;
  const vat = num0(p.vatRate);
  const tiers = Array.isArray(p.poolTiers) ? p.poolTiers.map((t) => Array.isArray(t) ? t.map((v) => Math.max(0, num0(v))) : []) : [];
  while (tiers.length && !tiers[tiers.length - 1].length) tiers.pop();
  const tx = (p.tax && typeof p.tax === "object" ? p.tax : {}) as Partial<TaxParams>;
  const pct = (v: unknown, d: number) => { if (v === undefined || v === null || v === "") return d; const x = Number(String(v).replace(/,/g, "")); return Number.isFinite(x) && x >= 0 && x <= 100 ? x : d; };
  const tax: TaxParams = { withholdRate: pct(tx.withholdRate, ACCT_DEFAULT_TAX.withholdRate), nhiRate: pct(tx.nhiRate, ACCT_DEFAULT_TAX.nhiRate), threshold: tx.threshold === undefined ? ACCT_DEFAULT_TAX.threshold : Math.max(0, num0(tx.threshold)) };
  const map = (v: unknown, d: Record<string, number>, max: number) => {
    const out: Record<string, number> = { ...d };
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) { const n = num0(x); if (n >= 0 && n <= max) out[k] = n; }
    return out;
  };
  const cap = num0(p.referralCap);
  const early = p.earlyApplyFee === undefined ? ACCT_DEFAULT_PARAMS.earlyApplyFee : Math.max(0, num0(p.earlyApplyFee));
  return {
    vatRate: vat >= 0 && vat <= 100 ? vat : ACCT_DEFAULT_PARAMS.vatRate, poolTiers: tiers.length ? tiers : ACCT_DEFAULT_TIERS.map((t) => [...t]), tax,
    referralRates: map(p.referralRates, ACCT_DEFAULT_REFERRAL, 100), referralCap: cap > 0 && cap <= 100 ? cap : 30,
    annualFee: map(p.annualFee, ACCT_DEFAULT_ANNUAL_FEE, 1e9), earlyApplyFee: early,
  };
}
export function normGoal(v: unknown): AcctGoal {
  const g = (v && typeof v === "object" ? v : {}) as Partial<AcctGoal>;
  return { netTarget: Math.max(0, num0(g.netTarget)) };
}
export const isIsoDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
export function normSharers(v: unknown): Sharer[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).map((x) => typeof x === "string" ? { name: x } : (x && typeof x === "object" ? x : {}) as Partial<Sharer>)
    .map((x) => ({ name: String(x.name ?? "").trim(), ...(x.coachId ? { coachId: String(x.coachId) } : {}), ...(x.rankCode ? { rankCode: String(x.rankCode) } : {}) })).filter((x) => x.name);
}
export function normPayees(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, val] of Object.entries(v as Record<string, unknown>)) { const n = String(val ?? "").trim(); if (n) out[k] = n; }
  return out;
}
/** 一筆收款的正規化（id／ym 由呼叫端給）。 */
export function normReceipt(v: unknown, id: string): Receipt {
  const r = (v && typeof v === "object" ? v : {}) as Partial<Receipt>;
  const on = isIsoDate(r.on) ? String(r.on) : "";
  return {
    id, ym: on ? on.slice(0, 7) : (isYm(r.ym) ? String(r.ym) : ""), itemId: String(r.itemId ?? ""), on, amount: Math.max(0, num0(r.amount)),
    last5: String(r.last5 ?? "").trim().slice(0, 20), payer: String(r.payer ?? "").trim(), payerCoachId: r.payerCoachId ? String(r.payerCoachId) : null,
    sharers: normSharers(r.sharers), payees: normPayees(r.payees), note: String(r.note ?? "").trim(), void: !!r.void,
    refund: Math.max(0, num0(r.refund)), source: r.source === "case" ? "case" : r.source === "coach" ? "coach" : "manual", caseId: r.caseId ? String(r.caseId) : null,
    clientId: r.clientId ? String(r.clientId) : null, execCoachId: r.execCoachId ? String(r.execCoachId) : null, promoCoachId: r.promoCoachId ? String(r.promoCoachId) : null,
    verified: r.verified !== false, enteredBy: r.enteredBy ? String(r.enteredBy) : null,
    ...(Array.isArray(r.allocs) ? { allocs: r.allocs as ReceiptRow[] } : {}),
  };
}
/**
 * 顧問費實績（V7.2 §27：同一客戶同一年度合計一案；§九：只算已確認的）。
 * 回每位執案教練的 { cases, fees }，fees＝最終實收合計。給晉升進度與首頁用。
 */
export function consultStats(S: AcctState, opts: { coachId?: string; year?: number } = {}): Record<string, { cases: number; fees: number; keys: string[] }> {
  const out: Record<string, { cases: number; fees: number; keys: string[] }> = {};
  const caseItem = S.items.find((it) => it.source === "case");
  if (!caseItem) return out;
  for (const list of Object.values(S.receipts ?? {})) for (const x of list) {
    if (x.void || x.verified === false || x.itemId !== caseItem.id || !x.execCoachId) continue;
    if (opts.coachId && x.execCoachId !== opts.coachId) continue;
    const y = Number(x.on.slice(0, 4));
    if (opts.year && y !== opts.year) continue;
    const o = (out[x.execCoachId] ??= { cases: 0, fees: 0, keys: [] });
    const key = `${x.clientId ?? x.payer}:${y}`;
    if (!o.keys.includes(key)) { o.keys.push(key); o.cases++; }
    o.fees += netOf(x);
  }
  return out;
}
export function normPayoutMark(v: unknown): PayoutMark {
  const m = (v && typeof v === "object" ? v : {}) as Partial<PayoutMark>;
  return { paidOn: isIsoDate(m.paidOn) ? String(m.paidOn) : "", amount: Math.max(0, num0(m.amount)), note: String(m.note ?? "").trim() };
}
export function normPayee(v: unknown, id: string): PayeeRec {
  const p = (v && typeof v === "object" ? v : {}) as Partial<PayeeRec>;
  const str = (x: unknown, max = 80) => String(x ?? "").trim().slice(0, max);
  return {
    id, coachId: p.coachId ? String(p.coachId) : null, name: str(p.name), bankCode: str(p.bankCode, 10).replace(/\D/g, ""), bankName: str(p.bankName), branch: str(p.branch),
    accountName: str(p.accountName), accountNo: str(p.accountNo, 40).replace(/[^\d-]/g, ""), taxMode: p.taxMode === "invoice" || p.taxMode === "withhold" ? p.taxMode : "", note: str(p.note, 200),
  };
}
/** 帳號摘要（對帳單／匯款頁顯示用）。 */
export const bankLine = (r: PayeeRec | null) => r && (r.bankCode || r.bankName || r.accountNo) ? [r.bankCode && `(${r.bankCode})`, r.bankName, r.branch, r.accountNo].filter(Boolean).join(" ") : "";
