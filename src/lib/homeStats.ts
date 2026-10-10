// 首頁彙總層（2026/10/09）：首頁三個視角的「錢、晉升、到期、報聘、公司損益」全部從後台既有真相算出來——
// 分潤匯款（acctEngine.payoutsOf）、本月帳務（calcMonth）、顧問費實績（consultStats）、
// 制度門檻（comp thresholds）、合作期限（coaches.license_*）、報聘申請（coach_applications）。
//
// ⚠️ 首頁**不再讀 member_metrics**（手填業績表，從頭到尾 0 筆）。活動量（拜訪／電話／提案／成交）
//    整組下架（Ray 2026/10/09）：系統沒有來源、也不是制度的 KPI。
// 這個檔案是純函式：外面把 AcctState、CompParams、名冊、申請表餵進來，好測。
import {
  payoutsOf, calcMonth, consultStats, prevYm, bankLine, settlementDate,
  type AcctState, type PayoutLine, type MonthResult, type PayoutSummary,
} from "./acctEngine";
import type { CompParams } from "./comp/types";
import { internEndISO, isCoopRank, diffDays, RANK_GROUP_LABEL } from "./license";
import { fmtNTD } from "./money";

export type CoachLike = {
  id: string; name?: string | null; rankCode?: string | null; uplineId?: string | null;
  licenseFrom?: string | null; licenseUntil?: string | null; status?: string | null; isTest?: boolean | null;
};

// ---------- 期間（2026/10/10 Ray：首頁可切本月／第一～四季／上下半年／全年；下午再補：可以選年份、選哪個月、哪一季） ----------
// 一個期間＝一串 'YYYY-MM'。單月就是原本的首頁；多月時錢與損益跨月加總，晉升累計與到期倒數不受期間影響。
// 鍵的寫法（網址 ?range=）：'2026-08'＝月、'2026-q3'＝季、'2026-h1'＝半年、'2026'＝全年。
// 舊寫法 month／q1～q4／h1／h2／year 也認得（＝今年的那一段）；認不得的一律退回本月。
export type PeriodKind = "month" | "quarter" | "half" | "year";
export type Period = {
  key: string; kind: PeriodKind; year: number; n: number;   // n：月 1–12／季 1–4／半年 1–2／全年 1
  label: string; yms: string[]; from: string; to: string; multi: boolean; current: boolean;
};
const pad2 = (n: number) => String(n).padStart(2, "0");
export const periodKey = (kind: PeriodKind, year: number, n: number) =>
  kind === "month" ? `${year}-${pad2(n)}` : kind === "quarter" ? `${year}-q${n}` : kind === "half" ? `${year}-h${n}` : `${year}`;
export function periodOf(key: string | null | undefined, today: string): Period {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)), tq = Math.ceil(tm / 3), th = tm <= 6 ? 1 : 2;
  let kind: PeriodKind = "month", year = ty, n = tm;
  const k = (key ?? "").trim().toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = k.match(/^(\d{4})-(\d{2})$/)) && Number(m[2]) >= 1 && Number(m[2]) <= 12) { kind = "month"; year = Number(m[1]); n = Number(m[2]); }
  else if ((m = k.match(/^(\d{4})-q([1-4])$/))) { kind = "quarter"; year = Number(m[1]); n = Number(m[2]); }
  else if ((m = k.match(/^(\d{4})-h([12])$/))) { kind = "half"; year = Number(m[1]); n = Number(m[2]); }
  else if ((m = k.match(/^(\d{4})$/))) { kind = "year"; year = Number(m[1]); n = 1; }
  else if ((m = k.match(/^q([1-4])$/))) { kind = "quarter"; n = Number(m[1]); }
  else if ((m = k.match(/^h([12])$/))) { kind = "half"; n = Number(m[1]); }
  else if (k === "year") { kind = "year"; n = 1; }
  if (year < 2000 || year > 2100) { kind = "month"; year = ty; n = tm; }
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${year}-${pad2(a + i)}`);
  let yms: string[], label: string, current: boolean;
  switch (kind) {
    case "quarter": yms = span(n * 3 - 2, n * 3); label = `${year} 第${"一二三四"[n - 1]}季`; current = year === ty && n === tq; break;
    case "half": yms = span(n === 1 ? 1 : 7, n === 1 ? 6 : 12); label = `${year} ${n === 1 ? "上" : "下"}半年`; current = year === ty && n === th; break;
    case "year": yms = span(1, 12); label = `${year} 全年`; current = year === ty; break;
    default: yms = [`${year}-${pad2(n)}`]; label = `${year}年${n}月`; current = year === ty && n === tm;
  }
  return { key: periodKey(kind, year, n), kind, year, n, label, yms, from: yms[0], to: yms[yms.length - 1], multi: yms.length > 1, current };
}
/** 切換器用的選項：年份（有收款的最早一年～今年）、每種期間的子選項，當期標「本月／本季／…」。 */
export type RangeOptions = {
  years: number[];
  thisYear: number; thisMonth: number; thisQuarter: number; thisHalf: number;
  kinds: { kind: PeriodKind; label: string }[];
  months: { n: number; label: string }[]; quarters: { n: number; label: string }[]; halves: { n: number; label: string }[];
};
export function rangeOptions(today: string, receiptYms: string[] = []): RangeOptions {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)), tq = Math.ceil(tm / 3), th = tm <= 6 ? 1 : 2;
  const ys = receiptYms.map((k) => Number(k.slice(0, 4))).filter((y) => y >= 2000 && y <= ty);
  const first = ys.length ? Math.min(...ys) : ty;
  const years = Array.from({ length: ty - first + 1 }, (_, i) => ty - i);
  const Q = ["第一季", "第二季", "第三季", "第四季"];
  return {
    years, thisYear: ty, thisMonth: tm, thisQuarter: tq, thisHalf: th,
    kinds: [{ kind: "month", label: "月" }, { kind: "quarter", label: "季" }, { kind: "half", label: "半年" }, { kind: "year", label: "全年" }],
    months: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, label: `${i + 1} 月` })),
    quarters: Q.map((l, i) => ({ n: i + 1, label: l })),
    halves: [{ n: 1, label: "上半年" }, { n: 2, label: "下半年" }],
  };
}
const ymList = (yms: string | string[]) => (typeof yms === "string" ? [yms] : yms);

/** 一段期間的分潤匯款：單月＝payoutsOf；多月＝各月相加、同一受款人併成一條（已匯金額加總、發放日取最後一個月）。 */
export function payoutsOver(S: AcctState, yms: string | string[]): PayoutSummary {
  const list = ymList(yms);
  if (list.length === 1) return payoutsOf(S, list[0]);
  const by = new Map<string, PayoutLine>();
  const out: PayoutSummary = { lines: [], due: 0, net: 0, paid: 0, remaining: 0, company: 0, received: 0, warns: [], payDate: settlementDate(list[list.length - 1]), pending: { n: 0, amount: 0 } };
  for (const ym of list) {
    const s = payoutsOf(S, ym);
    out.due += s.due; out.net += s.net; out.paid += s.paid; out.remaining += s.remaining; out.company += s.company; out.received += s.received;
    out.pending.n += s.pending.n; out.pending.amount += s.pending.amount;
    for (const w of s.warns) if (!out.warns.includes(w)) out.warns.push(w);
    for (const l of s.lines) {
      const p = by.get(l.key);
      if (!p) { by.set(l.key, { ...l, srcs: [...l.srcs], mark: l.mark ? { ...l.mark } : null, tax: { ...l.tax } }); continue; }
      p.due += l.due; p.remaining += l.remaining; p.srcs.push(...l.srcs); p.rec = l.rec ?? p.rec;
      p.tax = { mode: l.tax.mode, withhold: p.tax.withhold + l.tax.withhold, nhi: p.tax.nhi + l.tax.nhi, net: p.tax.net + l.tax.net, applied: p.tax.applied || l.tax.applied };
      if (l.mark) p.mark = { paidOn: l.mark.paidOn, amount: (p.mark?.amount ?? 0) + l.mark.amount, note: "" };
    }
  }
  out.lines = [...by.values()].sort((a, b) => b.due - a.due);
  return out;
}
/** 一段期間的損益：單月＝calcMonth；多月＝營業額／拆分／實收／固定／稅／淨利相加，沒有任何一個月有帳就回 null。 */
export function monthsOver(S: AcctState, yms: string | string[]): MonthResult | null {
  const list = ymList(yms);
  if (list.length === 1) return calcMonth(S, list[0]);
  let out: MonthResult | null = null;
  for (const ym of list) {
    const m = calcMonth(S, ym);
    if (!m) continue;
    if (!out) { out = { ...m, byItem: m.byItem.map((x) => ({ ...x })), byTo: { ...m.byTo } }; continue; }
    out.rev += m.rev; out.split += m.split; out.gp += m.gp; out.fixed += m.fixed; out.vat += m.vat; out.net += m.net;
    for (const x of m.byItem) {
      const p = out.byItem.find((o) => o.it.id === x.it.id);
      if (p) { p.q += x.q; p.rev += x.rev; p.gp += x.gp; p.sysN += x.sysN; p.manualQ += x.manualQ; p.rcN += x.rcN; } else out.byItem.push({ ...x });
    }
    for (const [k, v] of Object.entries(m.byTo)) out.byTo[k] = (out.byTo[k] ?? 0) + v;
  }
  if (out) { out.gm = out.rev ? out.gp / out.rev : 0; out.nm = out.rev ? out.net / out.rev : 0; }
  return out;
}
/** 期間內有沒有任何算得進帳的收款。 */
export function hasReceipts(S: AcctState, yms: string | string[]): boolean {
  return ymList(yms).some((ym) => (S.receipts?.[ym] ?? []).some((x) => !x.void && x.verified !== false));
}

/** 某位教練在某月（或某段期間）的分潤線（對帳單那一條）。受款人簿對得上就用它的 key，否則用名字。 */
export function coachLine(S: AcctState, ym: string | string[], c: CoachLike): PayoutLine | null {
  const sum = payoutsOver(S, ym);
  return lineOf(sum, c);
}
function lineOf(sum: PayoutSummary, c: CoachLike): PayoutLine | null {
  const name = (c.name ?? "").trim();
  return sum.lines.find((l) => l.rec?.coachId === c.id) ?? sum.lines.find((l) => l.key === `n:${name}`) ?? null;
}

// ---------- 教練：我的錢 ----------
export type MemberMoney = {
  ym: string; payDate: string;                     // ym＝期間最後一個月；payDate＝那個月的發放日
  due: number; withhold: number; net: number;    // 期間內應付／扣繳／實匯
  paid: number; status: "none" | "pending" | "partial" | "paid";
  srcN: number;
  months: { ym: string; net: number }[];           // 單月：近 6 個月實匯；多月：期間內各月（舊→新）
  unverified: { n: number; amount: number };       // 我記的顧問費還在待查帳
  payeeReady: boolean; taxMode: string;            // 收款設定填了沒
};
export function memberMoney(S: AcctState, c: CoachLike, yms: string | string[]): MemberMoney {
  const list = ymList(yms), ym = list[list.length - 1];
  const sum = payoutsOver(S, list);
  const l = lineOf(sum, c);
  const months: { ym: string; net: number }[] = [];
  if (list.length > 1) for (const k of list) months.push({ ym: k, net: lineOf(payoutsOf(S, k), c)?.tax.net ?? 0 });
  else { let k = ym; for (let i = 0; i < 6; i++) { months.unshift({ ym: k, net: i === 0 ? (l?.tax.net ?? 0) : (lineOf(payoutsOf(S, k), c)?.tax.net ?? 0) }); k = prevYm(k); } }
  // 待查帳：我建的顧問費（任何月份）
  let n = 0, amount = 0;
  for (const list of Object.values(S.receipts ?? {})) for (const x of list) if (!x.void && x.verified === false && (x.execCoachId === c.id || x.enteredBy === c.id)) { n++; amount += Math.max(0, x.amount - (x.refund || 0)); }
  const rec = (S.payeeBook ?? []).find((p) => p.coachId === c.id) ?? null;
  const paid = l?.mark?.amount ?? 0;
  const net = l?.tax.net ?? 0;
  return {
    ym, payDate: sum.payDate,
    due: l?.due ?? 0, withhold: l ? l.tax.withhold + l.tax.nhi : 0, net,
    paid, status: !l ? "none" : paid <= 0 ? "pending" : paid + 0.5 < net ? "partial" : "paid",
    srcN: l?.srcs.length ?? 0, months,
    unverified: { n, amount },
    payeeReady: !!rec && !!bankLine(rec) && !!rec.taxMode, taxMode: rec?.taxMode ?? "",
  };
}

// ---------- 晉升進度（V7.2：A 軌門檻；實習／結業看報聘門檻） ----------
export type PromoProgress = {
  rankCode: string | null; rankLabel: string;
  kind: "apply" | "promote" | "top" | "unranked";
  nextCode: string | null;
  cases: number; fees: number; needCases: number | null; needFees: number | null;
  pct: number;                                    // 兩個門檻取較低的達成率
  met: boolean;
};
export function promoProgress(S: AcctState, params: CompParams, c: CoachLike): PromoProgress {
  const st = consultStats(S, { coachId: c.id })[c.id] ?? { cases: 0, fees: 0, keys: [] };
  const code = c.rankCode ?? null;
  const label = code ? (RANK_GROUP_LABEL[code] ?? code) : "未定級";
  const s = params.settings;
  const pctOf = (have: number, need: number | null | undefined) => need ? Math.min(100, Math.round(have / need * 100)) : 100;
  if (!code) return { rankCode: null, rankLabel: label, kind: "unranked", nextCode: null, cases: st.cases, fees: st.fees, needCases: null, needFees: null, pct: 0, met: false };
  if (isCoopRank(code)) {
    const needCases = s.applyMinCases ?? 1, needFees = s.applyMinFees ?? 30000;
    const pct = Math.min(pctOf(st.cases, needCases), pctOf(st.fees, needFees));
    return { rankCode: code, rankLabel: label, kind: "apply", nextCode: "C2", cases: st.cases, fees: st.fees, needCases, needFees, pct, met: st.cases >= needCases && st.fees >= needFees };
  }
  const t = params.thresholds.find((x) => x.kind === "promotion_a" && x.fromCode === code && x.enabled !== false);
  if (!t) return { rankCode: code, rankLabel: label, kind: "top", nextCode: null, cases: st.cases, fees: st.fees, needCases: null, needFees: null, pct: 100, met: true };
  const pct = Math.min(pctOf(st.cases, t.cases), pctOf(st.fees, t.fees));
  return { rankCode: code, rankLabel: label, kind: "promote", nextCode: t.toCode, cases: st.cases, fees: st.fees, needCases: t.cases ?? null, needFees: t.fees ?? null, pct, met: (t.cases == null || st.cases >= t.cases) && (t.fees == null || st.fees >= t.fees) };
}

// ---------- 到期倒數（實習 180 天／年度合作期間） ----------
export type TermInfo = { kind: "intern" | "license" | "none"; until: string | null; daysLeft: number | null; label: string; warn: boolean };
export function termInfo(c: CoachLike, today: string): TermInfo {
  if (c.rankCode === "INTERN" && c.licenseFrom) {
    const until = internEndISO(c.licenseFrom);
    const d = diffDays(today, until);
    return { kind: "intern", until, daysLeft: d, label: d < 0 ? "實習期已滿，未報聘轉結業合作夥伴" : `實習期還有 ${d} 天（${until} 期滿）`, warn: d <= 30 };
  }
  if (c.licenseUntil) {
    const d = diffDays(today, c.licenseUntil);
    return { kind: "license", until: c.licenseUntil, daysLeft: d, label: d < 0 ? `年度合作已於 ${c.licenseUntil} 到期` : `年度合作到 ${c.licenseUntil}（還有 ${d} 天）`, warn: d <= 30 };
  }
  return { kind: "none", until: null, daysLeft: null, label: "尚未設定合作期限", warn: false };
}

// ---------- 主管：團隊的錢與人 ----------
export type TeamMoney = {
  rows: { id: string; name: string; rankCode: string | null; net: number; due: number; cases: number; fees: number; nextCode: string | null; pct: number }[];
  total: number; unverified: { n: number; amount: number }; nearPromo: number;
};
export function teamMoney(S: AcctState, params: CompParams, members: CoachLike[], yms: string | string[]): TeamMoney {
  const sum = payoutsOver(S, yms);
  let total = 0, un = 0, unAmt = 0, near = 0;
  const rows = members.map((m) => {
    const l = lineOf(sum, m);
    const p = promoProgress(S, params, m);
    const net = l?.tax.net ?? 0; total += net;
    if (p.pct >= 70 && !p.met && p.kind !== "top") near++;
    return { id: m.id, name: m.name ?? "", rankCode: m.rankCode ?? null, net, due: l?.due ?? 0, cases: p.cases, fees: p.fees, nextCode: p.nextCode, pct: p.pct };
  }).sort((a, b) => b.net - a.net);
  const ids = new Set(members.map((m) => m.id));
  for (const list of Object.values(S.receipts ?? {})) for (const x of list) if (!x.void && x.verified === false && x.execCoachId && ids.has(x.execCoachId)) { un++; unAmt += x.amount; }
  return { rows, total, unverified: { n: un, amount: unAmt }, nearPromo: near };
}

// ---------- 報聘漏斗（真的：coach_applications ＋ pending 教練） ----------
export type ApplyLike = { coachId: string; route?: string | null; introducerId?: string | null; introducerState?: string | null; submittedAt?: Date | string | null };
export type ApplyFunnel = {
  steps: { label: string; value: number }[];
  pending: { name: string; sub: string; tag: string; tagKind: string }[];
  referredByMe: number;
};
export function applyFunnel(apps: ApplyLike[], pendingCoaches: CoachLike[], scopeIds: Set<string>, meId: string | null): ApplyFunnel {
  const pend = pendingCoaches.filter((c) => scopeIds.has(c.id) || (c.uplineId && scopeIds.has(c.uplineId)));
  const byId = new Map(apps.map((a) => [a.coachId, a]));
  let waitIntro = 0, waitReview = 0;
  const pending: ApplyFunnel["pending"] = [];
  for (const c of pend) {
    const a = byId.get(c.id);
    const intro = a?.introducerState ?? "skipped";
    if (a && a.introducerId && intro !== "confirmed") { waitIntro++; pending.push({ name: c.name ?? "新人", sub: "等推薦人確認", tag: "推薦人", tagKind: "amber" }); }
    else { waitReview++; pending.push({ name: c.name ?? "新人", sub: a ? "申請表已送出，待審核" : "帳號待開通", tag: "審核", tagKind: "green" }); }
  }
  const referredByMe = meId ? apps.filter((a) => a.introducerId === meId).length : 0;
  return { steps: [{ label: "申請中", value: pend.length }, { label: "等推薦人確認", value: waitIntro }, { label: "待審核", value: waitReview }], pending: pending.slice(0, 5), referredByMe };
}

// ---------- 核心成員：公司損益與組織 ----------
export type CompanyMonth = {
  ym: string; r: MonthResult | null; payouts: PayoutSummary;              // ym＝期間最後一個月；r＝期間損益加總
  trend: { ym: string; rev: number; company: number; net: number }[];      // 單月：近 8 個月；多月：期間內各月（舊→新）
  bodies: { code: string; label: string; n: number }[];
  expired: number; unlicensed: number; headcount: number;
  chains: { id: string; name: string; net: number; headcount: number }[];
  health: { label: string; pct: number; color: string }[]; healthScore: number;
};
const BODY_GROUPS: [string, string, (c: string) => boolean][] = [
  ["INTERN", "實習", (c) => c === "INTERN"], ["PARTNER", "結業合作", (c) => c === "PARTNER"],
  ["C", "認證 C", (c) => c.startsWith("C") && c !== "CHIEF"], ["S", "資深 S", (c) => c.startsWith("S")], ["CHIEF", "首席", (c) => c === "CHIEF"],
];
export function companyMonth(S: AcctState, all: CoachLike[], yms: string | string[], today: string, opts: { maintainPass?: number; maintainTotal?: number; checkinDone?: number; checkinTotal?: number; chains?: { id: string; name: string; memberIds: string[] }[] } = {}): CompanyMonth {
  const list = ymList(yms), ym = list[list.length - 1];
  const r = monthsOver(S, list);
  const payouts = payoutsOver(S, list);
  const trend: CompanyMonth["trend"] = [];
  const trendOf = (k: string) => { const m = calcMonth(S, k); return { ym: k, rev: m?.rev ?? 0, company: m?.gp ?? 0, net: m?.net ?? 0 }; };
  if (list.length > 1) for (const k of list) trend.push(trendOf(k));
  else { let k = ym; for (let i = 0; i < 8; i++) { trend.unshift(trendOf(k)); k = prevYm(k); } }
  const live = all.filter((c) => !c.isTest && c.status === "active");
  const bodies = BODY_GROUPS.map(([code, label, f]) => ({ code, label, n: live.filter((c) => f(c.rankCode ?? "")).length }));
  const expired = live.filter((c) => c.licenseUntil && c.licenseUntil < today).length;
  const unlicensed = live.filter((c) => !c.licenseUntil).length;
  const chains = (opts.chains ?? []).map((t) => ({ id: t.id, name: t.name, headcount: t.memberIds.length, net: t.memberIds.reduce((a, id) => { const c = all.find((x) => x.id === id); return a + (c ? (lineOf(payouts, c)?.tax.net ?? 0) : 0); }, 0) })).sort((a, b) => b.net - a.net);
  // 制度量得出來的健康度（不是活動量）
  const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
  const referrers = new Set<string>();
  for (const k of list) for (const x of S.receipts?.[k] ?? []) if (!x.void && x.sharers[0]?.coachId) referrers.add(x.sharers[0].coachId);
  const health = [
    { label: "合作有效", pct: pct(live.length - expired, live.length), color: "var(--brand)" },
    { label: "維持資格", pct: opts.maintainTotal ? pct(opts.maintainPass ?? 0, opts.maintainTotal) : 0, color: "var(--ok)" },
    { label: "推薦動能", pct: pct(referrers.size, live.length), color: "var(--c5)" },
    { label: "回訪完成", pct: opts.checkinTotal ? pct(opts.checkinDone ?? 0, opts.checkinTotal) : 0, color: "var(--ok)" },
    { label: "對帳完成", pct: payouts.net ? pct(payouts.paid, payouts.net) : 0, color: "var(--tx2)" },
  ];
  const healthScore = Math.round(health.reduce((a, h) => a + h.pct, 0) / health.length);
  return { ym, r, payouts, trend, bodies, expired, unlicensed, headcount: live.length, chains, health, healthScore };
}

export const moneyLabel = (n: number) => fmtNTD(n);
export { settlementDate };
