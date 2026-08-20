import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import PassportWizard from "@/components/PassportWizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "人生護照 免費試算 ｜ 嵐途 LAN TU",
  description: "不用註冊，3 分鐘算出你的購房、購車、退休、扶養、旅遊五大人生目標，每月該存多少、能達成什麼。",
};

// 官網公開試算頁。
//
// 與 /portal/passport 共用同一個 PassportWizard 元件，差別只在 mode——
// 刻意不另做一份「簡化版試算」：這個 repo 已經被「同樣的東西各自演化成兩份」咬過好幾次
// （引擎、taiwan.ts、intent.ts 都得靠 drift test 綁著）。護照再開第二份，遲早又是一輪。
export default async function PublicPassportPage() {
  const { userId } = await auth();
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <header className="sticky top-0 z-30 backdrop-blur bg-[#081a2b]/85 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
            <span className="grid place-items-center w-9 h-9 rounded-xl border border-[#c99a5b]">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
                <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-serif tracking-[0.16em] text-[15px]">嵐途 LAN TU</span>
              <span className="text-[9px] tracking-[0.3em] text-[#c99a5b]">FINANCIAL PLANNING</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/coaches" className="text-sm text-[#a7bacb] hover:text-white px-3 py-2 rounded-lg">認識教練</Link>
            <Link
              href={userId ? "/portal" : "/client/sign-in"}
              className="text-sm text-[#a7bacb] hover:text-white px-3 py-2 rounded-lg border border-white/15"
            >
              {userId ? "我的規劃" : "登入"}
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-8 text-center">
        <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-3">FREE · 不用註冊</div>
        <p className="text-[#a7bacb] text-sm leading-relaxed max-w-2xl mx-auto">
          直接拉動下面的條件就會算，資料只留在你的瀏覽器，不會傳送給我們。
          滿意的話再按存檔，我們才會替你建立帳號與規劃。
        </p>
      </div>

      <PassportWizard initial={null} mode="public" signedIn={!!userId} />
    </div>
  );
}
