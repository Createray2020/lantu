import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ensureCoach } from "@/lib/coach";
import { getHome } from "@/lib/home";
import { getApplication } from "@/lib/coachApplyStore";
import DashboardHeader from "./DashboardHeader";
import { headerProps } from "./headerProps";
import ReadOnlyBanner from "./ReadOnlyBanner";
import PendingNotice from "./PendingNotice";
import HomeSwitcher from "./HomeSwitcher";
import Home from "./HomeView";

export const dynamic = "force-dynamic";

// 登入後著陸首頁：依組織職級（教練／主管／核心成員）呈現對應視角。
// - 未登入 → 導回登入。
// - 未開通／停權 → 待開通頁。
// - 已開通 → 角色首頁（owner/manager 可用切換器預覽其他視角）。
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; focus?: string }>;
}) {
  const coach = await ensureCoach();
  if (!coach) {
    // 非教練：客戶帳號 → 導去客戶端；未登入 → 導去登入。
    const { userId } = await auth();
    redirect(userId ? "/portal" : "/sign-in");
  }
  if (coach.status !== "active") {
    // 待審者看得到自己的報聘進度（卡在介紹人還是卡在審核）。舊帳號沒有申請表就只有原本那句話。
    const app = await getApplication(coach.id);
    return (
      <PendingNotice
        email={coach.email}
        status={coach.status}
        progress={
          app
            ? {
                route: app.route,
                introducerState: app.introducerState,
                introducerName: app.introducerName,
                introducerNote: app.introducerNote,
              }
            : null
        }
      />
    );
  }
  const sp = await searchParams;
  const data = await getHome(coach, { as: sp.as, focus: sp.focus });

  const hp = await headerProps(coach);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-6">
        <HomeSwitcher
          rank={data.rank}
          views={data.views}
          focusId={data.focusId}
          teamOptions={data.teamOptions}
          memberOptions={data.memberOptions}
        />
        <Home data={data} />
      </div>
    </div>
  );
}
