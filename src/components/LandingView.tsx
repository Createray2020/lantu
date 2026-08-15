import Link from "next/link";

// 嵐途官網首頁內容（純呈現，無導向邏輯）。
// 由 `/`（未登入時）與 `/home`（常駐公開，已登入也能回來看）共用。
export default function LandingView() {
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      {/* 頂欄 */}
      <header className="sticky top-0 z-30 backdrop-blur bg-[#081a2b]/85 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/sign-in"
              className="text-sm text-[#a7bacb] hover:text-white px-3 py-2 rounded-lg border border-white/15"
            >
              教練登入
            </Link>
            <Link
              href="/client/sign-in"
              className="text-sm font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-4 py-2 rounded-lg"
            >
              客戶登入
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_400px_at_50%_-10%,rgba(201,154,91,0.16),transparent)]" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-16 text-center">
          <div className="text-[#c99a5b] text-xs tracking-[0.34em] mb-5">理解自己 · 做出選擇 · 走向未來</div>
          <h1 className="font-serif text-4xl sm:text-5xl leading-tight tracking-[0.02em] mb-6">
            把「想過的人生」<br className="sm:hidden" />算成<span className="text-[#e0bd8b]">看得見的財務規劃</span>
          </h1>
          <p className="max-w-2xl mx-auto text-[#a7bacb] text-base sm:text-lg leading-relaxed mb-10">
            嵐途是一套全方位的財務規劃系統。客戶可以自己動手規劃人生目標，
            教練則在同一份規劃上提供專業陪伴——兩端連結、同步協作，讓每一個決定都有依據。
          </p>

          {/* 雙入口 CTA */}
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto text-left">
            <div className="rounded-2xl border border-[#c99a5b]/40 bg-[#0d2b45]/60 p-6">
              <div className="text-xs tracking-[0.24em] text-[#c99a5b] mb-2">給客戶</div>
              <div className="font-serif text-xl mb-2">開始我的財務規劃</div>
              <p className="text-[#a7bacb] text-sm mb-5">從「人生護照」設定你的目標，免費建立專屬帳號。</p>
              <div className="flex items-center gap-3">
                <Link href="/client/sign-up" className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-5 py-2.5 rounded-lg text-sm">
                  免費申請帳號
                </Link>
                <Link href="/client/sign-in" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
                  已有帳號，登入
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#0d2b45]/40 p-6">
              <div className="text-xs tracking-[0.24em] text-[#a9bccf] mb-2">給教練</div>
              <div className="font-serif text-xl mb-2">財務教練專業工作台</div>
              <p className="text-[#a7bacb] text-sm mb-5">管理客戶、建立年度規劃、產出報告書與組織後台。</p>
              <div className="flex items-center gap-3">
                <Link href="/sign-in" className="font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-5 py-2.5 rounded-lg text-sm">
                  教練登入
                </Link>
                <Link href="/sign-up" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
                  申請加入
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 雙邊價值 */}
      <section className="border-t border-white/10 bg-[#0b2036]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-[#12334f] border border-white/8 p-7">
            <h2 className="font-serif text-2xl mb-4">對客戶</h2>
            <ul className="space-y-3 text-[#cdd9e5] text-sm leading-relaxed">
              <li>· 用五大人生目標（購房 / 購車 / 退休 / 扶養 / 旅遊）看清「每月該存多少」</li>
              <li>· 一張財務健康儀表：淨資產、財務階段、退休缺口一眼掌握</li>
              <li>· 現金流投影，看見未來每一年的收支與資產走勢</li>
              <li>· 想深入時，一鍵授權你信任的教練一起看、一起規劃</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-[#12334f] border border-white/8 p-7">
            <h2 className="font-serif text-2xl mb-4">對教練</h2>
            <ul className="space-y-3 text-[#cdd9e5] text-sm leading-relaxed">
              <li>· 客戶管理三層架構：客戶身份、年度版本、諮詢紀錄一條時間軸</li>
              <li>· 完整規劃引擎：保障中心、稅務、教育金、財務比率體檢</li>
              <li>· 品牌化報告書一鍵輸出，署名交付更專業</li>
              <li>· 組織後台：業績、活動量、增員、公告，帶團隊一起成長</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 功能特色 */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
        <div className="text-center mb-10">
          <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">FEATURES</div>
          <h2 className="font-serif text-3xl">一套系統，涵蓋規劃全流程</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ["人生護照", "五大目標一次盤點，算出每月應存，成為規劃的起點。"],
            ["財務健康儀表", "淨資產、財務階段、安全 / 自由 / 願景三度儀表。"],
            ["現金流投影", "逐年支出來源與收支結餘，資產走勢與缺口一目了然。"],
            ["保障中心", "壽險需求、責任遞減、保單盤點與五面向健檢。"],
            ["版本比較", "年度重製與規劃前後對照，看見每一次調整的成效。"],
            ["報告書", "品牌封面、責任聲明、教練總結，專業交付。"],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-xl bg-[#0d2b45] border border-white/8 p-5">
              <div className="font-serif text-lg mb-2 text-[#e0bd8b]">{title}</div>
              <p className="text-[#a7bacb] text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 規劃流程 */}
      <section className="border-t border-white/10 bg-[#0b2036]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <div className="text-center mb-10">
            <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">HOW IT WORKS</div>
            <h2 className="font-serif text-3xl">從一個念頭，到一份規劃</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              ["01", "設定目標", "註冊後用人生護照，把你最在意的目標一項項填上。"],
              ["02", "生成規劃", "存檔即成為你的第一份基礎方案，接進完整規劃結構。"],
              ["03", "連結教練", "需要專業時，授權你的教練一起檢視、優化、陪你執行。"],
            ].map(([n, t, d]) => (
              <div key={n} className="text-center px-4">
                <div className="font-serif text-3xl text-[#c99a5b] mb-3">{n}</div>
                <div className="font-semibold mb-2">{t}</div>
                <p className="text-[#a7bacb] text-sm leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-20 text-center">
        <h2 className="font-serif text-3xl mb-4">準備好開始了嗎？</h2>
        <p className="text-[#a7bacb] mb-8">今天就建立你的財務規劃，走向想過的人生。</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/client/sign-up" className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-7 py-3 rounded-lg">
            我是客戶，免費開始
          </Link>
          <Link href="/sign-in" className="font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-7 py-3 rounded-lg">
            我是教練，登入
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#6f869c]">
          <span className="font-serif tracking-[0.14em]">嵐途 LAN TU</span>
          <span>理解自己・做出選擇・走向未來</span>
        </div>
      </footer>
    </div>
  );
}
