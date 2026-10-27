import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { listAllInstances, sweepExpired } from "@/lib/docsStore";
import AdminHeader from "../../AdminHeader";
import AdminNav from "../../AdminNav";
import DocList from "@/components/DocList";
import VoidButton from "./VoidButton";

export const dynamic = "force-dynamic";

const TABS = [
  { k: "", label: "全部" },
  { k: "pending", label: "待簽署" },
  { k: "completed", label: "已完成" },
  { k: "declined", label: "拒簽" },
  { k: "expired", label: "逾期" },
];

// 後台：所有簽署中／已完成的文件總覽；可作廢（留痕，之後可重新啟動）。
export default async function DocInstancesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const sp = await searchParams;
  const status = TABS.some((t) => t.k === (sp.status ?? "")) ? sp.status ?? "" : "";
  await sweepExpired();
  const list = await listAllInstances({ status: status || undefined });
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="簽署總覽" />
      <AdminNav />
      <section className="max-w-5xl mx-auto px-5 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">簽署總覽</h1>
          <Link href="/admin/docs" className="text-xs rounded-md border border-line px-2.5 py-1.5 text-tx2 hover:text-tx">範本與組合</Link>
          <div className="ml-auto flex gap-1 text-xs">
            {TABS.map((t) => (
              <Link key={t.k} href={t.k ? `/admin/docs/instances?status=${t.k}` : "/admin/docs/instances"} className={`rounded-md border px-2.5 py-1 ${status === t.k ? "border-brand2 text-brand2" : "border-line text-tx2"}`}>{t.label}</Link>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          {list.length === 0 && <p className="text-sm text-tx3">沒有文件。</p>}
          {list.map((i) => (
            <div key={i.id} className="grid gap-1">
              <DocList list={[i]} me={{ coachId: me.id }} showCase />
              {i.status !== "completed" && <div className="flex justify-end"><VoidButton id={i.id} /></div>}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
