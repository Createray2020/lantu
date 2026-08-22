import Link from "next/link";
import HeroCalc from "./HeroCalc";
import UiScaleToggle from "./UiScaleToggle";
import { getLandingStats } from "@/lib/landing";
import { listPublicCoaches } from "@/lib/coachProfile";

const LINE_ID = "@088janyq";
const LINE_URL = "https://line.me/R/ti/p/%40088janyq";

// 嵐途官網首頁內容。由 `/`（未登入時）與 `/home`（常駐公開，已登入也能回來看）共用。
//
// 版型＝「試算開路」：第一屏就是可以動的試算，不是一顆「開始試算」按鈕。
// 招募走獨立的 /join，首頁只在頁尾放一張分流卡——
// 招募要講的（收入、創業、上不封頂）跟客戶端要講的（中立、不賣商品）語氣互斥，
// 同一頁並存會讓中立性當場破功。
export default async function LandingView() {
  const [stats, coaches] = await Promise.all([getLandingStats(), listPublicCoaches()]);
  const faces = coaches.slice(0, 6);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      {/* 頂欄：4 項以內。主 CTA 是「免費試算」而不是「客戶登入」—— */}
      {/* 登入是給老客戶的，第一次來的人按不下去。 */}
      <header className="sticky top-0 z-30 backdrop-blur bg-[#081a2b]/85 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2.5 sm:gap-3 min-w-0" title="回官網首頁">
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
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* 字級切換：官網也放，看不清楚字的人在第一屏就要能放大，不必先登入 */}
            <UiScaleToggle compact />
            <Link href="/coaches" className="hidden sm:inline text-sm text-[#a7bacb] hover:text-white px-3 py-2 rounded-lg whitespace-nowrap">認識教練</Link>
            <Link href="/login" className="text-[13px] sm:text-sm text-[#a7bacb] hover:text-white px-2 sm:px-3 py-2 rounded-lg sm:border sm:border-white/15 whitespace-nowrap">登入</Link>
            <Link href="/passport" className="text-[13px] sm:text-sm font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-3.5 sm:px-4 py-2 rounded-lg whitespace-nowrap">免費試算</Link>
          </div>
        </div>
      </header>

      {/* Hero：標語 ＋ 差異化一行 ＋ 可以馬上動的試算 */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_400px_at_50%_-10%,rgba(201,154,91,0.16),transparent)]" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-14">
          <div className="grid lg:grid-cols-[1fr_minmax(0,520px)] gap-10 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="text-[#c99a5b] text-xs tracking-[0.34em] mb-5">理解自己 · 做出選擇 · 走向未來</div>
              <h1 className="font-serif text-[32px] sm:text-5xl leading-[1.3] tracking-[0.02em] mb-5">
                你不是不會理財，<br />
                是<span className="text-[#e0bd8b]">沒人幫你把數字算完</span>
              </h1>
              <p className="text-[#a7bacb] text-base sm:text-lg leading-relaxed mb-6">
                退休要準備多少、房子什麼時候買得起、小孩養不養得起——
                這些問題都有答案，只是要有人把它算出來。填四個數字，馬上看到你的第一個答案。
              </p>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-[12.5px]">
                {["不用註冊", "不賣金融商品", "3 分鐘看到結果"].map((t) => (
                  <span key={t} className="rounded-full border border-[#c99a5b]/40 text-[#e0bd8b] px-3 py-1">{t}</span>
                ))}
              </div>
            </div>
            <HeroCalc />
          </div>
        </div>
      </section>

      {/* 信任數字：全部取自實際資料，並標明截止月份 */}
      <section className="border-y border-white/10 bg-[#0b2036]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-7 grid grid-cols-3 gap-4 text-center">
          {[
            [stats.coaches, "位認證教練"],
            [stats.plans, "份已完成的規劃"],
            [stats.specialties, "個專長領域"],
          ].map(([n, label]) => (
            <div key={label as string}>
              <div className="font-serif text-2xl sm:text-3xl text-[#e0bd8b]">{n as number}</div>
              <div className="text-[11.5px] sm:text-[13px] text-[#a7bacb] mt-1">{label as string}</div>
            </div>
          ))}
        </div>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-5 text-center text-[10.5px] text-[#6f869c]">
          截至 {stats.asOf}
        </div>
      </section>

      {/* 服務網格：用客戶會問的問題當標題，不是我們的功能名 */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
        <div className="text-center mb-10">
          <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">我們幫你算清楚</div>
          <h2 className="font-serif text-2xl sm:text-3xl">這些問題，一份規劃全部回答</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ["我每個月到底該存多少？", "五大人生目標一次盤點，算出每月應存，這是所有規劃的起點。"],
            ["我幾歲才退得了休？", "自行準備＋勞退＋勞保三根柱子分開算，缺口一目了然。"],
            ["這間房我買得起嗎？", "從你存得下來的錢反推可負擔的總價、自備款與每月還款。"],
            ["小孩養到大要多少錢？", "依學制與學費上漲率逐年推算，從出生算到你設定的年齡。"],
            ["我的保障夠不夠？", "壽險需求、責任遞減、既有保單盤點，缺口與重複一起看。"],
            ["我現在的財務算健康嗎？", "淨資產、財務階段、24 項財務比率體檢，附完整計算明細。"],
          ].map(([q, a]) => (
            <div key={q} className="rounded-xl bg-[#0d2b45] border border-white/8 p-5">
              <div className="font-serif text-[17px] mb-2 text-[#e0bd8b]">{q}</div>
              <p className="text-[#a7bacb] text-sm leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 流程：每一步標「要花你多久」——同業幾乎沒人標，這是降低不確定感最便宜的做法 */}
      <section className="border-t border-white/10 bg-[#0b2036]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <div className="text-center mb-10">
            <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">HOW IT WORKS</div>
            <h2 className="font-serif text-2xl sm:text-3xl">從一個念頭，到一份規劃</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              ["01", "自己先算一次", "約 3 分鐘", "不用註冊，把五大目標填一填，先看到自己的數字。"],
              ["02", "存檔建立規劃", "約 1 分鐘", "滿意再開帳號，試算結果直接變成你的第一份規劃。"],
              ["03", "找教練一起看", "首次面談約 1 小時", "需要專業時，授權你信任的教練一起檢視、優化、陪你執行。"],
            ].map(([n, t, dur, d]) => (
              <div key={n} className="text-center px-4">
                <div className="font-serif text-3xl text-[#c99a5b] mb-3">{n}</div>
                <div className="font-semibold mb-1">{t}</div>
                <div className="text-[11px] text-[#c99a5b] mb-2">{dur}</div>
                <p className="text-[#a7bacb] text-sm leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 教練臉孔牆：財務規劃是人的生意，讓訪客看到人 */}
      {faces.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <div className="text-center mb-9">
            <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">MEET THE COACHES</div>
            <h2 className="font-serif text-2xl sm:text-3xl mb-2">陪你走的人</h2>
            <p className="text-[#a7bacb] text-sm">每位教練都有自己寫的完整檔案，可以先看過再決定。</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {faces.map((c) => (
              <Link key={c.id} href={`/coaches/${c.id}`} className="group text-center">
                {c.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.photoUrl}
                    alt={c.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-square rounded-xl object-cover border border-white/15 group-hover:border-[#c99a5b] transition"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-[#12334f] border border-white/10 grid place-items-center text-3xl text-[#c99a5b]">
                    {c.name.slice(0, 1)}
                  </div>
                )}
                <div className="text-sm mt-2 group-hover:text-[#e0bd8b]">{c.name}</div>
                {c.specialties[0] && <div className="text-[11px] text-[#6f869c] truncate">{c.specialties[0]}</div>}
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/coaches" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
              看全部教練與專長 →
            </Link>
          </div>
        </section>
      )}

      {/* 結尾：一顆 CTA。原本三顆並排等於零顆。 */}
      <section className="border-t border-white/10 bg-[#0b2036]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl mb-3">先看到數字，再決定要不要找人</h2>
          <p className="text-[#a7bacb] mb-8">不用留電話、不用註冊，三分鐘就有結果。</p>
          <Link href="/passport" className="inline-block font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-8 py-3.5 rounded-lg text-[15px]">
            免費試算我的人生護照
          </Link>
          <div className="mt-5 text-sm">
            <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="text-[#a7bacb] hover:text-white underline underline-offset-4">
              或加 LINE 直接問我們（{LINE_ID}）
            </a>
          </div>
        </div>
      </section>

      {/* 企業主分流卡：客單價最高的客群，入口與人生護照對等但不搶首頁主動線 */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-10">
        <div className="rounded-2xl border border-white/10 bg-[#0d2b45] px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="font-serif text-lg text-[#e0bd8b]">你是企業主嗎？</div>
            <p className="text-[#a7bacb] text-sm mt-1">
              十個問題、兩分鐘，看清楚你的公司與個人財務界線在哪裡。同樣不用註冊。
            </p>
          </div>
          <Link href="/bizcheck" className="shrink-0 text-sm font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-2.5 rounded-lg">
            企業主財務自我檢核 →
          </Link>
        </div>
      </section>

      {/* 頁尾招募分流卡：接住剛好逛進來的同業，但不佔首頁版位 */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <div className="rounded-2xl border border-white/10 bg-[#0d2b45] px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="font-serif text-lg text-[#e0bd8b]">你是財務從業人員嗎？</div>
            <p className="text-[#a7bacb] text-sm mt-1">嵐途在找想用客觀、全面的方式解決客戶財務問題的人。</p>
          </div>
          <Link href="/join" className="shrink-0 text-sm font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-2.5 rounded-lg">
            了解加入嵐途 →
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 pb-24 sm:pb-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#6f869c]">
          <span className="font-serif tracking-[0.14em]">嵐途 LAN TU</span>
          <div className="flex items-center gap-4">
            <Link href="/coaches" className="hover:text-[#a7bacb]">認識教練</Link>
            <Link href="/passport" className="hover:text-[#a7bacb]">免費試算</Link>
            <Link href="/join" className="hover:text-[#a7bacb]">加入我們</Link>
          </div>
          <span>理解自己・做出選擇・走向未來</span>
        </div>
      </footer>

      {/* 手機底部固定 CTA：行動流量近六成，且多數是單手拇指操作 */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b2036]/95 backdrop-blur border-t border-[#c99a5b]/40 px-4 py-3">
        <Link href="/passport" className="block text-center font-bold text-[#08202a] bg-[#c99a5b] px-6 py-3 rounded-lg">
          免費試算我的人生護照
        </Link>
      </div>
    </div>
  );
}
