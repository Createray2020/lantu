import { redirect } from "next/navigation";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import { ensureCoach } from "@/lib/coach";
import { listMyInstances, sweepExpired, listDocTodos } from "@/lib/docsStore";
import DocTodoList from "@/components/DocTodoList";
import { toTodoRows } from "@/lib/docTodoRows";
import DocList from "@/components/DocList";
import MySignature from "@/components/MySignature";
import { getSignature } from "@/lib/docsStore";

export const dynamic = "force-dynamic";

// 教練端：我的文件（我是簽署人的所有電子文件）＋我的簽名檔。
export default async function CoachDocsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (me.status !== "active") redirect("/dashboard");
  await sweepExpired();
  const [hp, list, saved, todos] = await Promise.all([headerProps(me), listMyInstances({ coachId: me.id }), getSignature({ kind: "coach", id: me.id }), listDocTodos({ coachId: me.id })]);
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <DashboardHeader {...hp} />
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold">我的文件</h1>
          <p className="text-sm text-tx2 mt-1">你是簽署人的合約與文件都在這裡；客戶那一邊看到的是同一份。</p>
        </div>
        <DocTodoList rows={toTodoRows(todos)} />
        <DocList list={list} me={{ coachId: me.id }} />
        <MySignature saved={saved} />
      </section>
    </main>
  );
}
