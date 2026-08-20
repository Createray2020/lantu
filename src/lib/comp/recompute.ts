// 業務制度：全體重算（晉升／真除轉正／維持資格）。
//
// 同一支同時服務兩個入口：
//   - /admin/advisors 的「重算全體」按鈕（人按的）
//   - /api/cron/comp-recompute（排程叫的）
// 分開寫兩份的話，遲早會出現「手動跑跟排程跑結果不一樣」這種最難查的問題。

import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import {
  listAdvisors, listCases, listTrainingRecords, saveMaintenance, setAdvisorRank,
  toAdvisorRows, toCaseRows,
} from "./caseRepo";
import { ensureActiveVersion, loadParams } from "./repo";
import { buildOverview } from "./view";

export type RecomputeResult = {
  evaluated: number;
  promoted: { coachId: string; name: string; from: string | null; to: string; track: string }[];
  settled: { coachId: string; name: string; to: string | null; note?: string }[];
  atRisk: { coachId: string; name: string; execCases: number; trainHours: number }[];
  pendingReview: { coachId: string; name: string; to: string }[];
};

/**
 * @param operatorId 異動紀錄要記錄操作者；排程呼叫時傳 owner 的 id。
 * @param year 以哪一年度計算維持資格。
 */
export async function recomputeAll(
  operatorId: string,
  year: number,
  today = new Date().toISOString().slice(0, 10),
): Promise<RecomputeResult> {
  const version = await ensureActiveVersion();
  const params = await loadParams(version.id);
  const [coachRows, caseRows, trainRows] = await Promise.all([
    listAdvisors(), listCases(), listTrainingRecords(year),
  ]);
  const advisors = toAdvisorRows(coachRows);
  const cases = toCaseRows(caseRows);

  const out: RecomputeResult = {
    evaluated: 0, promoted: [], settled: [], atRisk: [], pendingReview: [],
  };
  const maintRows = [];

  for (const c of coachRows) {
    if (c.status !== "active") continue;
    const name = c.name || c.email || c.id;
    const ov = buildOverview(
      {
        id: c.id, name: c.name, rankCode: c.rankCode, uplineId: c.uplineId, sponsorId: c.sponsorId,
        hireDate: c.hireDate, entryType: c.entryType,
        tenureRankCode: c.tenureRankCode, tenureUntil: c.tenureUntil,
        initialCases: c.initialCases, initialFees: c.initialFees,
        recruitAllowed: c.recruitAllowed, leadAllowed: c.leadAllowed,
      },
      { cases, advisors, params, year, today, training: trainRows.filter((t) => t.coachId === c.id) },
    );
    out.evaluated++;

    maintRows.push({
      coachId: c.id, year,
      execCases: ov.maintenance.execCases,
      trainHours: ov.maintenance.trainHours,
      execPass: ov.maintenance.execPass,
      trainPass: ov.maintenance.trainPass,
      exempt: ov.maintenance.exempt,
      exemptReason: ov.maintenance.exemptReason ?? null,
    });
    if (!ov.maintenance.pass) {
      out.atRisk.push({
        coachId: c.id, name,
        execCases: ov.maintenance.execCases,
        trainHours: ov.maintenance.trainHours,
      });
    }

    // 真除期滿 → 轉正（含認階）。真除優先於一般晉升（§15-4）。
    if (ov.tenure.applicable && ov.tenure.expired) {
      await setAdvisorRank(
        c.id, ov.tenure.settledCode, "tenure", operatorId,
        ov.tenure.note ?? `真除期滿轉正為 ${ov.tenure.settledCode}`,
      );
      await db.update(coaches).set({ tenureRankCode: null, tenureUntil: null })
        .where(eq(coaches.id, c.id));
      out.settled.push({
        coachId: c.id, name, to: ov.tenure.settledCode, note: ov.tenure.note,
      });
      continue;
    }

    if (ov.promotion.canPromote && ov.promotion.nextCode) {
      const track = ov.promotion.track === "B" ? "B" : "A";
      if (params.settings.promoManualReview === true) {
        // 需人工複核時只記錄、不動職級。
        out.pendingReview.push({ coachId: c.id, name, to: ov.promotion.nextCode });
      } else {
        await setAdvisorRank(
          c.id, ov.promotion.nextCode, track === "B" ? "auto_b" : "auto_a", operatorId,
          `${track} 軌達標自動晉升`,
        );
        out.promoted.push({
          coachId: c.id, name, from: c.rankCode, to: ov.promotion.nextCode, track,
        });
      }
    }
  }

  await saveMaintenance(maintRows);
  return out;
}

/** 一句話摘要，給後台按鈕與排程日誌共用。 */
export function summarize(r: RecomputeResult): string {
  const parts = [`已重算 ${r.evaluated} 位`];
  if (r.promoted.length) parts.push(`晉升 ${r.promoted.length} 位`);
  if (r.settled.length) parts.push(`真除轉正 ${r.settled.length} 位`);
  if (r.pendingReview.length) parts.push(`待複核 ${r.pendingReview.length} 位`);
  if (r.atRisk.length) parts.push(`維持資格未達 ${r.atRisk.length} 位`);
  return parts.join("、");
}
