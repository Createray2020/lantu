import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { listTemplates } from "@/lib/templates";
import AdminNav from "../AdminNav";
import TemplateAdmin from "./TemplateAdmin";

export const dynamic = "force-dynamic";

// 共用示範範本的後台。
//
// 它跟「教練帳號」「案件與分潤」都不同：這一頁編出來的東西，全公司每位教練
// 登入後看到的是**同一份**。所以頁面本身要把這件事講清楚，
// 不能讓人以為自己在編自己的客戶。
export default async function TemplatesAdminPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  // 後台要看得到已下架的那幾份（才能重新上架或永久刪除）；教練端不帶這個參數。
  const [templates, brand] = await Promise.all([listTemplates({ includeArchived: true }), getBrand()]);

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
      <section className="p-6 max-w-5xl">
        <h1 className="text-xl font-bold mb-1">示範範本</h1>
        <p className="text-[#a9bccf] text-sm mb-1">
          做給教練坐在客戶旁邊翻的示範個案。<b className="text-[#e0bd8b]">每位教練登入後看到的都是這一份</b>，
          他們只能看、不能改；要動內容只有在這裡。
        </p>
        <p className="text-[#6b7d8f] text-xs mb-5">
          範本不計入任何人的客戶數上限，也不會發客戶編號。教練若想拿某份範本當起點做試算，
          可以按「複製一份給自己」——複製出來的那位就是他名下的一般客戶，會計入他的額度。
        </p>
        <TemplateAdmin templates={templates} />
      </section>
    </main>
  );
}
