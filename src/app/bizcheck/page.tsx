import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import BizCheckForm from "./BizCheckForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "企業主財務自我檢核 ｜ 嵐途 LAN TU",
  description: "十個問題、兩分鐘，看清楚你的公司與個人財務界線在哪裡。不用註冊，答案只留在你的瀏覽器。",
};

// 官網公開試算頁（企業主版）。地位等同 /passport——這是企業主客群的入場門。
//
// 為什麼要有這一頁：企業主最有效的開場不是問他有多少存款，
// 而是讓他自己勾出那幾個「否」。實務上多數人第一次填會勾出 5～8 個，
// 而每一個「否」，都是一個明確的服務起點。
export default async function BizCheckPage() {
  const { userId } = await auth();
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <header className="sticky top-0 z-30 backdrop-blur bg-[#081a2b]/85 border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
            <span className="grid place-items-center w-9 h-9 rounded-xl border border-[#c99a5b]">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
                <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="font-serif tracking-[0.12em] sm:tracking-[0.16em] text-[13px] sm:text-[15px] whitespace-nowrap">嵐途 LAN TU</span>
              <span className="hidden sm:block text-[9px] tracking-[0.3em] text-[#c99a5b]">FINANCIAL PLANNING</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/passport" className="hidden sm:inline text-sm text-[#a7bacb] hover:text-white px-3 py-2 rounded-lg">人生護照</Link>
            <Link
              href={userId ? "/portal" : "/login"}
              className="text-[13px] sm:text-sm text-[#a7bacb] hover:text-white px-2 sm:px-3 py-2 rounded-lg sm:border sm:border-white/15 whitespace-nowrap"
            >
              {userId ? "我的規劃" : "登入"}
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-5">
        <div className="text-center">
          <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-3">FREE · 不用註冊</div>
          <h1 className="font-serif text-2xl sm:text-3xl leading-snug">企業主財務自我檢核</h1>
          <p className="text-[#a7bacb] text-sm leading-relaxed max-w-xl mx-auto mt-3">
            大部分企業主把「公司」和「自己」當成同一個主體在管理——
            帳不用分、錢拿回來不需要名目、公司好就是我好。
            這十題會讓你看見那條界線目前在哪裡。
          </p>
        </div>

        <BizCheckForm />
      </div>
    </div>
  );
}
