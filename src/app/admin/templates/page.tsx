import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { listTemplates } from "@/lib/templates";
import AdminHeader from "../AdminHeader";
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
  const [templates] = await Promise.all([listTemplates({ includeArchived: true })
  ]);

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="教練管理後台" />
      <AdminNav />
      <section className="max-w-5xl mx-auto px-5 py-6">
        <h1 className="text-xl font-bold mb-1">示範範本</h1>
        <p className="text-tx2 text-sm mb-1">
          做給教練坐在客戶旁邊翻的示範個案。<b className="text-brand2">每位教練登入後看到的都是這一份</b>，
          他們只能看、不能改；要動內容只有在這裡。
        </p>
        <p className="text-tx3 text-xs mb-5">
          範本不計入任何人的客戶數上限，也不會發客戶編號。教練若想拿某份範本當起點做試算，
          可以按「複製一份給自己」——複製出來的那位就是他名下的一般客戶，會計入他的額度。
        </p>
        <TemplateAdmin templates={templates} />
      </section>
    </main>
  );
}
