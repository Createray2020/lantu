import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { listClientsForCoach, listSharedClientsForCoach } from "@/lib/clients";
import { listTemplates } from "@/lib/templates";
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
  // 示範範本：全體教練共用的展示素材，不屬於任何人、不計入額度（見 lib/templates.ts）。
  // 讀失敗不該讓整個客戶清單掛掉——那是教練每天的主畫面，範本只是附屬的一區。
  const [clients, shared, quota, templates] = await Promise.all([
    listClientsForCoach(coach.id),
    listSharedClientsForCoach(coach.id),
    clientQuota(coach),
    listTemplates().catch(() => []),
  ]);
  const hp = await headerProps(coach);
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      <ClientList
        clients={clients}
        shared={shared}
        templates={templates}
        quota={quota}
        readOnly={hp.license.expired}
      />
    </div>
  );
}
