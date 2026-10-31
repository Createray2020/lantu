import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ensureCoach } from "@/lib/coach";
import { listPendingRequestsForCoach } from "@/lib/coachLink";
import { listPendingInvitesForCoach } from "@/lib/clientCollab";
import { listPendingIntroductions } from "@/lib/coachApplyStore";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import ReadOnlyBanner from "../ReadOnlyBanner";
import RequestList from "./RequestList";
import CollabInviteList from "./CollabInviteList";
import IntroductionList from "./IntroductionList";
import InviteBox from "./InviteBox";

export const dynamic = "force-dynamic";

// 教練端：待接受的客戶連結申請。
export default async function RequestsPage() {
  const coach = await ensureCoach();
  if (!coach) {
    const { userId } = await auth();
    redirect(userId ? "/portal" : "/sign-in");
  }
  if (coach.status !== "active") redirect("/dashboard");
  const [requests, collabInvites, intros] = await Promise.all([
    listPendingRequestsForCoach(coach.id),
    listPendingInvitesForCoach(coach.id),
    listPendingIntroductions(coach.id),
  ]);

  const hp = await headerProps(coach);

  return (
    <div className="min-h-screen bg-canvas text-tx">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* 三條綁定路線怎麼選（2026/10/29 Ray）：教練只要判斷「我知道他是誰嗎？」 */}
        <section className="mb-8 rounded-xl border border-line bg-panel2 p-4 shadow-e1">
          <h2 className="font-bold mb-2">要讓客戶連到你，選哪一種？</h2>
          <ul className="grid gap-2 text-sm text-tx2">
            <li><b className="text-tx">已經知道是誰（一對一）</b>：先在「客戶」建好這位客戶，到他的客戶頁「客戶登入」按「複製訊息」貼給他。規劃做好了沒都走這條——做好了他一登入就看得到。</li>
            <li><b className="text-tx">講座、群組（一對多）</b>：用頁面最下面的「群發邀請連結」，誰點進來就新增成你的客戶。</li>
            <li><b className="text-tx">客戶自己來的</b>：你不用做什麼。他在客戶端選了你，申請會出現在下面，按接受就好。</li>
          </ul>
        </section>

        <h1 className="page-title mb-1">客戶連結申請</h1>
        <p className="text-tx2 text-sm mb-5">客戶從人生護照送出的連結邀請；接受後對方就掛到你名下、可一起規劃。</p>
        <RequestList requests={requests.map((r) => ({ id: r.id, clientId: r.clientId, clientName: r.clientName, note: r.note }))} />
        <div className="mt-8 pt-6 border-t border-line">
          <h2 className="font-serif text-xl mb-1">共同執案邀請</h2>
          <p className="text-tx2 text-sm mb-4">其他教練邀你一起看某位客戶。接受後你會在「客戶」頁看到那位客戶，內容全部唯讀。</p>
          <CollabInviteList
            invites={collabInvites.map((i) => ({ id: i.id, clientName: i.clientName, clientCode: i.clientCode, ownerName: i.ownerName }))}
          />
        </div>

        <div className="mt-8 pt-6 border-t border-line">
          <h2 className="font-serif text-xl mb-1">報聘確認</h2>
          <p className="text-tx2 text-sm mb-4">有人填了你的教練編號申請成為嵐途教練。你確認推薦之後，才會進入嵐途審核。</p>
          <IntroductionList
            intros={intros.map((i) => ({
              coachId: i.coachId,
              applicantName: i.applicantName,
              applicantEmail: i.applicantEmail,
              phone: i.phone,
              currentJob: i.currentJob,
              motive: i.motive,
            }))}
          />
        </div>

        <div className="mt-8 pt-6 border-t border-line">
          <InviteBox />
        </div>
      </div>
    </div>
  );
}
