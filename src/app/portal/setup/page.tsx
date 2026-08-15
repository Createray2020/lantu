import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan, getClientSetup } from "@/lib/clientPlan";
import { listActiveCoaches, getClientLinkStatus } from "@/lib/coachLink";
import SetupWizard from "./SetupWizard";

export const dynamic = "force-dynamic";

// 人生護照之後的「補完資料 → 缺口/達成率 → 選教練」頁。
export default async function SetupPage() {
  const user = await ensureClientUser();
  if (!user) redirect("/client/sign-in");
  const own = await getClientOwnPlan(user.id);
  if (!own?.result) redirect("/portal/passport"); // 還沒做人生護照
  const setup = await getClientSetup(user.id);
  const coaches = await listActiveCoaches();
  const link = await getClientLinkStatus(user.id);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <SetupWizard
        monthlyNeedWan={own.result.totalMonthlyWan}
        defaultName={user.name ?? ""}
        basics={setup.basics}
        cross={setup.cross}
        coaches={coaches}
        link={link}
      />
    </div>
  );
}
