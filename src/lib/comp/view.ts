// 業務制度：顧問總覽的組裝層。
// /admin/advisors、/dashboard/my-business、維持資格重算三處共用同一份計算，
// 避免「後台看到的進度」和「顧問自己看到的進度」因為各算各的而對不起來。

import { directReports, type AdvisorRow } from "./chain";
import {
  advisorStats, mentoredCount, personalStats, trainingHours,
  type CaseRow, type TrainingRecordRow,
} from "./stats";
import { evalMaintenance, evalPromotion, evalTenure, type MaintenanceEval, type PromotionEval, type TenureEval } from "./promotion";
import type { CompParams } from "./types";

export type AdvisorFull = AdvisorRow & {
  hireDate?: string | null;
  entryType?: string | null;
  tenureRankCode?: string | null;
  tenureUntil?: string | null;
  initialCases?: number;
  initialFees?: number;
  recruitAllowed?: boolean | null;
  leadAllowed?: boolean | null;
};

export type AdvisorOverview = {
  advisor: AdvisorFull;
  stats: { personalCases: number; personalFees: number; teamCases: number };
  promotion: PromotionEval;
  tenure: TenureEval;
  maintenance: MaintenanceEval;
  directs: AdvisorRow[];
  /** 依維持資格推導的資格狀態（管理員可手動覆寫） */
  canRecruit: boolean;
  canReceiveLeads: boolean;
};

export function buildOverview(
  advisor: AdvisorFull,
  ctx: {
    cases: CaseRow[];
    advisors: AdvisorRow[];
    training: TrainingRecordRow[];
    params: CompParams;
    year: number;
    today: string;
    manualExempt?: string | null;
  },
): AdvisorOverview {
  const { cases, advisors, training, params, year, today } = ctx;
  const stats = advisorStats(advisor, cases, advisors, params);

  const promotion = evalPromotion(advisor, stats, params, {
    mentoredCount: (code) => mentoredCount(advisor.id, advisors, params, code),
  });

  // 真除期間的業績＝到職日之後的個人指標（真除門檻看的是這段期間，不是終身累計）。
  const periodCases = advisor.hireDate
    ? personalStats(cases, advisor.id, params, { from: advisor.hireDate })
    : { cases: 0, fees: 0, caseKeys: [] };
  const tenure = evalTenure(
    advisor,
    {
      cases: periodCases.cases,
      fees: periodCases.fees,
      // 首席真除的附加條件是「育成或帶領至少 1 位直轄顧問完成首案」。
      mentored: directReports(advisor.id, advisors).filter((d) =>
        cases.some((c) => c.executorId === d.id),
      ).length,
    },
    params,
    today,
  );

  const yearStats = personalStats(cases, advisor.id, params, { year });
  // training 由呼叫端過濾成「這位顧問的紀錄」再傳進來。
  const hours = trainingHours(training, params, year);
  const maintenance = evalMaintenance(
    advisor,
    { year, execCases: yearStats.cases, trainHours: hours.total, manualExempt: ctx.manualExempt },
    params,
  );

  const autoRecruit = maintenance.pass || !params.settings.penaltySuspendRecruit;
  const autoLead = maintenance.pass || !params.settings.penaltySuspendLead;

  return {
    advisor,
    stats,
    promotion,
    tenure,
    maintenance,
    directs: directReports(advisor.id, advisors),
    canRecruit: advisor.recruitAllowed ?? autoRecruit,
    canReceiveLeads: advisor.leadAllowed ?? autoLead,
  };
}

/** 進度百分比（0–100），需求未設定時回 null（畫面顯示「未設定」而不是滿格）。 */
export function pctOf(have: number, need: number | null | undefined): number | null {
  if (need === null || need === undefined) return null;
  if (need <= 0) return 100;
  return Math.min(100, Math.round((have / need) * 100));
}

export function fmtMoney(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("zh-TW");
}
