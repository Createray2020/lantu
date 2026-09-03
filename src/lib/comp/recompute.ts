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
  const advisorById = new Map(advisors.map((a) => [a.id, a]));

  /**
   * ⚠️ 職級改了就要同步回記憶體裡的 advisors。
   *
   * advisors 是迴圈**開始前**算好的一份快照，而 buildOverview() 每一輪都拿它去解輔導鏈、
   * 判斷推薦人夠不夠格帶人。少了這一句，同一次執行中已經晉升的人，對後面每一位的計算
   * 而言都還停在舊職級 —— 結果會隨著 coaches.created_at 的排序而變，
   * 而且要再跑第二次才收斂（「手動跑跟排程跑結果不一樣」正是從這裡長出來的）。
   */
  const syncRank = (coachId: string, toCode: string | null) => {
    const a = advisorById.get(coachId);
    if (a) a.rankCode = toCode;
  };

  const out: RecomputeResult = {
    evaluated: 0, promoted: [], settled: [], atRisk: [], pendingReview: [],
  };

  /**
   * ⚠️ 維持資格快照**分批**寫，不是整段跑完寫一次。
   *
   * 這支同時掛在 /api/cron/comp-recompute 底下，而那條路由的 maxDuration 是 60 秒。
   * 舊版把全部人的快照存在記憶體裡、迴圈結束才 saveMaintenance() 一次 ——
   * 逾時就是「一個人的快照都沒寫進去」，而職級卻已經在迴圈裡改掉了一半。
   * 分批之後，逾時最多只掉最後那不到 20 位，而且重跑一次就補齊
   *（saveMaintenance 是 onConflictDoUpdate，重跑不會疊列）。
   */
  const MAINT_CHUNK = 20;
  let maintRows: Parameters<typeof saveMaintenance>[0] = [];
  const flushMaint = async () => {
    if (!maintRows.length) return;
    await saveMaintenance(maintRows);
    maintRows = [];
  };

  for (const c of coachRows) {
    if (c.status !== "active") continue;
    const name = c.name || c.email || c.id;
    const ov = buildOverview(
      {
        id: c.id, name: c.name, rankCode: c.rankCode, uplineId: c.uplineId,
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
    if (maintRows.length >= MAINT_CHUNK) await flushMaint();
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
      syncRank(c.id, ov.tenure.settledCode);
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
        syncRank(c.id, ov.promotion.nextCode);
      }
    }
  }

  // 最後一批無條件送出（就算是空的）：這一支跑完一定要有一次「我算過了」的寫入嘗試，
  // 沒有任何 active 顧問時也一樣 —— saveMaintenance() 自己會對空陣列早退。
  await saveMaintenance(maintRows);
  maintRows = [];
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
