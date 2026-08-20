import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "登入 ｜ 嵐途 LAN TU",
};

// 官網只有一顆「登入」，身分在這裡選。
//
// 為什麼不在頂欄放兩顆（教練登入／客戶登入）：第一次來的訪客根本不知道自己該按哪顆，
// 而「教練」在嵐途是內部身分，不該佔對外首頁的版位。一顆按鈕、一條路徑，兩種人都好記。
//
// 已經登入的人不必再選——直接送他去自己的區域。
export default async function LoginChoicePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { userId } = await auth();
  if (userId) {
    const asCoach = await db.select({ id: coaches.id }).from(coaches).where(eq(coaches.id, userId)).limit(1);
    redirect(asCoach[0] ? "/dashboard" : "/portal");
  }

  const sp = await searchParams;
  const back = sp.redirect_url && sp.redirect_url.startsWith("/") ? sp.redirect_url : undefined;
  const withBack = (base: string) => (back ? `${base}?redirect_url=${encodeURIComponent(back)}` : base);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7] flex flex-col">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center">
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
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-5 py-14">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-9">
            <h1 className="font-serif text-3xl mb-3">歡迎回來</h1>
            <p className="text-[#a7bacb] text-sm">選擇你的身分，我們帶你到對的地方。</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              href={withBack("/client/sign-in")}
              className="group rounded-2xl border border-[#c99a5b]/40 bg-[#0d2b45] hover:bg-[#12334f] hover:border-[#c99a5b] transition p-7 text-center flex flex-col"
            >
              <div className="text-4xl mb-3">🧑</div>
              <div className="font-serif text-xl mb-2 text-[#e0bd8b]">我是客戶</div>
              <p className="text-[#a7bacb] text-sm leading-relaxed mb-5 flex-1">
                查看我的人生護照、財務藍圖與規劃進度。
              </p>
              <span className="inline-block text-sm font-bold text-[#08202a] bg-[#c99a5b] group-hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg">
                客戶登入
              </span>
            </Link>

            <Link
              href={withBack("/sign-in")}
              className="group rounded-2xl border border-white/12 bg-[#0d2b45] hover:bg-[#12334f] hover:border-white/30 transition p-7 text-center flex flex-col"
            >
              <div className="text-4xl mb-3">🧭</div>
              <div className="font-serif text-xl mb-2">我是教練</div>
              <p className="text-[#a7bacb] text-sm leading-relaxed mb-5 flex-1">
                進入教練工作台：客戶管理、規劃編輯、報告書與組織後台。
              </p>
              <span className="inline-block text-sm font-bold text-white bg-white/10 group-hover:bg-white/15 border border-white/15 px-6 py-2.5 rounded-lg">
                教練登入
              </span>
            </Link>
          </div>

          <div className="text-center mt-8 space-y-2">
            <p className="text-sm text-[#a7bacb]">
              還沒有帳號？{" "}
              <Link href="/client/sign-up" className="text-[#e0bd8b] hover:text-white underline underline-offset-4">
                免費申請客戶帳號
              </Link>
            </p>
            <p className="text-[13px] text-[#6f869c]">
              想加入嵐途教練團隊？<Link href="/join" className="text-[#a7bacb] hover:text-white underline underline-offset-4">看看這裡</Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 text-center">
          <Link href="/home" className="text-sm text-[#6f869c] hover:text-[#a7bacb]">← 回官網首頁</Link>
        </div>
      </footer>
    </div>
  );
}
