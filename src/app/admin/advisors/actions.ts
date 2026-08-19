"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  listAdvisors, listCases, listTrainingRecords, saveMaintenance, setAdvisorRank,
  toAdvisorRows, toCaseRows,
} from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { buildOverview } from "@/lib/comp/view";

export type ActionResult = { ok: true; note?: string } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "coach-not-found": "找不到顧問",
  "need-reason": "手動調整職級要填異動原因",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

function touch() {
  revalidatePath("/admin/advisors");
  revalidatePath("/dashboard/my-business");
}

/** 顧問的制度欄位（職級以外）。職級一律走 setAdvisorRank 以留下異動紀錄。 */
export async function saveAdvisorAction(
  id: string,
  patch: {
    entryType?: string | null;
    hireDate?: string | null;
    sponsorId?: string | null;
    tenureRankCode?: string | null;
    tenureUntil?: string | null;
    initialCases?: number | null;
    initialFees?: number | null;
    recruitAllowed?: boolean | null;
    leadAllowed?: boolean | null;
  },
): Promise<ActionResult> {
  try {
    await guard();
    await db.update(coaches).set({
      entryType: patch.entryType ?? null,
      hireDate: patch.hireDate || null,
      sponsorId: patch.sponsorId || null,
      tenureRankCode: patch.tenureRankCode || null,
      tenureUntil: patch.tenureUntil || null,
      initialCases: patch.initialCases ?? 0,
      initialFees: patch.initialFees ?? 0,
      recruitAllowed: patch.recruitAllowed ?? null,
      leadAllowed: patch.leadAllowed ?? null,
    }).where(eq(coaches.id, id));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setRankAction(
  id: string,
  rankCode: string | null,
  note: string,
): Promise<ActionResult> {
  try {
    const me = await guard();
    if (!note.trim()) throw new Error("need-reason");
    await setAdvisorRank(id, rankCode || null, "manual", me.id, note.trim());
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 依制度重算全體顧問的晉升／真除／維持資格，並套用達標者的職級。
 * 這支是「排程要做的事」的手動入口——先讓人按得到、看得到結果，再談自動排程。
 */
export async function recomputeAllAction(year: number): Promise<ActionResult> {
  try {
    const me = await guard();
    const version = await ensureActiveVersion();
    const params = await loadParams(version.id);
    const [coachRows, caseRows, trainRows] = await Promise.all([
      listAdvisors(), listCases(), listTrainingRecords(year),
    ]);
    const advisors = toAdvisorRows(coachRows);
    const cases = toCaseRows(caseRows);
    const today = new Date().toISOString().slice(0, 10);

    const maintRows = [];
    let promoted = 0;
    let settled = 0;

    for (const c of coachRows) {
      if (c.status !== "active") continue;
      const ov = buildOverview(
        {
          id: c.id, name: c.name, rankCode: c.rankCode, uplineId: c.uplineId, sponsorId: c.sponsorId,
          hireDate: c.hireDate, entryType: c.entryType,
          tenureRankCode: c.tenureRankCode, tenureUntil: c.tenureUntil,
          initialCases: c.initialCases, initialFees: c.initialFees,
          recruitAllowed: c.recruitAllowed, leadAllowed: c.leadAllowed,
        },
        {
          cases, advisors, params, year, today,
          training: trainRows.filter((t) => t.coachId === c.id),
        },
      );

      maintRows.push({
        coachId: c.id, year,
        execCases: ov.maintenance.execCases,
        trainHours: ov.maintenance.trainHours,
        execPass: ov.maintenance.execPass,
        trainPass: ov.maintenance.trainPass,
        exempt: ov.maintenance.exempt,
        exemptReason: ov.maintenance.exemptReason ?? null,
      });

      // 真除期滿 → 轉正（含認階）。真除優先於一般晉升。
      if (ov.tenure.applicable && ov.tenure.expired) {
        await setAdvisorRank(
          c.id, ov.tenure.settledCode, "tenure", me.id,
          ov.tenure.note ?? `真除期滿轉正為 ${ov.tenure.settledCode}`,
        );
        await db.update(coaches).set({ tenureRankCode: null, tenureUntil: null })
          .where(eq(coaches.id, c.id));
        settled++;
        continue;
      }

      if (ov.promotion.canPromote && ov.promotion.nextCode && params.settings.promoManualReview !== true) {
        await setAdvisorRank(
          c.id, ov.promotion.nextCode,
          ov.promotion.track === "B" ? "auto_b" : "auto_a", me.id,
          `${ov.promotion.track} 軌達標自動晉升`,
        );
        promoted++;
      }
    }

    await saveMaintenance(maintRows);
    touch();
    return {
      ok: true,
      note: `已重算 ${maintRows.length} 位；晉升 ${promoted} 位、真除轉正 ${settled} 位`,
    };
  } catch (e) {
    return fail(e);
  }
}
