import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";

export const dynamic = "force-dynamic";

export const metadata = { title: "登入 ｜ 嵐途 LAN TU" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-tx flex flex-col">
      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center">
          <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
            <span className="grid place-items-center w-9 h-9 rounded-xl border border-brand">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
                <path d="M15 12 L15 33 L34 33" className="stroke-tx2" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 24 A13 13 0 0 1 36 16" className="stroke-brand" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="font-serif tracking-[0.12em] sm:tracking-[0.16em] text-13 sm:text-15 whitespace-nowrap">嵐途 LAN TU</span>
              <span className="hidden sm:block text-10 tracking-[0.3em] text-brand">FINANCIAL PLANNING</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1 grid place-items-center px-5 py-12">{children}</main>
      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 text-center">
          <Link href="/home" className="text-sm text-tx3 hover:text-tx2">← 回官網首頁</Link>
        </div>
      </footer>
    </div>
  );
}

// 嵐途的登入只有一次。
//
// 教練與客戶是「非互斥·雙棲」——同一個 Clerk 帳號可以既是教練、也是客戶（教練也要做自己的
// 財務規劃）。所以身分不是登入的前提，而是登入之後「這次要進哪個區域」的選擇。
// 上一版把兩張身分卡擺在登入前，等於要使用者先替系統回答「你該用哪個登入表單」，那是錯的。
//
// 而且只有真的具備教練身分的人才需要選——純客戶只有一種答案，直接送進 /portal。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const sp = await searchParams;
  const back = sp.redirect_url && sp.redirect_url.startsWith("/") ? sp.redirect_url : undefined;
  const { userId } = await auth();

  if (!userId) {
    return (
      <Shell>
        <div className="w-full max-w-md">
          <div className="text-center mb-7">
            <h1 className="font-serif text-2xl mb-2">登入嵐途</h1>
            <p className="text-tx2 text-sm">教練與客戶共用同一組帳號，登入後再選要進哪裡。</p>
          </div>
          <div className="flex justify-center">
            <SignIn routing="hash" signUpUrl="/client/sign-up" fallbackRedirectUrl={back ?? "/login"} />
          </div>
          <div className="text-center mt-7 space-y-2">
            <p className="text-sm text-tx2">
              還沒有帳號？{" "}
              <Link href="/client/sign-up" className="text-brand2 hover:text-tx underline underline-offset-4">
                免費申請
              </Link>
            </p>
            <p className="text-13 text-tx3">
              想加入嵐途教練團隊？
              <Link href="/join" className="text-tx2 hover:text-tx underline underline-offset-4">看看這裡</Link>
              <span className="mx-1.5">·</span>
              <Link href="/apply" className="text-tx2 hover:text-tx underline underline-offset-4">直接申請</Link>
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const asCoach = await db.select({ id: coaches.id }).from(coaches).where(eq(coaches.id, userId)).limit(1);

  // 指定了去處（例如從邀請連結進來）就直接去，不打斷。
  if (back) redirect(back);
  // 不是教練 → 沒得選，直接進客戶區。
  if (!asCoach[0]) redirect("/portal");

  return (
    <Shell>
      <div className="w-full max-w-3xl">
        <div className="text-center mb-9">
          <h1 className="font-serif text-3xl mb-3">要進哪裡？</h1>
          <p className="text-tx2 text-sm">你同時擁有教練與客戶身分，兩邊隨時可以切換。</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link
            href="/dashboard"
            className="group rounded-2xl border border-line bg-panel hover:bg-panel2 hover:border-line2 transition p-7 text-center flex flex-col shadow-e1"
          >
            <div className="text-4xl mb-3">🧭</div>
            <div className="font-serif text-xl mb-2">教練工作台</div>
            <p className="text-tx2 text-sm leading-relaxed mb-5 flex-1">
              客戶管理、規劃編輯、報告書與組織後台。
            </p>
            <span className="inline-block text-sm font-bold text-tx bg-tx/10 group-hover:bg-tx/15 border border-line2 px-6 py-2.5 rounded-lg">
              進入工作台
            </span>
          </Link>

          <Link
            href="/portal"
            className="group rounded-2xl border border-brand/40 bg-panel hover:bg-panel2 hover:border-brand transition p-7 text-center flex flex-col shadow-e1"
          >
            <div className="text-4xl mb-3">🧑</div>
            <div className="font-serif text-xl mb-2 text-brand2">我自己的規劃</div>
            <p className="text-tx2 text-sm leading-relaxed mb-5 flex-1">
              我的人生護照、財務藍圖與規劃進度。
            </p>
            <span className="inline-block text-sm font-bold text-onbrand bg-brand group-hover:bg-brand2 px-6 py-2.5 rounded-lg">
              我的規劃
            </span>
          </Link>
        </div>

        <p className="text-center text-13 text-tx3 mt-7">
          之後也能從頁首直接切換，不必回到這裡。
        </p>
      </div>
    </Shell>
  );
}
