import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { getTemplateForRead } from "@/lib/templates";
import AdminNav from "../../AdminNav";
import TemplatePlanList from "./TemplatePlanList";

export const dynamic = "force-dynamic";

// 一份範本的年度版本清單。內容本身在 ./plans/[planId] 全螢幕編。
export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [tpl, brand] = await Promise.all([getTemplateForRead(id), getBrand()]);
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
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
          )}
          <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        </Link>
        <span className="text-[#a9bccf] text-xs">教練管理後台</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[#a9bccf] text-sm hover:text-white">← 回系統</Link>
        <UserButton />
      </header>
      <AdminNav />
      <section className="p-6 max-w-4xl">
        <Link href="/admin/templates" className="text-sm text-[#a9bccf] hover:text-white">← 範本清單</Link>
        <h1 className="text-xl font-bold mt-2 mb-1">{tpl.client.name}</h1>
        <p className="text-[#a9bccf] text-sm mb-5">
          {tpl.client.templateLabel ?? "（未設客群標籤）"}
          <span className="ml-3 text-[#6b7d8f] text-xs">這份範本全公司教練共用，他們只能看。</span>
        </p>
        <TemplatePlanList templateId={id} plans={plans} />
      </section>
    </main>
  );
}
