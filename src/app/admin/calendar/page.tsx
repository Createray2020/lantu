import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { todayISO, addDaysISO } from "@/lib/license";
import { listAllForAdmin } from "@/lib/orgEvents";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import CalendarAdmin from "./CalendarAdmin";

export const dynamic = "force-dynamic";

// 公司行事曆後台（2026/09/14 Ray）：會議、活動、公司行程的唯一寫入出口。
// 教育訓練場次不在這裡建——它在 /admin/training，行事曆只是把它投影出來顯示。
export default async function AdminCalendarPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const today = todayISO();
  const rows = await listAllForAdmin(addDaysISO(today, -365), addDaysISO(today, 365));

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="公司行事曆" />
      <AdminNav />

      <section className="max-w-4xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">公司行事曆</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            這裡排的行程，教練在首頁「近期行程」與行事曆頁看得到。
            <b className="text-brand2">可見層級是往上包含</b>——標「主管以上」的，核心成員也看得到、教練看不到。
            <br />
            教育訓練場次請到「訓練時數」建立，行事曆會自動把它顯示出來（出席時數綁在那邊，不在這裡重複建）。
          </p>
        </div>
        <CalendarAdmin rows={rows} today={today} />
      </section>
    </main>
  );
}
