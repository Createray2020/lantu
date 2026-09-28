// 帳務後台（組織營業損益）的純計算（2026/09/29）。
//
// 原型：docs/帳務後台_原型.html（Ray 對過版面說「放進後台」）。這裡的公式與原型逐字同一套，
// acctEngine.test.ts 用原型的示範資料對拍。
//
// 三層口徑：營業額 → 減「拆分給別人」＝營業毛利 → 減固定支出、減營業稅 ＝ 淨利。
// 拆分一列可以是比例（占單價 %）或固定金額；營業稅單獨列一層（營所稅先不算）；數量與固定支出按月存。

export type SplitMode = "pct" | "amt";
export type AcctSplit = { to: string; mode: SplitMode; v: number };
/** source：這個項目由哪個系統事件自動入帳（apply＝報聘核准／license＝培訓帳號開通）；空＝只手填。 */
export type AcctSource = "apply" | "license";
export type AcctItem = { id: string; name: string; price: number; splits: AcctSplit[]; source?: AcctSource | "" };
/** 系統入帳的一筆（acct_entries）：金額是事件當下的單價快照。 */
export type SysRow = { id: string; itemId: string; coachId: string; coachName: string; source: AcctSource; amount: number; void: boolean; createdAt: string };
export type AcctMonth = { qty: Record<string, number>; fixed: { name: string; amt: number }[] };
export type AcctParams = { vatRate: number };
export type AcctGoal = { netTarget: number };
/** 月目標：跟 AcctMonth 同一個形狀（目標筆數、目標固定支出），多一個目標淨利。另一張表存，不跟實際帳混。 */
export type AcctTarget = AcctMonth & { net: number };
export type AcctState = {
  items: AcctItem[];
  months: Record<string, AcctMonth>;   // 'YYYY-MM' 實際
  targets: Record<string, AcctTarget>; // 'YYYY-MM' 目標
  draft: AcctTarget | null;            // 目標工作台的草稿（Ray：目標不綁期間，設好了再存入哪個月）
  sys?: Record<string, SysRow[]>;      // 'YYYY-MM' → 系統入帳事件（含作廢的，作廢不計）
  params: AcctParams;
  goal: AcctGoal;
};
/** what-if 拉桿：單價 %、拆分比例 ±點、數量 %、固定支出 %（都是相對現況） */
export type AcctAdj = { price?: number; split?: number; qty?: number; fix?: number };

export type UnitResult = { price: number; split: number; rows: { to: string; v: number }[]; gp: number; gm: number };
export type ItemResult = { it: AcctItem; q: number; u: UnitResult; rev: number; gp: number; sysN: number; manualQ: number };
export type MonthResult = {
  rev: number; split: number; gp: number; gm: number;
  fixed: number; vat: number; net: number; nm: number;
  byItem: ItemResult[]; byTo: Record<string, number>;
};

export const ACCT_DEFAULT_PARAMS: AcctParams = { vatRate: 5 };
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

/** 單筆：售價、拆出多少、單筆毛利、毛利率。 */
export function unitOf(it: AcctItem, adj: AcctAdj = {}, basePrice?: number): UnitResult {
  const price = (basePrice ?? it.price) * (1 + (adj.price ?? 0) / 100);
  let split = 0;
  const rows = it.splits.map((s) => {
    const v = s.mode === "pct" ? price * Math.max(0, s.v + (adj.split ?? 0)) / 100 : s.v;
    split += v;
    return { to: s.to, v };
  });
  return { price, split, rows, gp: price - split, gm: price ? (price - split) / price : 0 };
}

/** 一份月資料（實際或目標都行）的損益結構。 */
export function calcData(items: AcctItem[], m: AcctMonth, params: AcctParams, adj: AcctAdj = {}, sys: SysRow[] = []): MonthResult {
  let rev = 0, split = 0, gp = 0;
  const byItem: ItemResult[] = [];
  const byTo: Record<string, number> = {};
  const scale = 1 + (adj.qty ?? 0) / 100;
  for (const it of items) {
    const manualQ = (m.qty[it.id] ?? 0) * scale;
    const u = unitOf(it, adj);
    let irev = u.price * manualQ, isplit = u.split * manualQ, igp = u.gp * manualQ;
    for (const r of u.rows) byTo[r.to] = (byTo[r.to] ?? 0) + r.v * manualQ;
    // 系統入帳：每一筆用它自己的快照金額算（不同期間價格不同），拆分規則套現在的
    const rows = sys.filter((x) => x.itemId === it.id && !x.void);
    for (const x of rows) {
      const ux = unitOf(it, adj, x.amount);
      irev += ux.price * scale; isplit += ux.split * scale; igp += ux.gp * scale;
      for (const r of ux.rows) byTo[r.to] = (byTo[r.to] ?? 0) + r.v * scale;
    }
    const q = manualQ + rows.length * scale;
    rev += irev; split += isplit; gp += igp;
    byItem.push({ it, q, u, rev: irev, gp: igp, sysN: rows.length, manualQ });
  }
  const fixed = m.fixed.reduce((a, f) => a + (Number(f.amt) || 0), 0) * (1 + (adj.fix ?? 0) / 100);
  const vat = rev * params.vatRate / 100;
  const net = gp - fixed - vat;
  return { rev, split, gp, gm: rev ? gp / rev : 0, fixed, vat, net, nm: rev ? net / rev : 0, byItem, byTo };
}
/** 某一個月的實際損益結構。沒有那個月回 null。 */
export function calcMonth(S: AcctState, ym: string, adj: AcctAdj = {}): MonthResult | null {
  const m = S.months[ym];
  return m ? calcData(S.items, m, S.params, adj, S.sys?.[ym] ?? []) : null;
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
  const sys = S.sys?.[ym] ?? [];
  const rt = calcData(S.items, t, S.params), ra = calcData(S.items, a, S.params, {}, sys);
  const items: CompareRow[] = S.items.map((it) => {
    const u = unitOf(it);
    const net1 = u.gp - u.price * S.params.vatRate / 100;
    const target = t.qty[it.id] ?? 0, actual = (a.qty[it.id] ?? 0) + sys.filter((x) => x.itemId === it.id && !x.void).length;
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
      to: String(s.to ?? "").trim(), mode: (s.mode === "amt" ? "amt" : "pct") as SplitMode, v: Math.max(0, num0(s.v)),
    })) : [];
    const source = x.source === "apply" || x.source === "license" ? x.source : "";
    out.push({ id: String(x.id), name: String(x.name ?? "").trim(), price: Math.max(0, num0(x.price)), splits, ...(source ? { source } : {}) });
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
  return { vatRate: vat >= 0 && vat <= 100 ? vat : ACCT_DEFAULT_PARAMS.vatRate };
}
export function normGoal(v: unknown): AcctGoal {
  const g = (v && typeof v === "object" ? v : {}) as Partial<AcctGoal>;
  return { netTarget: Math.max(0, num0(g.netTarget)) };
}
