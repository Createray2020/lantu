import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getPlan } from "@/lib/plans";
import { listRevisions } from "@/lib/revisions";

export const dynamic = "force-dynamic";

// 版本紀錄：這份 plan 每次存檔的快照＋編輯者。
export default async function HistoryPage({ params }: { params: Promise<{ planId: string }> }) {
  const coach = await ensureCoach();
  if (!coach || coach.status !== "active") redirect("/dashboard");
  const { planId } = await params;
  // 必須驗這份 plan 屬於自己。舊版只檢查「是 active 教練」，
  // 拿到別人的 planId 就能看到 editorName（客戶端存檔寫的是客戶真實姓名）與完整編輯時間軸。
  const plan = await getPlan(coach.id, planId);
  if (!plan) notFound();
  const revs = await listRevisions(planId);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <Link href={`/dashboard/plans/${planId}/edit`} className="text-sm text-[#a9bccf] hover:text-[#eef2f7]">← 返回編輯</Link>
        <h1 className="font-serif text-2xl my-4">版本紀錄</h1>
        <p className="text-[#a7bacb] text-sm mb-5">每次存檔都會留一版，標記是教練還是客戶編輯的。</p>
        {revs.length === 0 ? (
          <p className="text-[#a7bacb]">尚無版本紀錄。</p>
        ) : (
          <ul className="space-y-2">
            {revs.map((r) => (
              <li key={r.id} className="rounded-lg bg-[#12334f] border border-white/8 px-4 py-3 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span>{r.editorType === "client" ? "👤 客戶" : "🧭 教練"}</span>
                  {r.editorName ? <span className="text-[#cdd9e5]">{r.editorName}</span> : null}
                </span>
                <span className="text-[#6f869c]">{new Date(r.createdAt).toLocaleString("zh-TW", { hour12: false })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
