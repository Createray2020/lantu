import { redirect } from "next/navigation";
import { ensureCoach, isAdmin, listCoaches } from "@/lib/coach";
import { listAllCourses, listLessons, courseCompletion, rankOptions as buildRankOptions } from "@/lib/learn";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import LearnBoard, { type CourseRow } from "./LearnBoard";

export const dynamic = "force-dynamic";

export default async function AdminLearnPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const version = await ensureActiveVersion();
  const [courses, params, coaches, completion] = await Promise.all([
    listAllCourses(),
    loadParams(version.id),
    listCoaches(),
    courseCompletion()
  ]);

  const nameById = new Map(coaches.map((c) => [c.id, c.name || c.email || c.id]));
  const lessonsByCourse = await Promise.all(courses.map((c) => listLessons(c.id)));

  const rows: CourseRow[] = courses.map((c, i) => {
    const lessons = lessonsByCourse[i];
    const per = completion[c.id] ?? {};
    const completedBy: string[] = [];
    const inProgress: { name: string; done: number }[] = [];
    for (const [coachId, done] of Object.entries(per)) {
      const name = nameById.get(coachId) ?? coachId;
      if (lessons.length > 0 && done >= lessons.length) completedBy.push(name);
      else inProgress.push({ name, done });
    }
    return {
      id: c.id,
      title: c.title,
      summary: c.summary,
      category: c.category,
      coverUrl: c.coverUrl,
      minRankSeq: c.minRankSeq,
      trainingHours: c.trainingHours,
      sortOrder: c.sortOrder,
      published: c.published,
      lessons: lessons.map((l) => ({
        id: l.id, seq: l.seq, title: l.title, kind: l.kind,
        url: l.url, body: l.body, durationMin: l.durationMin, note: l.note,
      })),
      completedBy: completedBy.sort(),
      inProgress: inProgress.sort((a, b) => b.done - a.done),
    };
  });

  // 級別下拉只用預設表（模塊自訂表是拿來調分潤率的，不該長出新級別），
  // 並用內建順序補上生效版本還沒有的級別（例如實習教練）。
  const rankOptions = buildRankOptions(params.ranks);

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="學習區管理" />
      <AdminNav />

      <section className="max-w-5xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">學習區 · 課程與教材</h1>
          <p className="text-sm text-tx2 mt-1">
            影片與文件一律放<b className="text-brand2">外部連結</b>（YouTube / Vimeo / Google 雲端硬碟）——
            系統本身沒有檔案儲存服務。YouTube、Vimeo 與雲端硬碟的檔案連結會直接內嵌播放，
            其他連結則顯示成「用新分頁開啟」。
          </p>
        </div>
        <LearnBoard courses={rows} rankOptions={rankOptions} />
      </section>
    </main>
  );
}
