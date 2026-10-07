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
/** 分潤人（職級由低到高）；coachId 對得上名冊就帶，之後可接職級分潤表。 */
export type Sharer = { name: string; coachId?: string | null };
/**
 * 逐筆收款（acct_receipts）：對帳表的一列。
 * payees：某個拆分列（以 split.to 為鍵）這一筆實際匯給誰（講師一→王老師）；沒填就用拆分列的名字。
 */
export type Receipt = {
  id: string; ym: string; itemId: string; on: string; amount: number; last5: string;
  payer: string; payerCoachId?: string | null; sharers: Sharer[]; payees: Record<string, string>; note: string; void: boolean;
};
/** 某月某受款人的「已匯」紀錄（acct_payouts）。 */
export type PayoutMark = { paidOn: string; amount: number; note: string };
export type ReceiptRow = { to: string; v: number; mode: SplitMode; label: string };
export type ReceiptResult = { amount: number; rows: ReceiptRow[]; payout: number; keep: number; company: number; warn: string | null };
/** source：這個項目由哪個系統事件自動入帳（apply＝報聘核准／license＝培訓帳號開通）；空＝只手填。 */
export type AcctSource = "apply" | "license";
export type AcctItem = { id: string; name: string; price: number; splits: AcctSplit[]; source?: AcctSource | ""; cat?: string };
/** 系統入帳的一筆（acct_entries）：金額是事件當下的單價快照。 */
export type SysRow = { id: string; itemId: string; coachId: string; coachName: string; source: AcctSource; amount: number; void: boolean; createdAt: string };
export type AcctMonth = { qty: Record<string, number>; fixed: { name: string; amt: number }[] };
/** poolTiers[n-1]＝n 位分潤人時各自占收款的 %（職級低→高）。Excel：1 人 [30]、2 人 [25,5]；3 人等 Ray 的制度表。 */
export type AcctParams = { vatRate: number; poolTiers: number[][] };
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
  coachList?: { id: string; name: string }[]; // 名冊（給匯款人／分潤人對名字用）
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
export const ACCT_DEFAULT_PARAMS: AcctParams = { vatRate: 5, poolTiers: ACCT_DEFAULT_TIERS };
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
export function calcReceipt(it: AcctItem, amount: number, sharers: Sharer[], payees: Record<string, string>, params: AcctParams, adj: AcctAdj = {}): ReceiptResult {
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
      const tier = tiers[n - 1] ?? tiers[tiers.length - 1];
      if (!tiers[n - 1]) warn = `${n} 位分潤人的切法表還沒設定，先用 ${tier.length} 人的`;
      sharers.forEach((sh, i) => { const v = amount * (tier[i] ?? 0) / 100; first += v; rows.push({ to: sh.name.trim() || `分潤${i + 1}`, v, mode: "pool", label: `分潤${["一", "二", "三", "四", "五"][i] ?? i + 1} ${tier[i] ?? 0}%` }); });
      continue;
    }
    const v = s.mode === "amt" ? s.v : amount * Math.max(0, s.v + (s.mode === "pct" ? (adj.split ?? 0) : 0)) / 100;
    first += v;
    rows.push({ to: nameOf(s), v, mode: s.mode, label: s.mode === "keep" ? `公司自留 ${s.v}%` : s.mode === "amt" ? "固定" : `${s.v}%` });
  }
  const remain = Math.max(0, amount - first);
  for (const s of it.splits) if (s.mode === "rest") rows.push({ to: nameOf(s), v: remain * s.v / 100, mode: "rest", label: `餘額 ${s.v}%` });
  let payout = 0, keep = 0;
  for (const r of rows) { if (r.mode === "keep") keep += r.v; else payout += r.v; }
  return { amount, rows, payout, keep, company: amount - payout, warn };
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
    const rcs = receipts.filter((x) => x.itemId === it.id && !x.void);
    for (const x of rcs) {
      const ux = unitOf(it, adj, x.amount, params, x.sharers, x.payees);
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
export type PayoutLine = { payee: string; due: number; srcs: PayoutSrc[]; mark: PayoutMark | null; remaining: number };
export type PayoutSummary = { lines: PayoutLine[]; due: number; paid: number; remaining: number; company: number; received: number; warns: string[] };
/** 某一個月：每個受款人應匯多少、從哪幾筆來、匯了沒。公司自留（keep）與公司實收不在裡面。 */
export function payoutsOf(S: AcctState, ym: string): PayoutSummary {
  const by: Record<string, PayoutLine> = {};
  const warns: string[] = [];
  let company = 0, received = 0;
  for (const x of S.receipts?.[ym] ?? []) {
    if (x.void) continue;
    const it = S.items.find((i) => i.id === x.itemId);
    if (!it) continue;
    const rr = calcReceipt(it, x.amount, x.sharers, x.payees, S.params);
    received += x.amount; company += rr.company;
    if (rr.warn) warns.push(`${x.on} ${x.payer}：${rr.warn}`);
    for (const r of rr.rows) {
      if (r.mode === "keep" || !r.v) continue;
      const l = (by[r.to] ??= { payee: r.to, due: 0, srcs: [], mark: null, remaining: 0 });
      l.due += r.v;
      l.srcs.push({ receiptId: x.id, itemName: it.name, on: x.on, payer: x.payer, v: r.v, label: r.label });
    }
  }
  const marks = S.payouts?.[ym] ?? {};
  let due = 0, paid = 0;
  const lines = Object.values(by).sort((a, b) => b.due - a.due).map((l) => {
    const mark = marks[l.payee] ?? null;
    const p = mark ? mark.amount : 0;
    due += l.due; paid += p;
    return { ...l, mark, remaining: l.due - p };
  });
  return { lines, due, paid, remaining: due - paid, company, received, warns };
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
    const source = x.source === "apply" || x.source === "license" ? x.source : "";
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
  return { vatRate: vat >= 0 && vat <= 100 ? vat : ACCT_DEFAULT_PARAMS.vatRate, poolTiers: tiers.length ? tiers : ACCT_DEFAULT_TIERS.map((t) => [...t]) };
}
export function normGoal(v: unknown): AcctGoal {
  const g = (v && typeof v === "object" ? v : {}) as Partial<AcctGoal>;
  return { netTarget: Math.max(0, num0(g.netTarget)) };
}
export const isIsoDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
export function normSharers(v: unknown): Sharer[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).map((x) => typeof x === "string" ? { name: x } : (x && typeof x === "object" ? x : {}) as Partial<Sharer>)
    .map((x) => ({ name: String(x.name ?? "").trim(), ...(x.coachId ? { coachId: String(x.coachId) } : {}) })).filter((x) => x.name);
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
  };
}
export function normPayoutMark(v: unknown): PayoutMark {
  const m = (v && typeof v === "object" ? v : {}) as Partial<PayoutMark>;
  return { paidOn: isIsoDate(m.paidOn) ? String(m.paidOn) : "", amount: Math.max(0, num0(m.amount)), note: String(m.note ?? "").trim() };
}
