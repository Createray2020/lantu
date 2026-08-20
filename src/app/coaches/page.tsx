import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { listPublicCoaches } from "@/lib/coachProfile";
import { getClientLinkStatus } from "@/lib/coachLink";
import CoachList, { type LinkState } from "./CoachList";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "認識我們的教練 · 嵐途 LAN TU",
  description: "嵐途的財務教練介紹：專長領域、服務方式與自我介紹，挑一位陪你走的人。",
};

// 官網公開頁：未登入也看得到（不透過 ensureClientUser，避免只是逛逛的人被建成客戶帳號）。
export default async function CoachesPage() {
  const coaches = await listPublicCoaches();

  // 已登入者才查連結狀態；訪客一律 guest。
  const user = await currentUser();
  let link: LinkState = { state: "guest" };
  if (user) {
    const s = await getClientLinkStatus(user.id);
    link = s;
  }

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
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/home" className="text-[#a7bacb] hover:text-white">官網首頁</Link>
          {link.state === "guest" ? (
            <Link href="/client/sign-in" className="text-[#a7bacb] hover:text-white border border-white/15 rounded-lg px-3 py-1.5">
              客戶登入
            </Link>
          ) : (
            <Link href="/portal" className="text-[#a7bacb] hover:text-white border border-white/15 rounded-lg px-3 py-1.5">
              我的規劃
            </Link>
          )}
        </nav>
      </header>

      <main className="flex-1 px-5 sm:px-8 py-10 max-w-5xl w-full mx-auto">
        <div className="mb-8">
          <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">OUR COACHES</div>
          <h1 className="font-serif text-3xl mb-3">認識我們的教練</h1>
          <p className="text-[#a7bacb] text-sm leading-relaxed max-w-2xl">
            財務規劃是一段要走很久的關係，合不合得來跟專業一樣重要。
            這裡是每位教練自己寫的介紹——看看誰的說法讓你比較放心，再決定找誰談。
          </p>
        </div>

        <CoachList coaches={coaches} link={link} />
      </main>

      <footer className="border-t border-white/10 px-5 sm:px-8 py-6 text-center text-xs text-[#6f869c]">
        嵐途 LAN TU · 理解自己 · 做出選擇 · 走向未來
      </footer>
    </div>
  );
}
