import Link from "next/link";

/**
 * 登入／註冊頁的品牌外殼。
 *
 * ⚠️ 為什麼要抽出來：客戶端的 /client/sign-in 與 /client/sign-up 原本只有一個裸的
 *    Clerk <SignIn/> 置中，沒有嵐途 logo、沒有「你正在為誰的邀請建立帳號」、
 *    也沒有回頭路。客戶從教練那條有品牌、有教練名字的邀請頁點進來，
 *    下一頁忽然變成一張陌生的表單——這是整條入場動線最容易掉人的一步，
 *    而 /login 早就有這層外殼了，只是沒被共用。
 *
 * subtitle 是給邀請情境用的：帶上教練名字，客戶才知道自己還在同一條路上。
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas text-tx flex flex-col">
      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center">
          <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
            <span className="grid place-items-center w-9 h-9 rounded-xl border border-brand shrink-0">
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

      <main className="flex-1 px-5 py-10 sm:py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center mb-7">
            <h1 className="font-serif text-2xl mb-2">{title}</h1>
            {subtitle && <div className="text-tx2 text-sm leading-relaxed">{subtitle}</div>}
          </div>
          {/* Clerk 的元件本身是響應式的，這裡只負責置中與留白。 */}
          <div className="flex justify-center">{children}</div>
          {footer && <div className="text-center mt-7 space-y-2">{footer}</div>}
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 text-center">
          <Link href="/home" className="text-sm text-tx3 hover:text-tx2">← 回官網首頁</Link>
        </div>
      </footer>
    </div>
  );
}
