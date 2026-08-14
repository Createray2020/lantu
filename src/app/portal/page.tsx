import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan } from "@/lib/clientPlan";
import { FACES } from "@/lib/passport";

export const dynamic = "force-dynamic";

const nt = (n: number) => Math.round(n || 0).toLocaleString("en-US");

// 客戶端首頁。
// - 尚未做人生護照：導引開始。
// - 已有基礎方案：顯示每月應存摘要；「真的進入規劃」要等掛上教練（雙向連結，之後開放）。
export default async function Portal() {
  // 任何登入者（含教練）都看客戶介面；未登入才導去客戶登入。
  const client = await ensureClientUser();
  if (!client) redirect("/client/sign-in");
  const name = client.name || "貴賓";
  const own = await getClientOwnPlan(client.id);
  const monthly = own?.monthly ?? null;

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

      <main className="flex-1 px-6 py-12">
        {monthly ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">MY LIFE PASSPORT</div>
              <h1 className="font-serif text-3xl mb-2">{name}，你的人生護照</h1>
              <p className="text-[#a7bacb] text-sm">為了實現你的目標，建議每月存下：</p>
              <div className="font-serif text-4xl text-[#e0bd8b] mt-3">NT$ {nt(monthly.total)}</div>
            </div>

            <div className="rounded-2xl bg-[#12334f] border border-white/8 divide-y divide-white/8 mb-6">
              {FACES.map((f) => (
                <div key={f.key} className="flex items-center justify-between px-5 py-3.5">
                  <span className="flex items-center gap-3 text-[#cdd9e5]">
                    <span>{f.icon}</span>
                    <span>{f.label}</span>
                  </span>
                  <span className="font-semibold text-[#e0bd8b]">NT$ {nt(monthly[f.key])}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <Link href="/portal/passport" className="font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-2.5 rounded-lg text-sm">
                重新編輯人生護照
              </Link>
            </div>

            <div className="rounded-xl border border-[#c99a5b]/30 bg-[#0d2b45]/50 p-5 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-[#e0bd8b] mb-2">
                <span className="w-2 h-2 rounded-full bg-[#c99a5b] animate-pulse" />
                下一步：連結你的專屬教練
              </div>
              <p className="text-[#a7bacb] text-sm leading-relaxed">
                你的規劃基礎已建立。掛上信任的財務教練、經你授權後，
                就能一起把這份基礎深化成完整的財務規劃。（教練連結即將開放）
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-lg mx-auto text-center pt-6">
            <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-3">MY FINANCIAL PLAN</div>
            <h1 className="font-serif text-3xl mb-4">{name}，歡迎回來</h1>
            <p className="text-[#a7bacb] leading-relaxed mb-8">
              你的專屬財務規劃，從「人生護照」開始——用購房、購車、退休、扶養、旅遊
              五個面向，把你最在意的人生目標換算成「每個月該存多少」，完成後就成為你的第一份規劃基礎。
            </p>
            <Link href="/portal/passport" className="inline-block font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-8 py-3 rounded-lg">
              開始我的人生護照
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
