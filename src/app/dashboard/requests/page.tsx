import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ensureCoach } from "@/lib/coach";
import { listPendingRequestsForCoach } from "@/lib/coachLink";
import DashboardHeader from "../DashboardHeader";
import RequestList from "./RequestList";
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
  const requests = await listPendingRequestsForCoach(coach.id);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader isAdmin={coach.role === "admin"} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="font-serif text-2xl mb-1">客戶連結申請</h1>
        <p className="text-[#a7bacb] text-sm mb-5">客戶從人生護照送出的連結邀請；接受後對方就掛到你名下、可一起規劃。</p>
        <RequestList requests={requests.map((r) => ({ id: r.id, clientId: r.clientId, clientName: r.clientName, note: r.note }))} />
        <div className="mt-8 pt-6 border-t border-white/10">
          <InviteBox />
        </div>
      </div>
    </div>
  );
}
