import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getFeedback, getFeedbackSettings } from "@/lib/serviceFeedback";
import BrandMark from "@/components/BrandMark";
import FeedbackForm from "./FeedbackForm";

export const dynamic = "force-dynamic";

// 客戶端：服務回饋問卷（每題 1–5 ＋ 一句話）。
export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await ensureClientUser();
  if (!me) redirect("/client/sign-in");
  const { id } = await params;
  const f = await getFeedback(id);
  if (!f || f.clientUserId !== me.id) notFound();
  const settings = await getFeedbackSettings();
  return (
    <div className="min-h-screen bg-canvas text-tx flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-line">
        <Link href="/portal" className="flex items-center gap-3"><BrandMark /><span className="font-serif tracking-[0.14em] text-lg">嵐途 LAN TU</span></Link>
        <Link href="/portal" className="text-sm text-tx2 hover:text-tx border border-line2 rounded-lg px-3 py-1.5">回會員中心</Link>
      </header>
      <main className="flex-1 px-6 py-10">
        <section className="max-w-xl mx-auto">
          <div className="text-brand text-xs tracking-[0.3em] mb-2">FEEDBACK</div>
          <h1 className="page-title mb-2">這次服務，你的感受</h1>
          <p className="text-sm text-tx2 mb-6">四題評分加一句話，大約一分鐘。你的意見會直接回到嵐途，不只給教練看。</p>
          <FeedbackForm id={f.id} questions={settings.questions} initial={f.submittedAt ? { scores: f.scores, comment: f.comment } : null} />
        </section>
      </main>
    </div>
  );
}
