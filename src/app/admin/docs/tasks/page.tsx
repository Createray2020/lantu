import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCoach, isAdmin, listCoaches } from "@/lib/coach";
import { listTemplates, latestByKey, listDocTasks } from "@/lib/docsStore";
import AdminHeader from "../../AdminHeader";
import AdminNav from "../../AdminNav";
import TasksBoard, { type TaskView, type TemplateOpt, type CoachOpt } from "./TasksBoard";

export const dynamic = "force-dynamic";

// 補簽任務（2026/10/28）：新增或修訂文件時，指定既有教練補簽；不自動把已完成舊文件的人改成未完成、也不停權。
export default async function DocTasksPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const [all, coaches, tasks] = await Promise.all([listTemplates(), listCoaches(), listDocTasks()]);
  const templates: TemplateOpt[] = latestByKey(all).filter((t) => t.enabled).map((t) => ({ key: t.key, name: t.name, version: t.version, category: t.category }));
  const people: CoachOpt[] = coaches.filter((c) => c.status === "active" && !c.isTest).map((c) => ({ id: c.id, name: c.name || c.email || c.id, rankCode: c.rankCode ?? null }));
  const views: TaskView[] = tasks.map((t) => ({ id: t.id, title: t.title, version: t.templateVersion, deadline: t.deadline, note: t.note, createdAt: t.createdAt.toISOString().slice(0, 10), total: t.total, done: t.done, rows: t.rows }));
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="補簽任務" />
      <AdminNav />
      <section className="max-w-5xl mx-auto px-5 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">補簽任務</h1>
          <Link href="/admin/docs" className="text-xs rounded-md border border-line px-2.5 py-1.5 text-tx2 hover:text-tx">範本與組合</Link>
        </div>
        <p className="text-sm text-tx2 leading-relaxed">新增或修訂文件之後，指定既有教練補簽。每個任務記錄文件版本、對象、期限與完成結果；<b className="text-tx">不會</b>改動任何人的既有權限——要不要影響、何時影響，由公司另訂。</p>
        <TasksBoard templates={templates} people={people} tasks={views} />
      </section>
    </main>
  );
}
