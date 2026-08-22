"use server";

// 學習區後台：課程與單元的維護。

import { revalidatePath } from "next/cache";
import { asc, eq, max } from "drizzle-orm";
import { db } from "@/Shared/db";
import { learnCourses, learnLessons } from "@/Shared/db/schema";
import { ensureCoach, isAdmin } from "@/lib/coach";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("沒有後台權限");
  return me!;
}

function touch() {
  revalidatePath("/admin/learn");
  revalidatePath("/dashboard/learn");
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "操作失敗" };
}

export type CoursePatch = {
  title: string;
  summary: string | null;
  category: string;
  coverUrl: string | null;
  minRankSeq: number | null;
  trainingHours: number | null;
  sortOrder: number;
  published: boolean;
};

export async function createCourseAction(title: string): Promise<ActionResult<string>> {
  try {
    await guard();
    const t = title.trim();
    if (!t) return { ok: false, error: "課程名稱不能空白" };
    const last = await db.select({ m: max(learnCourses.sortOrder) }).from(learnCourses);
    const row = await db
      .insert(learnCourses)
      .values({ title: t, sortOrder: (last[0]?.m ?? 0) + 1 })
      .returning({ id: learnCourses.id });
    touch();
    return { ok: true, data: row[0].id };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCourseAction(id: string, patch: CoursePatch): Promise<ActionResult> {
  try {
    await guard();
    if (!patch.title.trim()) return { ok: false, error: "課程名稱不能空白" };
    await db
      .update(learnCourses)
      .set({
        title: patch.title.trim(),
        summary: patch.summary?.trim() || null,
        category: (patch.category ?? "").trim(),
        coverUrl: patch.coverUrl?.trim() || null,
        minRankSeq: patch.minRankSeq ?? null,
        trainingHours: patch.trainingHours ?? null,
        sortOrder: patch.sortOrder ?? 0,
        published: !!patch.published,
        updatedAt: new Date(),
      })
      .where(eq(learnCourses.id, id));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 刪課程。單元與完成紀錄是 CASCADE 一起消失的 ——
 * 所以這裡刻意要求二次確認的責任放在呼叫端（LearnBoard 會問一次），
 * 且訊息要講清楚會連完課紀錄一起刪掉。
 */
export async function deleteCourseAction(id: string): Promise<ActionResult> {
  try {
    await guard();
    await db.delete(learnCourses).where(eq(learnCourses.id, id));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type LessonPatch = {
  title: string;
  kind: string;
  url: string | null;
  body: string | null;
  durationMin: number | null;
  note: string | null;
};

export async function createLessonAction(courseId: string, title: string): Promise<ActionResult<string>> {
  try {
    await guard();
    const t = title.trim();
    if (!t) return { ok: false, error: "單元名稱不能空白" };
    const last = await db
      .select({ m: max(learnLessons.seq) })
      .from(learnLessons)
      .where(eq(learnLessons.courseId, courseId));
    const row = await db
      .insert(learnLessons)
      .values({ courseId, title: t, seq: (last[0]?.m ?? 0) + 1 })
      .returning({ id: learnLessons.id });
    touch();
    return { ok: true, data: row[0].id };
  } catch (e) {
    return fail(e);
  }
}

export async function saveLessonAction(id: string, patch: LessonPatch): Promise<ActionResult> {
  try {
    await guard();
    if (!patch.title.trim()) return { ok: false, error: "單元名稱不能空白" };
    await db
      .update(learnLessons)
      .set({
        title: patch.title.trim(),
        kind: patch.kind,
        url: patch.url?.trim() || null,
        body: patch.body ?? null,
        durationMin: patch.durationMin ?? null,
        note: patch.note?.trim() || null,
      })
      .where(eq(learnLessons.id, id));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLessonAction(id: string): Promise<ActionResult> {
  try {
    await guard();
    await db.delete(learnLessons).where(eq(learnLessons.id, id));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 單元上下移。整批重排 seq，避免只換兩列時留下重複的序號。 */
export async function moveLessonAction(courseId: string, id: string, dir: -1 | 1): Promise<ActionResult> {
  try {
    await guard();
    const rows = await db
      .select({ id: learnLessons.id })
      .from(learnLessons)
      .where(eq(learnLessons.courseId, courseId))
      .orderBy(asc(learnLessons.seq));
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (let k = 0; k < rows.length; k++) {
      await db.update(learnLessons).set({ seq: k + 1 }).where(eq(learnLessons.id, rows[k].id));
    }
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
