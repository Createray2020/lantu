import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { listClientsForCoach } from "@/lib/clients";
import DashboardHeader from "./DashboardHeader";
import PendingNotice from "./PendingNotice";
import ClientList from "./ClientList";

export const dynamic = "force-dynamic";

// 登入後主畫面：客戶列表（三層架構最上層）。
// - 未登入 → 導回登入。
// - 未開通／停權 → 待開通頁。
// - 已開通 → 客戶列表。
export default async function Dashboard() {
  const coach = await ensureCoach();
  if (!coach) redirect("/sign-in");
  if (coach.status !== "active") {
    return <PendingNotice email={coach.email} status={coach.status} />;
  }
  const clients = await listClientsForCoach(coach.id);
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader isAdmin={coach.role === "admin"} />
      <ClientList clients={clients} />
    </div>
  );
}
