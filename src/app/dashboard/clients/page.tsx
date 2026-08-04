import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { listClientsForCoach } from "@/lib/clients";
import DashboardHeader from "../DashboardHeader";
import ClientList from "../ClientList";

export const dynamic = "force-dynamic";

// 客戶列表（三層架構最上層）。原本在 /dashboard，首頁改為角色儀表後移到此。
export default async function ClientsPage() {
  const coach = await ensureCoach();
  if (!coach) redirect("/sign-in");
  if (coach.status !== "active") redirect("/dashboard");
  const clients = await listClientsForCoach(coach.id);
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader isAdmin={coach.role === "admin"} />
      <ClientList clients={clients} />
    </div>
  );
}
