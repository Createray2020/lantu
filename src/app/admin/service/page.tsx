import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import { loadStageParams } from "@/lib/caseStore";
import { STAGES, paramsFor } from "@/lib/caseEngine";
import { getSupportContact } from "@/lib/supportContact";
import { getFeedbackSettings } from "@/lib/serviceFeedback";
import { db } from "@/Shared/db";
import { orgHolidays } from "@/Shared/db/schema";
import { asc } from "drizzle-orm";
import ServiceSettings from "./ServiceSettings";

export const dynamic = "force-dynamic";

// 後台「客戶服務」：案件進度的規則（提案書第三節）都在這一頁——全部是「預設值」，不是正式標準。
export default async function AdminServicePage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const [overrides, support, feedback, holidays] = await Promise.all([loadStageParams(), getSupportContact(), getFeedbackSettings(), db.select().from(orgHolidays).orderBy(asc(orgHolidays.day))]);
  const stages = STAGES.map((s) => ({ stage: s, ...paramsFor(s, overrides), configured: !!overrides[s] }));
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="客戶服務" />
      <AdminNav />
      <section className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        <div>
          <h1 className="page-title">客戶服務 · 案件進度規則</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            服務階段 4–8 的預設期限與檢查清單、逾期升級用的假日表、會員中心的聯絡客服面板、服務回饋問卷。
            所有期限都是<b className="text-brand2">預設值</b>：客戶端以教練承諾的日期為準（日曆天）；逾期升級的提醒天數以工作日計。
          </p>
        </div>
        <ServiceSettings stages={stages} support={support} feedback={feedback} holidays={holidays} />
      </section>
    </main>
  );
}
