import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { listClientsForCoach } from "@/lib/clients";
import { clientQuota } from "@/lib/quota";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import ReadOnlyBanner from "../ReadOnlyBanner";
import ClientList from "../ClientList";

export const dynamic = "force-dynamic";

// 客戶列表（三層架構最上層）。原本在 /dashboard，首頁改為角色儀表後移到此。
export default async function ClientsPage() {
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (coach.status !== "active") redirect("/dashboard");
  const [clients, quota] = await Promise.all([listClientsForCoach(coach.id), clientQuota(coach)]);
  const hp = await headerProps(coach);
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      <ClientList clients={clients} quota={quota} readOnly={hp.license.expired} />
    </div>
  );
}
