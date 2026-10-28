import Link from "next/link";
import BrandMark from "@/components/BrandMark";

// 隱私權政策／服務條款共用的版型（2026/10/28）。
// 這兩頁是 Google OAuth 對外發布的硬條件（品牌頁要有同網域的隱私權政策與服務條款連結），
// 也是上線前待辦的一項。版型沿用 /join 的頂欄，內文只用段落與清單，不做任何互動。
export type LegalSection = { title: string; paras?: string[]; items?: string[] };

export default function LegalPage({ title, subtitle, version, sections }: {
  title: string; subtitle: string; version: string; sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-canvas text-tx">
      <header className="sticky top-0 z-30 backdrop-blur bg-canvas/85 border-b border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
            <BrandMark />
            <span className="flex flex-col leading-tight min-w-0">
              <span className="font-serif tracking-[0.12em] sm:tracking-[0.16em] text-13 sm:text-15 whitespace-nowrap">嵐途 LAN TU</span>
              <span className="hidden sm:block text-10 tracking-[0.3em] text-brand">FINANCIAL PLANNING</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-tx3">
            <Link href="/privacy" className="hover:text-tx2">隱私權政策</Link>
            <Link href="/terms" className="hover:text-tx2">服務條款</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 pt-14 pb-20">
        <div className="text-brand text-xs tracking-[0.34em] mb-4">{subtitle}</div>
        <h1 className="font-serif text-3xl sm:text-[36px] leading-[1.35] mb-3">{title}</h1>
        <p className="text-tx3 text-sm mb-10">版本日期：{version}</p>

        <div className="space-y-9">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="font-serif text-xl text-brand2 mb-3">{i + 1}. {s.title}</h2>
              {s.paras?.map((p, j) => (
                <p key={j} className="text-tx2 leading-relaxed mb-2">{p}</p>
              ))}
              {s.items && (
                <ul className="list-disc pl-6 space-y-1.5 text-tx2 leading-relaxed">
                  {s.items.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-tx3">
          <span className="font-serif tracking-[0.14em]">嵐途 LAN TU</span>
          <div className="flex items-center gap-4">
            <Link href="/home" className="hover:text-tx2">官網首頁</Link>
            <Link href="/privacy" className="hover:text-tx2">隱私權政策</Link>
            <Link href="/terms" className="hover:text-tx2">服務條款</Link>
          </div>
          <span>理解自己・做出選擇・走向未來</span>
        </div>
      </footer>
    </div>
  );
}
