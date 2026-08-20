import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getPlan } from "@/lib/plans";
import { listClientTimeline } from "@/lib/revisions";
import RevisionTimeline, { type TimelineItem } from "@/components/RevisionTimeline";
import { restoreCoachRevisionAction } from "./actions";

export const dynamic = "force-dynamic";

// 版本紀錄：這位客戶名下「兩軌」的所有存檔快照，依時間合併。
// 從 plan 層級改成 client 層級，是因為客戶的人生護照與教練的年度版是兩份不同的 plan——
// 只看單一 plan 的話，教練永遠看不到客戶自己動過什麼。
export default async function HistoryPage({ params }: { params: Promise<{ planId: string }> }) {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") redirect("/dashboard");
  const { planId } = await params;
  // 必須驗這份 plan 屬於自己。舊版只檢查「是 active 教練」，
  // 拿到別人的 planId 就能看到 editorName（客戶端存檔寫的是客戶真實姓名）與完整編輯時間軸。
  const plan = await getPlan(coach.id, planId);
  if (!plan) notFound();

  const rows = await listClientTimeline(plan.clientId);
  const items: TimelineItem[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    restorable: r.track === "coach",
  }));

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Link href={`/dashboard/plans/${planId}/edit`} className="text-sm text-[#a9bccf] hover:text-[#eef2f7]">← 返回編輯</Link>
        <h1 className="font-serif text-2xl my-4">版本紀錄</h1>
        <p className="text-[#a7bacb] text-sm mb-5">
          年度版與客戶自己的人生護照是兩條並行的紀錄，這裡依時間合併呈現。
          你可以回復年度版的任何一版；客戶的人生護照只有客戶本人能回復。
        </p>
        <RevisionTimeline items={items} onRestore={restoreCoachRevisionAction} viewerType="coach" />
      </div>
    </div>
  );
}
