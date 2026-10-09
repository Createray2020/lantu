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

/** 某位教練在某月的分潤線（對帳單那一條）。受款人簿對得上就用它的 key，否則用名字。 */
export function coachLine(S: AcctState, ym: string, c: CoachLike): PayoutLine | null {
  const sum = payoutsOf(S, ym);
  return lineOf(sum, c);
}
function lineOf(sum: PayoutSummary, c: CoachLike): PayoutLine | null {
  const name = (c.name ?? "").trim();
  return sum.lines.find((l) => l.rec?.coachId === c.id) ?? sum.lines.find((l) => l.key === `n:${name}`) ?? null;
}

// ---------- 教練：我的錢 ----------
export type MemberMoney = {
  ym: string; payDate: string;
  due: number; withhold: number; net: number;    // 本月應付／扣繳／實匯
  paid: number; status: "none" | "pending" | "partial" | "paid";
  srcN: number;
  months: { ym: string; net: number }[];           // 近 6 個月實匯（舊→新）
  unverified: { n: number; amount: number };       // 我記的顧問費還在待查帳
  payeeReady: boolean; taxMode: string;            // 收款設定填了沒
};
export function memberMoney(S: AcctState, c: CoachLike, ym: string): MemberMoney {
  const sum = payoutsOf(S, ym);
  const l = lineOf(sum, c);
  const months: { ym: string; net: number }[] = [];
  let k = ym;
  for (let i = 0; i < 6; i++) { months.unshift({ ym: k, net: i === 0 ? (l?.tax.net ?? 0) : (lineOf(payoutsOf(S, k), c)?.tax.net ?? 0) }); k = prevYm(k); }
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
export function teamMoney(S: AcctState, params: CompParams, members: CoachLike[], ym: string): TeamMoney {
  const sum = payoutsOf(S, ym);
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
  ym: string; r: MonthResult | null; payouts: PayoutSummary;
  trend: { ym: string; rev: number; company: number; net: number }[];      // 近 8 個月（舊→新）
  bodies: { code: string; label: string; n: number }[];
  expired: number; unlicensed: number; headcount: number;
  chains: { id: string; name: string; net: number; headcount: number }[];
  health: { label: string; pct: number; color: string }[]; healthScore: number;
};
const BODY_GROUPS: [string, string, (c: string) => boolean][] = [
  ["INTERN", "實習", (c) => c === "INTERN"], ["PARTNER", "結業合作", (c) => c === "PARTNER"],
  ["C", "認證 C", (c) => c.startsWith("C") && c !== "CHIEF"], ["S", "資深 S", (c) => c.startsWith("S")], ["CHIEF", "首席", (c) => c === "CHIEF"],
];
export function companyMonth(S: AcctState, all: CoachLike[], ym: string, today: string, opts: { maintainPass?: number; maintainTotal?: number; checkinDone?: number; checkinTotal?: number; chains?: { id: string; name: string; memberIds: string[] }[] } = {}): CompanyMonth {
  const r = calcMonth(S, ym);
  const payouts = payoutsOf(S, ym);
  const trend: CompanyMonth["trend"] = [];
  let k = ym;
  for (let i = 0; i < 8; i++) { const m = calcMonth(S, k); trend.unshift({ ym: k, rev: m?.rev ?? 0, company: m?.gp ?? 0, net: m?.net ?? 0 }); k = prevYm(k); }
  const live = all.filter((c) => !c.isTest && c.status === "active");
  const bodies = BODY_GROUPS.map(([code, label, f]) => ({ code, label, n: live.filter((c) => f(c.rankCode ?? "")).length }));
  const expired = live.filter((c) => c.licenseUntil && c.licenseUntil < today).length;
  const unlicensed = live.filter((c) => !c.licenseUntil).length;
  const chains = (opts.chains ?? []).map((t) => ({ id: t.id, name: t.name, headcount: t.memberIds.length, net: t.memberIds.reduce((a, id) => { const c = all.find((x) => x.id === id); return a + (c ? (lineOf(payouts, c)?.tax.net ?? 0) : 0); }, 0) })).sort((a, b) => b.net - a.net);
  // 制度量得出來的健康度（不是活動量）
  const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
  const referrers = new Set<string>();
  for (const x of S.receipts?.[ym] ?? []) if (!x.void && x.sharers[0]?.coachId) referrers.add(x.sharers[0].coachId);
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
