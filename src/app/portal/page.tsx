import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { ensureClientUser } from "@/lib/clientUser";

export const dynamic = "force-dynamic";

// 客戶端登入後的落點。
// 本輪為最小 placeholder：確認「門」通了（客戶可註冊→登入→有地方落地）。
// 人生護照的實際畫面與規劃結構連動＝下一個 pass。
export default async function Portal() {
  const client = await ensureClientUser();
  if (!client) {
    // 非客戶：教練帳號 → 導去教練端；未登入 → 導去客戶登入。
    const { userId } = await auth();
    redirect(userId ? "/dashboard" : "/client/sign-in");
  }
  const name = client.name || "貴賓";

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7] flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl border border-[#c99a5b]">
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
              <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-serif tracking-[0.14em] text-lg">嵐途 LAN TU</span>
        </div>
        <SignOutButton redirectUrl="/">
          <button className="text-sm text-[#a7bacb] hover:text-white border border-white/15 rounded-lg px-3 py-1.5">
            登出
          </button>
        </SignOutButton>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-16">
        <div className="max-w-lg text-center">
          <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-3">MY FINANCIAL PLAN</div>
          <h1 className="font-serif text-3xl mb-4">{name}，歡迎回來</h1>
          <p className="text-[#a7bacb] leading-relaxed mb-8">
            你的專屬財務規劃即將展開。第一步是「人生護照」——
            用購房、購車、退休、扶養、旅遊五個面向，把你最在意的人生目標
            換算成「每個月該存多少」，完成後就成為你的第一份規劃基礎。
          </p>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-5 py-2.5 text-sm text-[#e0bd8b]">
            <span className="w-2 h-2 rounded-full bg-[#c99a5b] animate-pulse" />
            人生護照 · 即將開放
          </div>
          <div className="mt-10">
            <Link href="/" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
              回首頁
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
