import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "加入嵐途 · 成為財務教練",
  description: "嵐途在找想用客觀、全面的方式解決客戶財務問題的人。這裡沒有話術訓練，只有一套把規劃做完整的系統。",
};

const LINE_URL = "https://line.me/R/ti/p/%40088janyq";
const LINE_ID = "@088janyq";

// 招募頁刻意獨立於首頁之外。
// 招募要講的（收入、創業、成長）與客戶端要講的（中立、不賣商品、站在你這邊）語氣互斥，
// 放同一頁會讓兩邊都失效——這是所有雙邊平台的共同做法。
//
// 這一版先上「定位＋自我篩選＋動線」；適合度測驗、階段培訓體系、
// 帶推薦人 ID 的報名表單留在下一輪（表單要有人接才有意義）。
export default function JoinPage() {
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <header className="sticky top-0 z-30 backdrop-blur bg-[#081a2b]/85 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
            <span className="grid place-items-center w-9 h-9 rounded-xl border border-[#c99a5b]">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
                <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="font-serif tracking-[0.12em] sm:tracking-[0.16em] text-[13px] sm:text-[15px] whitespace-nowrap">嵐途 LAN TU</span>
              <span className="hidden sm:block text-[9px] tracking-[0.3em] text-[#c99a5b]">JOIN US</span>
            </span>
          </Link>
          <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
             className="text-sm font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-4 py-2 rounded-lg">
            預約 1 對 1 說明
          </a>
        </div>
      </header>

      {/* Hero：問「你是不是這種人」，不是「我們在徵什麼職缺」 */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_400px_at_50%_-10%,rgba(201,154,91,0.16),transparent)]" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 pt-20 pb-14 text-center">
          <div className="text-[#c99a5b] text-xs tracking-[0.34em] mb-5">加入嵐途</div>
          <h1 className="font-serif text-[30px] sm:text-[42px] leading-[1.35] mb-6">
            如果你想做的是<br /><span className="text-[#e0bd8b]">把客戶的問題整個解決掉</span>
          </h1>
          <p className="text-[#a7bacb] text-base leading-relaxed">
            不是推一個商品、不是完成一張保單，而是把一個人的收入、支出、資產、負債、保障、稅、退休、
            子女教育整份攤開來算清楚，然後陪他走完。
            如果這是你想做的事，我們手上有一整套讓你做得到的工具。
          </p>
        </div>
      </section>

      {/* 系統武器展示：同業只能說「我們有完整系統」，我們可以直接讓他去玩 */}
      <section className="border-y border-white/10 bg-[#0b2036]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
          <div className="text-center mb-10">
            <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">你會拿到什麼</div>
            <h2 className="font-serif text-2xl sm:text-3xl mb-2">一套已經在跑的規劃系統</h2>
            <p className="text-[#a7bacb] text-sm">不是簡報上的示意圖。下面每一項都在線上運作中，你可以自己去按。</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              ["完整規劃引擎", "現金流逐年投影、退休缺口、保障需求與責任遞減、教育金、稅賦、24 項財務比率體檢——而且每個自動算出來的數字都能展開看計算明細。"],
              ["客戶自助入口", "客戶自己就能在官網做人生護照、建立第一份規劃，你接手時他已經填好一輪基本盤。"],
              ["品牌化報告書", "封面、責任聲明、諮詢同意、教練署名一鍵輸出，交付時不用再自己排版。"],
              ["版本紀錄與回復", "每次存檔留一版、標記是誰改的，客戶端與教練端兩條軌並行，改錯了可以回復。"],
              ["組織後台", "業績、活動量、增員、公告、晉升與維持資格全部制度化在系統裡，不靠口頭與私訊。"],
              ["業務制度系統化", "分潤、服務模塊、案件分潤、結案問卷都寫進系統可查——制度是什麼就跑什麼。"],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl bg-[#0d2b45] border border-white/8 p-5">
                <div className="font-serif text-[17px] mb-2 text-[#e0bd8b]">{t}</div>
                <p className="text-[#a7bacb] text-sm leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/passport" className="inline-block text-sm font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-3 rounded-lg">
              直接去玩玩看客戶端的試算 →
            </Link>
          </div>
        </div>
      </section>

      {/* 誠實聲明：全台只有一家同業敢寫，而它是最有記憶點的一段 */}
      <section className="max-w-3xl mx-auto px-5 sm:px-8 py-16">
        <h2 className="font-serif text-2xl sm:text-3xl mb-3">先說這條路不適合誰</h2>
        <p className="text-[#a7bacb] text-sm mb-6">與其讓你來了才發現不對，不如現在就講清楚。以下任何一條你看了會皺眉，這裡大概不適合你。</p>
        <ul className="space-y-3">
          {[
            "你想要一份穩定月薪。收入跟你創造的價值連動，前期一定有起伏。",
            "你希望公司給你名單。名單要自己長出來，我們給的是讓你長得出來的方法與工具。",
            "你想快速成交。做完一份完整規劃要花好幾個小時，客戶才會信任你——這條路一開始比話術慢。",
            "你不想碰數字。這份工作有很大一部分是把別人的財務整份算清楚。",
            "你不想讓人看你的過程。規劃是攤開來跟客戶一起做的，包含你的假設與依據。",
          ].map((t) => (
            <li key={t} className="flex gap-3 text-[#cdd9e5] text-[15px] leading-relaxed">
              <span className="text-[#d9705a] shrink-0">✕</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 身分分流：不同起點需要的東西不同 */}
      <section className="border-t border-white/10 bg-[#0b2036]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
          <div className="text-center mb-9">
            <h2 className="font-serif text-2xl sm:text-3xl mb-2">你現在的起點是？</h2>
            <p className="text-[#a7bacb] text-sm">起點不同，前面幾個月要走的路不一樣。</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              ["同業轉型", "已經在金融或保險業", "你缺的通常不是業務能力，是一套能把規劃做完整、講得清楚的工具與方法。"],
              ["跨業轉職", "有社會經驗，想換一條路", "從財務規劃的知識底子開始建，先把自己的財務算清楚，再學怎麼幫別人算。"],
              ["應屆／在學", "剛畢業或還在唸書", "從基本功與證照開始，跟著資深教練實際跑案，先看懂一份完整規劃長什麼樣。"],
            ].map(([t, who, d]) => (
              <div key={t} className="rounded-xl bg-[#12334f] border border-white/8 p-5">
                <div className="text-[11px] tracking-[0.2em] text-[#c99a5b] mb-2">{who}</div>
                <div className="font-serif text-lg mb-2">{t}</div>
                <p className="text-[#a7bacb] text-sm leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 流程：第一步降到最低承諾 */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
        <div className="text-center mb-10">
          <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">接下來會發生什麼</div>
          <h2 className="font-serif text-2xl sm:text-3xl">從聊聊開始，不是從應徵開始</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            ["01", "1 對 1 說明", "約 1 小時", "先聊你想解決什麼、我們在做什麼。這一步不用準備履歷。"],
            ["02", "實際看系統", "約 1 小時", "打開後台，看真實的規劃流程與報告書，判斷這是不是你要的工具。"],
            ["03", "談清楚制度", "約 1 小時", "分潤、晉升、維持資格全部攤開來看，你可以帶回去算。"],
          ].map(([n, t, dur, d]) => (
            <div key={n} className="text-center px-4">
              <div className="font-serif text-3xl text-[#c99a5b] mb-3">{n}</div>
              <div className="font-semibold mb-1">{t}</div>
              <div className="text-[11px] text-[#c99a5b] mb-2">{dur}</div>
              <p className="text-[#a7bacb] text-sm leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0b2036]">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl mb-3">想先聊聊看嗎？</h2>
          <p className="text-[#a7bacb] mb-8">第一步只是一次對話，不用履歷，也不用先決定什麼。</p>
          <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
             className="inline-block font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-8 py-3.5 rounded-lg text-[15px]">
            用 LINE 預約 1 對 1 說明
          </a>
          <div className="mt-3 text-[12px] text-[#6f869c]">LINE 官方帳號 {LINE_ID}</div>

          {/* 已經談過、或直接就想申請的人，之前只能等我們私訊給網址。
              LINE 預約仍是主 CTA，這顆是次要動作。/apply 會自己分岔到註冊或申請頁。 */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-[#a7bacb] text-sm mb-3">已經談過了，或想直接提出申請？</p>
            <Link href="/apply"
                  className="inline-block text-sm font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-2.5 rounded-lg">
              直接送出教練申請 →
            </Link>
            <div className="mt-2 text-[12px] text-[#6f869c]">送出後由嵐途審核（含費用確認），開通才進得了系統。</div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#6f869c]">
          <span className="font-serif tracking-[0.14em]">嵐途 LAN TU</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-[#a7bacb]">已經是嵐途教練？登入</Link>
            <Link href="/home" className="hover:text-[#a7bacb]">← 回官網首頁</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
