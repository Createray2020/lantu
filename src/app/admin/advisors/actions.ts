"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { setAdvisorRank } from "@/lib/comp/caseRepo";
import { recomputeAll, summarize } from "@/lib/comp/recompute";

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
 * 依制度重算全體顧問的晉升／真除／維持資格。
 * 實作在 lib/comp/recompute.ts —— 與排程走同一支，
 * 分成兩份的話遲早會出現「手動跑跟排程跑結果不一樣」這種最難查的問題。
 */
export async function recomputeAllAction(year: number): Promise<ActionResult> {
  try {
    const me = await guard();
    const r = await recomputeAll(me.id, year);
    touch();
    return { ok: true, note: summarize(r) };
  } catch (e) {
    return fail(e);
  }
}
