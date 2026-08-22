import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin, listCoaches } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { listAllCourses, listLessons, courseCompletion, rankOptions as buildRankOptions } from "@/lib/learn";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import AdminNav from "../AdminNav";
import LearnBoard, { type CourseRow } from "./LearnBoard";

export const dynamic = "force-dynamic";

export default async function AdminLearnPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const version = await ensureActiveVersion();
  const [courses, params, coaches, completion, brand] = await Promise.all([
    listAllCourses(),
    loadParams(version.id),
    listCoaches(),
    courseCompletion(),
    getBrand(),
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
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
          )}
          <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        </Link>
        <span className="text-[#a9bccf] text-xs">學習區管理</span>
        <div className="flex-1" />
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-5xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">學習區 · 課程與教材</h1>
          <p className="text-sm text-[#a9bccf] mt-1">
            影片與文件一律放<b className="text-[#e0bd8b]">外部連結</b>（YouTube / Vimeo / Google 雲端硬碟）——
            系統本身沒有檔案儲存服務。YouTube、Vimeo 與雲端硬碟的檔案連結會直接內嵌播放，
            其他連結則顯示成「用新分頁開啟」。
          </p>
        </div>
        <LearnBoard courses={rows} rankOptions={rankOptions} />
      </section>
    </main>
  );
}
