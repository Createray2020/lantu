import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan, getClientSetup } from "@/lib/clientPlan";
import { normalizeIntent } from "@/lib/intent";
import { wan, ntfmt } from "@/lib/passport";

export const dynamic = "force-dynamic";

// 客戶端首頁。
// - 尚未做人生護照：導引開始。
// - 已有基礎方案：顯示能力分析摘要；「真的進入規劃」要等掛上教練（雙向連結，之後開放）。
export default async function Portal() {
  // 任何登入者（含教練）都看客戶介面；未登入才導去客戶登入。
  const client = await ensureClientUser();
  if (!client) redirect("/client/sign-in");
  const name = client.name || "貴賓";
  const own = await getClientOwnPlan(client.id);
  const r = own?.result ?? null;
  const setup = await getClientSetup(client.id);
  const mustHave = setup.intent ? normalizeIntent({ ...setup.intent }).mustHave : [];

  const rows = r
    ? [
        { icon: "🏠", label: "購房", head: `可購房價 ${wan(r.house.price).toLocaleString("en-US")} 萬`, monthly: r.house.monthly },
        { icon: "🚗", label: "購車", head: `可購車價 ${wan(r.car.price).toLocaleString("en-US")} 萬`, monthly: r.car.monthly },
        { icon: "🌴", label: "退休", head: `退休月領 ${ntfmt(r.retire.totalMonthly)} 元`, monthly: r.retire.monthly },
        { icon: "👨‍👩‍👧", label: "扶養", head: `可扶養約 ${r.support.kids.toFixed(2)} 位`, monthly: r.support.monthly },
        { icon: "✈️", label: "旅遊", head: `旅遊基金 ${ntfmt(r.travel.fund)} 元`, monthly: r.travel.monthly },
      ]
    : [];

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
          <button className="text-sm text-[#a7bacb] hover:text-white border border-white/15 rounded-lg px-3 py-1.5">登出</button>
        </SignOutButton>
      </header>

      <main className="flex-1 px-6 py-12">
        {r ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">MY LIFE PASSPORT</div>
              <h1 className="font-serif text-3xl mb-2">{name}，你的人生護照</h1>
              <p className="text-[#a7bacb] text-sm">依你目前的存錢規劃，每月應存合計</p>
              <div className="font-serif text-4xl text-[#e0bd8b] mt-2">{r.totalMonthlyWan.toFixed(1)} 萬</div>
            </div>

            <div className="rounded-2xl bg-[#12334f] border border-white/8 divide-y divide-white/8 mb-6">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                  <span className="flex items-center gap-3 text-[#cdd9e5]">
                    <span>{row.icon}</span>
                    <span>{row.label}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold text-[#e0bd8b]">{row.head}</span>
                    <span className="block text-[11px] text-[#6f869c]">月存 {row.monthly} 萬</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <Link href="/portal/plan" className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg text-sm">
                查看我的完整財務藍圖
              </Link>
              <Link href="/portal/setup" className="font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-2.5 rounded-lg text-sm">
                補資料 · 看缺口 · 選教練
              </Link>
              <Link href="/portal/passport" className="font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-2.5 rounded-lg text-sm">
                重新調整人生護照
              </Link>
            </div>

            {mustHave.length > 0 && (
              <div className="rounded-xl border border-white/8 bg-[#12334f] p-5 mb-6">
                <div className="text-[#e0bd8b] text-sm font-bold mb-1">你的必達目標 · 優先序</div>
                <p className="text-[11px] text-[#6f869c] mb-3">錢不夠時，我們會從順位在後的開始調整。可到「補資料」頁重新排。</p>
                <div className="flex flex-wrap gap-2">
                  {mustHave.map((t, i) => (
                    <span key={t} className="inline-flex items-center gap-2 rounded-lg bg-[#0a2137] border border-white/10 px-3 py-1.5">
                      <span className="font-serif text-[13px] font-extrabold text-[#e0bd8b]">{i + 1}</span>
                      <span className="text-[13px] text-[#cdd9e5]">{t}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[#c99a5b]/30 bg-[#0d2b45]/50 p-5 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-[#e0bd8b] mb-2">
                <span className="w-2 h-2 rounded-full bg-[#c99a5b]" />
                下一步：補完現況、選一位教練
              </div>
              <p className="text-[#a7bacb] text-sm leading-relaxed">
                填上基本資料與財務現況，看你的缺口與願景達成率；
                再選一位教練送出連結邀請，對方接受後就能一起把規劃做深。
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-lg mx-auto text-center pt-6">
            <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-3">MY FINANCIAL PLAN</div>
            <h1 className="font-serif text-3xl mb-4">{name}，歡迎回來</h1>
            <p className="text-[#a7bacb] leading-relaxed mb-8">
              你的專屬財務規劃，從「人生護照」開始——用購房、購車、退休、扶養、旅遊
              五個面向，設定你每月能存多少，即時算出你能達成什麼，完成後就成為你的第一份規劃基礎。
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
