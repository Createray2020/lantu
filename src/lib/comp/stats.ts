// 業務制度：指標統計（純函式）。
//
// 晉升與維持資格全部建立在這裡的定義上，所以每一條計數規則都要能對回辦法：
// - 個案（§20）：同一自然人同年度所有服務合併為「一個個案」，顧問費則累加。
//   → 資料表仍是一筆收費一列，合併只發生在計數時（否則追加收費會找不到原始紀錄）。
// - 計入條件（§10-3、§21-1）：問卷回收才算結案、顧問費以實收為準、退費案不計。
// - 團隊輔導業績（§13-1）：沿執案者的有效輔導鏈逐層向上，鏈上每一層各自計入。

import { resolveChain, type AdvisorRow } from "./chain";
import type { CompParams, CompSettings, ModuleRow } from "./types";

export type CaseRow = {
  id: string;
  executorId: string;
  /** 服務模塊代號；空＝沒指定模塊，一律計入 */
  moduleCode?: string | null;
  promoterId?: string | null;
  clientId?: string | null;
  clientName: string;
  fee: number;
  refundAmount?: number;
  caseYear: number;
  paidAt?: string | null;
  surveyAt?: string | null;
  status?: string | null;
};

function moduleOf(c: CaseRow, modules?: ModuleRow[]): ModuleRow | undefined {
  if (!c.moduleCode || !modules?.length) return undefined;
  return modules.find((m) => m.code === c.moduleCode);
}

/**
 * 這筆案件能不能計入晉升指標。
 * 除了結案要件，還要看服務模塊的「計入晉升指標」開關——
 * 辦法 §2 說培訓費、講座等不適用本制度，那類模塊把開關關掉就不會抬高晉升進度。
 */
export function isCounted(c: CaseRow, s: CompSettings, modules?: ModuleRow[]): boolean {
  if (c.status === "refunded" || c.status === "void") return false;
  if (s.promoRequireSurvey !== false && !c.surveyAt) return false;
  if (s.promoInvoiceBased !== false && !c.paidAt) return false;
  const m = moduleOf(c, modules);
  if (m && m.countPromotion === false) return false;
  return true;
}

/** 這筆案件算不算維持資格的執案門檻（模塊可單獨關閉）。 */
export function isCountedForMaintenance(c: CaseRow, s: CompSettings, modules?: ModuleRow[]): boolean {
  if (c.status === "refunded" || c.status === "void") return false;
  if (s.promoRequireSurvey !== false && !c.surveyAt) return false;
  if (s.promoInvoiceBased !== false && !c.paidAt) return false;
  const m = moduleOf(c, modules);
  if (m && m.countMaintenance === false) return false;
  return true;
}

/** 實收金額（部分退費按實收計算，§23-2）。 */
export function netFee(c: CaseRow, s: CompSettings): number {
  const refund = s.refundProrate === false ? 0 : (c.refundAmount ?? 0);
  return Math.max(0, (c.fee ?? 0) - refund);
}

/** 個案識別鍵：同一自然人＋同一年度＝一個個案（§20-1、§20-2）。 */
export function caseKey(c: CaseRow, s: CompSettings): string {
  const who = c.clientId ? `id:${c.clientId}` : `name:${c.clientName.trim()}`;
  // 關閉「同年度合併」時，每筆收費各自算一個個案。
  return s.caseMergeSameYear === false ? `row:${c.id}` : `${who}#${c.caseYear}`;
}

export type PersonalStats = { cases: number; fees: number; caseKeys: string[] };

/**
 * 個人指標：以「本人執案」的案件計算（A 軌是個人執案路徑）。
 * 推廣但未執案的案件由推廣端分潤獎勵，不計入個人晉升指標（§13-3 的同一精神）。
 */
export function personalStats(
  cases: CaseRow[],
  coachId: string,
  params: CompParams,
  opts?: { year?: number; from?: string; to?: string; forMaintenance?: boolean },
): PersonalStats {
  const s = params.settings;
  const counted = opts?.forMaintenance ? isCountedForMaintenance : isCounted;
  const keys = new Set<string>();
  let fees = 0;
  for (const c of cases) {
    if (c.executorId !== coachId) continue;
    if (!counted(c, s, params.modules)) continue;
    if (opts?.year !== undefined && c.caseYear !== opts.year) continue;
    if (opts?.from && (c.paidAt ?? "") < opts.from) continue;
    if (opts?.to && (c.paidAt ?? "") > opts.to) continue;
    keys.add(caseKey(c, s));
    fees += netFee(c, s);
  }
  return { cases: keys.size, fees, caseKeys: [...keys] };
}

/** 團隊輔導業績：直轄團隊完成的個案數（沿鏈逐層計入，本人在鏈上就算）。 */
export function teamStats(
  cases: CaseRow[],
  coachId: string,
  advisors: AdvisorRow[],
  params: CompParams,
): { cases: number } {
  const s = params.settings;
  // 每位執案者的鏈只解析一次（案件數會遠多於人數）。
  const chainCache = new Map<string, string[]>();
  const chainOf = (execId: string) => {
    let ids = chainCache.get(execId);
    if (!ids) {
      const r = resolveChain(execId, advisors, params);
      ids = r ? r.chain.map((n) => n.id) : [];
      if (s.teamCreditEachLevel === false) ids = ids.slice(0, 1);
      chainCache.set(execId, ids);
    }
    return ids;
  };

  const keys = new Set<string>();
  for (const c of cases) {
    if (!isCounted(c, s, params.modules)) continue;
    if (c.executorId === coachId) continue; // 團隊業績不含自己執的案
    if (!chainOf(c.executorId).includes(coachId)) continue;
    keys.add(caseKey(c, s));
  }
  return { cases: keys.size };
}

/** 育成人數：直轄顧問中職級達 rankCode（含）以上者。 */
export function mentoredCount(
  coachId: string,
  advisors: AdvisorRow[],
  params: CompParams,
  rankCode?: string | null,
): number {
  if (!rankCode) return 0;
  const need = params.ranks.find((r) => r.code === rankCode)?.seq ?? Infinity;
  return advisors.filter((a) => {
    if (a.uplineId !== coachId) return false;
    const seq = params.ranks.find((r) => r.code === a.rankCode)?.seq;
    return seq !== undefined && seq >= need;
  }).length;
}

export type AdvisorStats = {
  personalCases: number;
  personalFees: number;
  teamCases: number;
};

/** 顧問的完整累計指標（含同業招募帶入的期初實績）。 */
export function advisorStats(
  advisor: AdvisorRow & { initialCases?: number; initialFees?: number },
  cases: CaseRow[],
  advisors: AdvisorRow[],
  params: CompParams,
): AdvisorStats {
  const p = personalStats(cases, advisor.id, params);
  const t = teamStats(cases, advisor.id, advisors, params);
  return {
    personalCases: p.cases + (advisor.initialCases ?? 0),
    personalFees: p.fees + (advisor.initialFees ?? 0),
    teamCases: t.cases,
  };
}

/** 訓練時數認列（§16-2）：內部場次＋講師加倍＋外部課程（受年度上限）。 */
export type TrainingRecordRow = {
  kind: string;          // internal / speaker / external
  hours: number;
  status?: string | null;
  year: number;
};

export function trainingHours(
  records: TrainingRecordRow[],
  params: CompParams,
  year: number,
): { internal: number; speaker: number; external: number; externalRaw: number; total: number } {
  const s = params.settings;
  let internal = 0, speaker = 0, externalRaw = 0;
  for (const r of records) {
    if (r.year !== year) continue;
    if (r.status && r.status !== "approved") continue;
    if (r.kind === "speaker") speaker += r.hours;
    else if (r.kind === "external") externalRaw += r.hours;
    else internal += r.hours;
  }
  // 外部課程年度上限：未設定＝不設限（與「留空＝規則不啟用」一致）。
  const cap = s.trainExternalCap;
  const external = cap === undefined ? externalRaw : Math.min(externalRaw, cap);
  return { internal, speaker, external, externalRaw, total: internal + speaker + external };
}
