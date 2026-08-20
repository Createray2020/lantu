import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getPublicCoach } from "@/lib/coachProfile";
import { getClientLinkStatus } from "@/lib/coachLink";
import CoachList, { type LinkState } from "../CoachList";

export const dynamic = "force-dynamic";

// 單一教練頁：可以把連結直接發給潛在客戶。
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getPublicCoach(id);
  if (!c) return { title: "找不到這位教練 · 嵐途 LAN TU" };
  return {
    title: `${c.name} · 嵐途 LAN TU`,
    description: c.headline || c.bio?.slice(0, 80) || "嵐途財務教練",
  };
}

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await getPublicCoach(id);
  if (!coach) notFound();

  const user = await currentUser();
  let link: LinkState = { state: "guest" };
  if (user) link = await getClientLinkStatus(user.id);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7] flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-white/10">
        <Link href="/home" className="flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl border border-[#c99a5b]">
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
              <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-serif tracking-[0.14em] text-lg">嵐途 LAN TU</span>
        </Link>
        <Link href="/coaches" className="text-sm text-[#a7bacb] hover:text-white">← 所有教練</Link>
      </header>

      <main className="flex-1 px-5 sm:px-8 py-10 max-w-2xl w-full mx-auto">
        {/* 沿用列表的卡片與選擇流程，單人頁只是把清單縮成一位。 */}
        <CoachList coaches={[coach]} link={link} />
      </main>

      <footer className="border-t border-white/10 px-5 sm:px-8 py-6 text-center text-xs text-[#6f869c]">
        嵐途 LAN TU · 理解自己 · 做出選擇 · 走向未來
      </footer>
    </div>
  );
}
