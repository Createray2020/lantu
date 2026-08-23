// 業務制度：晉升、真除、維持資格的判定（純函式）。
//
// 貫穿全檔的規則：**門檻留空＝該項不檢查**。
// 例如 B 軌某階的團隊門檻沒填，就是那一階不開放 B 軌；
// 訓練時數沒填，維持資格就只看執案門檻。未設定不會變成「門檻為 0 所以全員達標」，
// 也不會變成「沒設定所以全員擋下」——前者浮報、後者擾民，兩種都不能要。

import type { AdvisorRow } from "./chain";
import { seqOf } from "./chain";
import type { AdvisorStats } from "./stats";
import type { CompParams, ThresholdRow } from "./types";

// unit：畫面要知道這個門檻是「錢」還是「件／人」，才能決定要不要補千分位。
// 沒有它的時候，UI 對個案數也套了 toLocaleString，而摘要格連顧問費都沒補。
export type Gap = { label: string; need: number; have: number; met: boolean; unit: "money" | "count" };

export type TrackEval = {
  threshold: ThresholdRow;
  gaps: Gap[];
  met: boolean;
};

export type PromotionEval = {
  currentCode: string | null;
  nextCode: string | null;
  trackA: TrackEval | null;
  trackB: TrackEval | null;
  canPromote: boolean;
  track: "A" | "B" | null;
  /** 不適用的原因（真除中、無下一階、職級未設定…） */
  blocked?: string;
};

function check(
  need: number | null | undefined,
  have: number,
  label: string,
  unit: "money" | "count" = "count",
): Gap | null {
  if (need === null || need === undefined) return null; // 留空＝不檢查
  return { label, need, have, met: have >= need, unit };
}

/** 雙指標制：有設定的項目都要達標；關閉時任一達標即可。 */
function metOf(gaps: Gap[], dual: boolean): boolean {
  if (!gaps.length) return false; // 一條門檻都沒設 → 該軌不啟用，不算達標
  return dual ? gaps.every((g) => g.met) : gaps.some((g) => g.met);
}

export function evalPromotion(
  advisor: AdvisorRow & { tenureRankCode?: string | null; mentored?: number },
  stats: AdvisorStats,
  params: CompParams,
  opts?: { mentoredCount?: (rankCode: string | null | undefined) => number },
): PromotionEval {
  const s = params.settings;
  const cur = advisor.rankCode ?? null;
  const base: PromotionEval = {
    currentCode: cur, nextCode: null, trackA: null, trackB: null,
    canPromote: false, track: null,
  };
  if (!cur) return { ...base, blocked: "尚未設定職級" };
  // 真除期間走真除制度，不併行一般晉升（§15-4：轉正後才回歸一般晉升）。
  if (advisor.tenureRankCode) return { ...base, blocked: "真除期間，依真除制度辦理" };

  const dual = s.promoDualIndex !== false;
  const enabled = (t: ThresholdRow) => t.enabled !== false;

  const a = params.thresholds.find(
    (t) => t.kind === "promotion_a" && t.fromCode === cur && enabled(t),
  );
  const b = params.thresholds.find(
    (t) => t.kind === "promotion_b" && t.fromCode === cur && enabled(t),
  );

  const evalTrack = (t: ThresholdRow | undefined, withTeam: boolean): TrackEval | null => {
    if (!t) return null;
    const gaps: Gap[] = [];
    const c = check(t.cases, stats.personalCases, "累計個案數");
    if (c) gaps.push(c);
    const f = check(t.fees, stats.personalFees, "累計顧問費", "money");
    if (f) gaps.push(f);
    if (withTeam) {
      const tc = check(t.teamCases, stats.teamCases, "團隊輔導業績") // ⚠️ 名字叫「業績」，值其實是 stats.teamCases＝團隊件數，不是金額;
      if (tc) gaps.push(tc);
      if (t.mentorCount !== null && t.mentorCount !== undefined) {
        const have = opts?.mentoredCount?.(t.mentorRankCode) ?? advisor.mentored ?? 0;
        gaps.push({
          label: `育成 ${t.mentorRankCode ?? ""} 以上`,
          need: t.mentorCount, have, met: have >= t.mentorCount, unit: "count",
        });
      }
    }
    return { threshold: t, gaps, met: metOf(gaps, dual) };
  };

  const trackA = evalTrack(a, false);
  // B 軌另有起始職級門檻（§13-5：認證顧問階段不適用）。
  const bMin = s.trackBMinRankCode ? seqOf(params, s.trackBMinRankCode) : -1;
  const bAllowed = bMin < 0 || seqOf(params, cur) >= bMin;
  const trackB = bAllowed ? evalTrack(b, true) : null;

  const nextCode = trackA?.threshold.toCode ?? trackB?.threshold.toCode ?? null;
  const canA = !!trackA?.met;
  const canB = !!trackB?.met;
  return {
    currentCode: cur,
    nextCode,
    trackA,
    trackB,
    canPromote: canA || canB,
    track: canA ? "A" : canB ? "B" : null,
  };
}

export type TenureEval = {
  applicable: boolean;
  approvedCode: string | null;
  until: string | null;
  expired: boolean;
  met: boolean;
  /** 期滿時應轉正的職級（未達核定職級時的認階結果） */
  settledCode: string | null;
  gaps: Gap[];
  note?: string;
};

/**
 * 真除判定（§15）。
 * 期間內達成核定職級門檻 → 轉正；未達成 → 依實際完成度往下認階，全未達則落到保底職級。
 */
export function evalTenure(
  advisor: AdvisorRow & { tenureRankCode?: string | null; tenureUntil?: string | null },
  periodStats: { cases: number; fees: number; mentored?: number },
  params: CompParams,
  today: string,
): TenureEval {
  const s = params.settings;
  const code = advisor.tenureRankCode ?? null;
  if (!code) {
    return {
      applicable: false, approvedCode: null, until: null, expired: false,
      met: false, settledCode: null, gaps: [],
    };
  }
  const dual = s.promoDualIndex !== false;
  const rows = params.thresholds
    .filter((t) => t.kind === "tenure" && t.enabled !== false)
    .sort((x, y) => seqOf(params, y.toCode) - seqOf(params, x.toCode)); // 由高到低

  const evalRow = (t: ThresholdRow): { gaps: Gap[]; met: boolean } => {
    const gaps: Gap[] = [];
    const c = check(t.cases, periodStats.cases, "真除期間個案數");
    if (c) gaps.push(c);
    const f = check(t.fees, periodStats.fees, "真除期間顧問費", "money");
    if (f) gaps.push(f);
    if (t.mentorCount !== null && t.mentorCount !== undefined) {
      const have = periodStats.mentored ?? 0;
      gaps.push({
        label: t.extraNote || "育成條件", need: t.mentorCount, have, met: have >= t.mentorCount, unit: "count",
      });
    }
    return { gaps, met: metOf(gaps, dual) };
  };

  const own = rows.find((t) => t.toCode === code);
  const ownEval = own ? evalRow(own) : { gaps: [], met: false };
  const expired = !!advisor.tenureUntil && today > advisor.tenureUntil;

  let settledCode: string | null = code;
  let note: string | undefined;
  if (!ownEval.met) {
    if (s.tenureStepDown === false) {
      settledCode = s.tenureFloorRankCode ?? null;
      note = "未達核定職級門檻，且未啟用認階轉正";
    } else {
      const lower = rows.find(
        (t) => seqOf(params, t.toCode) < seqOf(params, code) && evalRow(t).met,
      );
      settledCode = lower?.toCode ?? s.tenureFloorRankCode ?? null;
      note = lower
        ? `未達 ${code} 門檻，依實際完成度認階為 ${lower.toCode}（§15-4）`
        : `未達最低真除門檻，以保底職級 ${settledCode ?? "—"} 聘任（§15-4）`;
    }
  }

  return {
    applicable: true,
    approvedCode: code,
    until: advisor.tenureUntil ?? null,
    expired,
    met: ownEval.met,
    settledCode,
    gaps: ownEval.gaps,
    note,
  };
}

export type MaintenanceEval = {
  year: number;
  exempt: boolean;
  exemptReason?: string;
  execCases: number;
  execPass: boolean;
  trainHours: number;
  trainPass: boolean;
  pass: boolean;
  /** 未達時的處理（暫停項目） */
  penalties: string[];
};

/**
 * 維持資格判定（§16–§19）。
 * 兩個門檻任一未設定就不檢查該項；到職未滿一完整年度者首年豁免。
 */
export function evalMaintenance(
  advisor: AdvisorRow & { hireDate?: string | null },
  input: { year: number; execCases: number; execFeesOk?: boolean; trainHours: number; manualExempt?: string | null },
  params: CompParams,
): MaintenanceEval {
  const s = params.settings;
  const { year, execCases, trainHours } = input;

  let exempt = false;
  let exemptReason: string | undefined;
  if (input.manualExempt) {
    exempt = true;
    exemptReason = input.manualExempt;
  } else if (s.exemptFirstYear !== false && advisor.hireDate) {
    const hireYear = Number(advisor.hireDate.slice(0, 4));
    if (hireYear === year) {
      exempt = true;
      exemptReason = "到職未滿一完整年度，首年度豁免（§19-2）";
    }
  }

  const needCases = s.maintainCases;
  const needHours = s.trainHours;
  const execPass = needCases === undefined ? true : execCases >= needCases;
  const trainPass = needHours === undefined ? true : trainHours >= needHours;
  const pass = exempt || (execPass && trainPass);

  const penalties: string[] = [];
  if (!pass) {
    if (s.penaltySuspendRecruit) penalties.push("暫停招募直轄顧問資格");
    if (s.penaltySuspendLead) penalties.push("暫停公司派案受派資格");
  }

  return { year, exempt, exemptReason, execCases, execPass, trainHours, trainPass, pass, penalties };
}
