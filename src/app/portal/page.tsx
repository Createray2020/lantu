import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ensureClientUser } from "@/lib/clientUser";
import { listClientCases } from "@/lib/comp/survey";
import { getClientOwnPlan, getClientSetup } from "@/lib/clientPlan";
import { normalizeIntent } from "@/lib/intent";
import UiScaleToggle from "@/components/UiScaleToggle";
import { computePassport, wan, ntfmt } from "@/lib/passport";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";

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
  // ⚠️ 這一頁的數字一律走 src/lib/passport.ts 的 computePassport()——
  //    也就是 fv / pmt / annuityPayout / loanAbility / retireAbility / supportAbility / travelAbility
  //    那一整組唯一真相，不在這裡重抄一份公式。
  //    存檔時算過一次的 own.result 只當作沒有 inputs（很舊的資料）時的退路。
  const r = own?.passport ? computePassport(own.passport) : (own?.result ?? null);
  const setup = await getClientSetup(client.id);
  // 待填回饋問卷：制度上問卷回收才算結案，所以這是客戶端的主動提示而不是被動等通知。
  const pendingSurveys = (await listClientCases(client.id)).filter((c) => !c.surveyAt).length;
  const mustHave = setup.intent ? normalizeIntent({ ...setup.intent }).mustHave : [];
  // 教練↔客戶是雙棲的：教練也會用客戶介面做自己的規劃。
  // 但這裡原本沒有任何回教練端的路——進來就出不去，只能登出或自己打網址。
  // 教練端頁首早就有「我的規劃」指過來，這條是把單向補成雙向。
  const isCoach = (await db.select({ id: coaches.id }).from(coaches).where(eq(coaches.id, client.id)).limit(1)).length > 0;

  // 五個面向的顏色。刻意**不動用** #ef6f6f（缺口）與 #f0c34e（可投資資產本金）這兩個
  // 全站既有的語意色——這裡的五段只是身分類別，沒有好壞。
  // （dataviz 驗證器 --mode dark --surface #12334f：CVD / 常視 / 對比三項 PASS。）
  const FACE_COLORS = ["#5b93d6", "#5cc08a", "#b07d3d", "#7fb0e6", "#e0bd8b"];

  const rows = r
    ? [
        { icon: "🏠", label: "購房", head: `可購房價 ${wan(r.house.price)} 萬`, monthly: r.house.monthly },
        { icon: "🚗", label: "購車", head: `可購車價 ${wan(r.car.price)} 萬`, monthly: r.car.monthly },
        { icon: "🌴", label: "退休", head: `退休月領 ${ntfmt(r.retire.totalMonthly)} 元`, monthly: r.retire.monthly },
        { icon: "👨‍👩‍👧", label: "扶養", head: `可扶養約 ${r.support.kids.toFixed(2)} 位`, monthly: r.support.monthly },
        { icon: "✈️", label: "旅遊", head: `旅遊基金 ${ntfmt(r.travel.fund)} 元`, monthly: r.travel.monthly },
      ]
    : [];

  // 一條水平堆疊條：這筆月存，五個面向各佔多少。
  // ⚠️ 直接標籤優先——塞得下就寫「面向 X萬」，只塞得下兩個字就寫面向名，都塞不下才交給下方圖例。
  //    門檻是量出來的（11px 粗體：「購車 1萬」42px、「退休」22px）。
  // ⚠️⚠️ 門檻是**比例**、條寬卻會隨螢幕縮，所以一組門檻不夠用：
  //    桌機（sm 以上）整條 ≈ 630px → 13% ≈ 82px、6.5% ≈ 41px，兩種標籤都放得下；
  //    360px 的手機整條只剩 ≈ 270px → 同一個 13% 的段只有 39px，標籤會溢出去疊到隔壁色塊
  //    （實測 iPhone SE 有三段互疊）。所以手機用一組照 270px 重算的門檻（32% / 17%），
  //    塞不下的一律交給下方圖例——這正是原本設計的第三檔，不是新規則。
  //    每一段另外掛 overflow-hidden 當最後的安全網。
  const totalWan = rows.reduce((sum, x) => sum + x.monthly, 0);
  const segments = rows.map((row, i) => {
    const pct = totalWan > 0 ? (row.monthly / totalWan) * 100 : 0;
    const full = `${row.label} ${row.monthly}萬`;
    return {
      ...row,
      pct,
      color: FACE_COLORS[i],
      inner: pct >= 13 ? full : pct >= 6.5 ? row.label : "",
      innerNarrow: pct >= 32 ? full : pct >= 17 ? row.label : "",
    };
  });

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7] flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-white/10">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          <span className="grid place-items-center w-9 h-9 rounded-xl border border-[#c99a5b]">
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
              <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-serif tracking-[0.14em] text-lg">嵐途 LAN TU</span>
        </Link>
        <div className="flex items-center gap-2">
          <UiScaleToggle compact />
          {isCoach && (
            <Link
              href="/dashboard"
              className="text-[13px] sm:text-sm text-[#a7bacb] hover:text-white border border-white/15 rounded-lg px-2.5 sm:px-3 py-1.5 whitespace-nowrap"
            >
              教練工作台
            </Link>
          )}
          <SignOutButton redirectUrl="/">
            <button className="text-[13px] sm:text-sm text-[#a7bacb] hover:text-white border border-white/15 rounded-lg px-2.5 sm:px-3 py-1.5">登出</button>
          </SignOutButton>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        {pendingSurveys > 0 && (
          <div className="max-w-2xl mx-auto mb-6 rounded-xl border border-[#c99a5b]/40 bg-[#c99a5b]/10 px-5 py-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-[#e0bd8b] flex-1">
              有 <b>{pendingSurveys}</b> 份服務回饋等你填寫，大約兩分鐘。
            </span>
            <Link href="/portal/survey"
              className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-4 py-2 rounded-lg text-sm">
              前往填寫
            </Link>
          </div>
        )}
        {r ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">MY LIFE PASSPORT</div>
              <h1 className="font-serif text-3xl mb-2">{name}，你的人生護照</h1>
              {setup.code && (
                <div className="font-mono text-[11px] tracking-[0.2em] text-[#6f869c] mb-2" title="你的客戶編號">
                  客戶編號 {setup.code}
                </div>
              )}
              <p className="text-[#a7bacb] text-sm">依你目前的存錢規劃，每月應存合計</p>
              <div className="font-serif text-4xl text-[#e0bd8b] mt-2">{r.totalMonthlyWan.toFixed(1)} 萬</div>
            </div>

            <div className="rounded-2xl bg-[#12334f] border border-white/8 p-5 mb-6">
              <div className="text-[12.5px] text-[#a7bacb] mb-2">
                這 {r.totalMonthlyWan.toFixed(1)} 萬，五個面向各佔多少
              </div>
              <div className="flex h-[26px] rounded-md overflow-hidden bg-white/5">
                {segments.map((seg) => (
                  <span
                    key={seg.label}
                    title={`${seg.label} 月存 ${seg.monthly} 萬`}
                    className="flex items-center justify-center overflow-hidden text-[11px] font-extrabold text-[#08202a] whitespace-nowrap"
                    style={{ width: `calc(${seg.pct.toFixed(1)}% - 2px)`, marginRight: 2, background: seg.color }}
                  >
                    <span className="sm:hidden">{seg.innerNarrow}</span>
                    <span className="hidden sm:inline">{seg.inner}</span>
                  </span>
                ))}
              </div>
              {/* 圖例是完整的——條上塞不下標籤的那幾段，答案在這裡。 */}
              <div className="grid gap-y-1.5 gap-x-4 mt-3 sm:grid-cols-2">
                {segments.map((seg) => (
                  <div key={seg.label} className="flex items-center gap-2 text-[12px] text-[#a7bacb]">
                    <span className="w-[11px] h-[11px] rounded-[3px] shrink-0" style={{ background: seg.color }} />
                    <b className="text-[#cdd9e5] font-bold">{seg.label}</b>
                    <span>{seg.head}</span>
                    <span className="ml-auto text-[#6f869c] tabular-nums">月存 {seg.monthly} 萬</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 四顆同權重的 CTA 等於沒有 CTA——降成一主三次，主行動只留「看完整藍圖」。 */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 mb-8">
              <Link href="/portal/plan" className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg text-sm">
                查看我的完整財務藍圖
              </Link>
              <Link href="/portal/setup" className="text-[12.5px] text-[#a7bacb] hover:text-white underline underline-offset-[3px]">
                補資料 · 看缺口 · 選教練
              </Link>
              <Link href="/portal/passport" className="text-[12.5px] text-[#a7bacb] hover:text-white underline underline-offset-[3px]">
                重新調整人生護照
              </Link>
              <Link href="/portal/history" className="text-[12.5px] text-[#a7bacb] hover:text-white underline underline-offset-[3px]">
                版本紀錄
              </Link>
            </div>

            {/* 必達目標與下一步都是「還可以再看」的內容，收起來讓大數字與那條帶子先講完話。 */}
            <details className="rounded-xl border border-white/8 bg-[#12334f] overflow-hidden">
              <summary className="cursor-pointer px-5 py-3 text-[13px] font-bold text-[#e0bd8b] list-none">
                必達目標優先序與下一步
              </summary>
              <div className="px-5 pb-5">
                {mustHave.length > 0 ? (
                  <>
                    <p className="text-[11px] text-[#6f869c] mb-3">錢不夠時，我們會從順位在後的開始調整。可到「補資料」頁重新排。</p>
                    <div className="flex flex-wrap gap-2">
                      {mustHave.map((t, i) => (
                        <span key={t} className="inline-flex items-center gap-2 rounded-lg bg-[#0a2137] border border-white/10 px-3 py-1.5">
                          <span className="font-serif text-[13px] font-extrabold text-[#e0bd8b]">{i + 1}</span>
                          <span className="text-[13px] text-[#cdd9e5]">{t}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-[#6f869c]">尚未設定必達目標。到「補資料」頁就能排。</p>
                )}
                <p className="text-[#a7bacb] text-[13px] leading-relaxed mt-4">
                  下一步：補完現況、選一位教練——填上基本資料與財務現況，看你的缺口與願景達成率；
                  再選一位教練送出連結邀請，對方接受後就能一起把規劃做深。
                </p>
              </div>
            </details>
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
