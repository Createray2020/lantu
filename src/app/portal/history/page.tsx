import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan } from "@/lib/clientPlan";
import { listClientTimeline } from "@/lib/revisions";
import RevisionTimeline, { type TimelineItem } from "@/components/RevisionTimeline";
import { restoreClientRevisionAction } from "./actions";

export const dynamic = "force-dynamic";

// 客戶端的版本紀錄：自己的人生護照 ＋ 教練做的年度版，兩軌合併成一條時間軸。
// 看得到全部（規劃是共同的），但只回得了自己那一軌。
export default async function ClientHistoryPage() {
  const user = await ensureClientUser();
  if (!user) redirect("/client/sign-in");
  const own = await getClientOwnPlan(user.id);
  if (!own) redirect("/portal/passport");

  const rows = await listClientTimeline(own.clientId);
  const items: TimelineItem[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    restorable: r.track === "client",
  }));

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/portal" className="text-sm text-[#a9bccf] hover:text-[#eef2f7]">← 回我的首頁</Link>
        <h1 className="font-serif text-2xl my-4">版本紀錄</h1>
        <p className="text-[#a7bacb] text-sm mb-5">
          你的人生護照和教練做的年度版是兩條並行的紀錄，這裡依時間合併呈現，最新的在最上面。
          你可以回復自己護照的任何一版；教練的年度版只有教練能回復。
        </p>
        <RevisionTimeline items={items} onRestore={restoreClientRevisionAction} viewerType="client" />
      </div>
    </div>
  );
}
