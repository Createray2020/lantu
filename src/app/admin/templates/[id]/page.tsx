import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getTemplateForRead } from "@/lib/templates";
import AdminHeader from "../../AdminHeader";
import AdminNav from "../../AdminNav";
import TemplatePlanList from "./TemplatePlanList";

export const dynamic = "force-dynamic";

// 一份範本的年度版本清單。內容本身在 ./plans/[planId] 全螢幕編。
export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [tpl] = await Promise.all([getTemplateForRead(id)
  ]);
  if (!tpl) notFound();

  // ⚠️ 只把清單需要的欄位往下傳。plans.data 是整份 case（約 20KB/份），
  //    送到瀏覽器只為了畫一列「2026 示範版」是白花的。
  const plans = tpl.plans.map((p) => ({
    id: p.id,
    year: p.year,
    label: p.label,
    track: p.track,
    healthGrade: p.healthGrade,
    netWorth: p.netWorth,
  }));

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="教練管理後台" />
      <AdminNav />
      <section className="p-6 max-w-4xl">
        <Link href="/admin/templates" className="text-sm text-tx2 hover:text-tx">← 範本清單</Link>
        <h1 className="text-xl font-bold mt-2 mb-1">{tpl.client.name}</h1>
        <p className="text-tx2 text-sm mb-5">
          {tpl.client.templateLabel ?? "（未設客群標籤）"}
          <span className="ml-3 text-tx3 text-xs">這份範本全公司教練共用，他們只能看。</span>
        </p>
        <TemplatePlanList templateId={id} plans={plans} />
      </section>
    </main>
  );
}
