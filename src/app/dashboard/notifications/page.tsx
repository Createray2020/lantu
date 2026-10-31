import { redirect } from "next/navigation";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import { ensureCoach } from "@/lib/coach";
import { listNotifications } from "@/lib/notify";
import NotificationList from "@/components/NotificationList";

export const dynamic = "force-dynamic";

// 教練端：通知中心（站內通知；不推播不寄信）。
export default async function CoachNotificationsPage() {
  const me = await ensureCoach();
  if (!me || me.status !== "active") redirect("/dashboard");
  const [hp, list] = await Promise.all([headerProps(me), listNotifications("coach", me.id, 80)]);
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <DashboardHeader {...hp} />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <h1 className="page-title">通知</h1>
          <p className="text-sm text-tx2 mt-1">案件到期、逾期升級、客戶提問、文件簽署都在這裡；只在站內，不會寄信。</p>
        </div>
        <NotificationList side="coach" rows={list.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString() }))} />
      </section>
    </main>
  );
}
