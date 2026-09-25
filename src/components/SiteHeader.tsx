import Link from "next/link";
import BrandMark from "./BrandMark";
import { getSiteNav } from "@/lib/siteNavStore";
import { visibleNav, type NavItem } from "@/lib/siteNav";

// 官網頂欄。項目由後台「官網頂欄」編輯（/admin/site-nav），樣式定案＝原型 E「細框＋滑過填色」：
// 平常 1px 淡框、字色偏淡，滑過才亮起來；主要按鈕維持實心金色，永遠是最醒目的那一顆。
//
// 手機：沒勾「手機也露出」的項目收進 ☰。用 <details> 而不是 client state——
// 這樣整條頂欄仍是 server component，不為了一顆展開鈕把資料拖進 client bundle。

// ⚠️ 不放 display：手機收進 ☰ 的項目要用 hidden md:inline-flex，兩個 display 類別同時出現時誰贏看 CSS 順序，不可靠。
const ITEM =
  "items-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition-colors";

export function navItemClass(style: NavItem["style"]): string {
  if (style === "primary") return `${ITEM} border-brand bg-brand text-onbrand font-bold hover:bg-brand2 hover:border-brand2`;
  if (style === "outline") return `${ITEM} border-line2 text-tx hover:bg-panel2`;
  return `${ITEM} border-line text-tx2 hover:bg-panel2 hover:border-panel2 hover:text-tx`;
}

function NavLink({ it, className }: { it: NavItem; className: string }) {
  if (it.kind === "ext") {
    return (
      <a href={it.href} className={className} {...(it.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {it.text}
      </a>
    );
  }
  return <Link href={it.href} className={className}>{it.text}</Link>;
}

export default async function SiteHeader({ tagline = "FINANCIAL PLANNING" }: { tagline?: string }) {
  const { items } = await getSiteNav();
  const vis = visibleNav(items);
  const folded = vis.filter((i) => !i.mobile);

  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-canvas/85 border-b border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center gap-3">
        <Link href="/home" className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink-0" title="回官網首頁">
          <BrandMark />
          <span className="flex flex-col leading-tight min-w-0">
            <span className="font-serif tracking-[0.12em] sm:tracking-[0.16em] text-13 sm:text-15 whitespace-nowrap">嵐途 LAN TU</span>
            <span className="hidden sm:block text-10 tracking-[0.3em] text-brand">{tagline}</span>
          </span>
        </Link>
        <nav aria-label="官網選單" className="ml-auto flex items-center gap-2">
          {vis.map((it) => (
            <NavLink key={it.id} it={it} className={`${navItemClass(it.style)} ${it.mobile ? "inline-flex" : "hidden md:inline-flex"}`} />
          ))}
          {folded.length > 0 && (
            <details className="relative md:hidden">
              <summary
                aria-label="更多選單"
                className="list-none cursor-pointer grid place-items-center w-9 h-9 rounded-lg border border-line text-tx2 hover:text-tx [&::-webkit-details-marker]:hidden"
              >
                ☰
              </summary>
              <div className="absolute right-0 mt-2 min-w-44 rounded-xl border border-line bg-panel shadow-e1 p-1.5 flex flex-col">
                {folded.map((it) => (
                  <NavLink key={it.id} it={it} className="px-3 py-2.5 rounded-lg text-sm text-tx hover:bg-panel2" />
                ))}
              </div>
            </details>
          )}
        </nav>
      </div>
    </header>
  );
}
