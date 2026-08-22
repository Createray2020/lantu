import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ensureCoach } from "@/lib/coach";
import { getCourse, listLessons, doneLessonIds, listCoursesFor, embedUrl } from "@/lib/learn";
import DashboardHeader from "../../DashboardHeader";
import { headerProps } from "../../headerProps";
import ReadOnlyBanner from "../../ReadOnlyBanner";
import CourseView, { type LessonView } from "./CourseView";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard");
  if (coach.status !== "active") redirect("/dashboard");

  const course = await getCourse(courseId);
  if (!course) notFound();

  // 級別門檻與上下架要在伺服器端再驗一次：直接打網址進來的人也得過同一道門，
  // 只把課從列表濾掉是「藏起來」不是「擋住」。
  const visible = await listCoursesFor(coach);
  if (!visible.some((c) => c.id === courseId)) notFound();

  const [lessons, done] = await Promise.all([listLessons(courseId), doneLessonIds(coach.id, courseId)]);
  const hp = await headerProps(coach);

  const views: LessonView[] = lessons.map((l) => ({
    id: l.id,
    seq: l.seq,
    title: l.title,
    kind: l.kind,
    url: l.url,
    body: l.body,
    durationMin: l.durationMin,
    note: l.note,
    embed: l.kind === "video" ? embedUrl(l.url) : null,
    done: done.has(l.id),
  }));

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/dashboard/learn" className="text-sm text-[#a9bccf] hover:text-white">
          ← 回學習區
        </Link>
        <h1 className="font-serif text-2xl mt-2">{course.title}</h1>
        {course.summary && <p className="text-sm text-[#a9bccf] mt-1 mb-1">{course.summary}</p>}
        {course.trainingHours != null && (
          <p className="text-xs text-[#6f869c] mb-4">
            全部單元完成後自動認列 {course.trainingHours} 小時訓練時數。
          </p>
        )}
        <div className="mt-4">
          <CourseView courseId={courseId} lessons={views} />
        </div>
      </div>
    </div>
  );
}
