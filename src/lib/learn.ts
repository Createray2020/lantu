// 教練學習區：課程 → 單元 → 完成紀錄的資料層。
//
// 定位是「內部教育訓練的教材庫」，跟 comp_training_*（制度用的訓練時數帳）刻意分開：
// 那邊算的是「時數認列」，這邊管的是「教材與看完沒」。兩者的接點只有一個 ——
// 課程可設 trainingHours，全部單元完成時補寫一筆時數紀錄（見 completeCourseHours）。
//
// 影片與檔案一律存外部連結（YouTube / Vimeo / Google Drive）：專案沒有檔案儲存服務，
// 直接收上傳等於把幾百 KB 的 base64 塞進 Postgres。

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import {
  learnCourses, learnLessons, learnProgress, compTrainingRecords, compRanks, compVersions,
} from "@/Shared/db/schema";
import { BUILTIN_RANK_SEQ, RANK_ORDER, RANK_GROUP_LABEL } from "./license";

export type Course = typeof learnCourses.$inferSelect;
export type Lesson = typeof learnLessons.$inferSelect;

export type LessonKind = "video" | "doc" | "link" | "text";

export const LESSON_KINDS: { value: LessonKind; label: string; hint: string }[] = [
  { value: "video", label: "影片", hint: "YouTube / Vimeo / Google Drive 連結，會直接內嵌播放" },
  { value: "doc", label: "文件", hint: "簡報、PDF、講義的連結" },
  { value: "link", label: "外部連結", hint: "法規、文章、工具網站" },
  { value: "text", label: "文字講義", hint: "直接把內容寫在系統裡，不需要外部連結" },
];

export type CourseWithProgress = Course & {
  lessonCount: number;
  doneCount: number;
  /** 全部單元都完成（且課程至少有一個單元）。 */
  completed: boolean;
};

/**
 * 某位教練的級別在職級表裡的 seq。用來比對課程的 minRankSeq。
 * DB 的職級表查不到就退回內建順序 —— 生效版本可能還沒有「實習教練」那一列，
 * 但實習教練不該因此看不到任何有級別門檻的課。
 */
async function rankSeqOf(rankCode: string | null | undefined): Promise<number | null> {
  if (!rankCode) return null;
  const active = await db
    .select({ id: compVersions.id }).from(compVersions)
    .where(eq(compVersions.status, "active")).limit(1);
  if (!active[0]) return BUILTIN_RANK_SEQ[rankCode] ?? null;
  const r = await db
    .select({ seq: compRanks.seq }).from(compRanks)
    .where(and(
      eq(compRanks.versionId, active[0].id),
      eq(compRanks.moduleCode, ""),
      eq(compRanks.code, rankCode),
    ))
    .limit(1);
  return r[0]?.seq ?? BUILTIN_RANK_SEQ[rankCode] ?? null;
}

/**
 * 教練端的課程清單（只有上架的，且過得了級別門檻）。
 *
 * 「還沒定級」的教練看得到所有沒設門檻的課 —— 把他們一律當成最低級別會讓新人
 * 連「新人必修」以外的東西都看不到，而定級是後台的動作，不該由系統代為假設。
 */
export async function listCoursesFor(coach: { id: string; rankCode?: string | null }): Promise<CourseWithProgress[]> {
  const mySeq = await rankSeqOf(coach.rankCode);
  const [courses, lessons, progress] = await Promise.all([
    db.select().from(learnCourses).where(eq(learnCourses.published, true))
      .orderBy(asc(learnCourses.sortOrder), asc(learnCourses.createdAt)),
    db.select({ id: learnLessons.id, courseId: learnLessons.courseId }).from(learnLessons),
    db.select({ lessonId: learnProgress.lessonId, courseId: learnProgress.courseId })
      .from(learnProgress).where(eq(learnProgress.coachId, coach.id)),
  ]);

  const total = new Map<string, number>();
  for (const l of lessons) total.set(l.courseId, (total.get(l.courseId) ?? 0) + 1);
  const done = new Map<string, number>();
  for (const p of progress) done.set(p.courseId, (done.get(p.courseId) ?? 0) + 1);

  return courses
    .filter((c) => c.minRankSeq == null || (mySeq != null && mySeq >= c.minRankSeq))
    .map((c) => {
      const lessonCount = total.get(c.id) ?? 0;
      const doneCount = Math.min(done.get(c.id) ?? 0, lessonCount);
      return { ...c, lessonCount, doneCount, completed: lessonCount > 0 && doneCount >= lessonCount };
    });
}

export async function getCourse(courseId: string): Promise<Course | null> {
  const r = await db.select().from(learnCourses).where(eq(learnCourses.id, courseId)).limit(1);
  return r[0] ?? null;
}

export async function listLessons(courseId: string): Promise<Lesson[]> {
  return db.select().from(learnLessons).where(eq(learnLessons.courseId, courseId))
    .orderBy(asc(learnLessons.seq));
}

export async function doneLessonIds(coachId: string, courseId: string): Promise<Set<string>> {
  const rows = await db.select({ lessonId: learnProgress.lessonId }).from(learnProgress)
    .where(and(eq(learnProgress.coachId, coachId), eq(learnProgress.courseId, courseId)));
  return new Set(rows.map((r) => r.lessonId));
}

/**
 * 標記／取消標記完成。
 * onConflictDoNothing 搭配唯一鍵：連點兩下「已完成」不會讓完成數變成 2/1。
 */
export async function markLesson(coachId: string, lessonId: string, done: boolean): Promise<void> {
  const l = await db.select({ id: learnLessons.id, courseId: learnLessons.courseId })
    .from(learnLessons).where(eq(learnLessons.id, lessonId)).limit(1);
  const lesson = l[0];
  if (!lesson) throw new Error("找不到這個單元");

  if (!done) {
    await db.delete(learnProgress)
      .where(and(eq(learnProgress.coachId, coachId), eq(learnProgress.lessonId, lessonId)));
    return;
  }
  await db.insert(learnProgress)
    .values({ coachId, lessonId, courseId: lesson.courseId })
    .onConflictDoNothing();

  await completeCourseHours(coachId, lesson.courseId);
}

/**
 * 全部單元完成 → 補一筆訓練時數（若該課程有設 trainingHours）。
 *
 * ⚠️ 去重靠的是 DB 的唯一鍵（comp_training_records_coach_evidence_uidx：coach_id + evidence，
 *    partial index on evidence is not null）＋ onConflictDoNothing，**不是**「先 select 再 insert」。
 *    舊寫法在兩個地方靠不住：
 *      1) 先查再寫中間有空窗，連點兩下「已完成」兩邊都查不到既有列，就寫進兩筆。
 *      2) 原本以為 comp_training_records_session_coach_uidx 會兜底，但它的第一欄是 session_id，
 *         線上課程寫的是 NULL —— Postgres 的 UNIQUE 對 NULL 視為互異，那條一列都擋不住。
 *    時數帳是維持資格的依據，重複寫等於灌水。
 */
async function completeCourseHours(coachId: string, courseId: string): Promise<void> {
  const c = await getCourse(courseId);
  if (!c?.trainingHours) return;

  const lessons = await db.select({ id: learnLessons.id }).from(learnLessons)
    .where(eq(learnLessons.courseId, courseId));
  if (!lessons.length) return;

  const done = await db.select({ lessonId: learnProgress.lessonId }).from(learnProgress)
    .where(and(
      eq(learnProgress.coachId, coachId),
      inArray(learnProgress.lessonId, lessons.map((l) => l.id)),
    ));
  if (done.length < lessons.length) return;

  const year = new Date().getUTCFullYear();
  await db.insert(compTrainingRecords).values({
    coachId,
    year,
    kind: "internal",
    hours: c.trainingHours,
    title: `線上課程：${c.title}`,
    evidence: `learn:${courseId}`,
    status: "approved",
  }).onConflictDoNothing();
}

// ── 後台 ─────────────────────────────────────────────────────

export async function listAllCourses(): Promise<(Course & { lessonCount: number })[]> {
  const [courses, lessons] = await Promise.all([
    db.select().from(learnCourses).orderBy(asc(learnCourses.sortOrder), asc(learnCourses.createdAt)),
    db.select({ courseId: learnLessons.courseId }).from(learnLessons),
  ]);
  const total = new Map<string, number>();
  for (const l of lessons) total.set(l.courseId, (total.get(l.courseId) ?? 0) + 1);
  return courses.map((c) => ({ ...c, lessonCount: total.get(c.id) ?? 0 }));
}

/** 後台的完課總覽：每門課有哪些人完成了幾個單元。 */
export async function courseCompletion(): Promise<Record<string, Record<string, number>>> {
  const rows = await db.select({ coachId: learnProgress.coachId, courseId: learnProgress.courseId })
    .from(learnProgress);
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    out[r.courseId] = out[r.courseId] ?? {};
    out[r.courseId][r.coachId] = (out[r.courseId][r.coachId] ?? 0) + 1;
  }
  return out;
}

/**
 * 影片連結 → 可內嵌的網址。認得 YouTube 與 Vimeo 的幾種常見寫法；
 * 認不出來就回 null，畫面改成顯示「用新分頁開啟」的按鈕，
 * 而不是塞一個永遠轉圈圈的 iframe。
 */
export function embedUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.pathname.startsWith("/embed/")) return `https://www.youtube.com${u.pathname}`;
    if (u.pathname.startsWith("/shorts/")) {
      return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
    }
    return null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") return url;
  if (host === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return null;
  }
  return null;
}

/** 後台「最低可見級別」下拉：DB 的職級表為主，缺的（例如實習教練）用內建順序補齊。 */
export function rankOptions(dbRanks: { code: string; seq: number; moduleCode?: string | null }[]) {
  const bySeq = new Map<number, string>();
  for (const r of dbRanks) {
    if (r.moduleCode) continue; // 只看預設表
    bySeq.set(r.seq, r.code);
  }
  for (const code of RANK_ORDER) {
    const seq = BUILTIN_RANK_SEQ[code];
    if (![...bySeq.values()].includes(code)) bySeq.set(seq, code);
  }
  return [...bySeq.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seq, code]) => ({ seq, label: RANK_GROUP_LABEL[code] ?? code }));
}
