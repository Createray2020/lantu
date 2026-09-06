import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { DEFAULT_UI_SCALE } from "@/lib/uiScale";
import { DEFAULT_THEME, normalizeTheme } from "@/lib/theme";
import UiScaleToggle from "@/components/UiScaleToggle";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * 後台各頁共用頂欄。
 *
 * 改版前這一段是逐字複製在 15 支 admin/*\/page.tsx 裡的（只有 label 與 max-w 不同），
 * 於是：① 要在頂欄加任何東西就得改 15 個地方；② 後台完全沒有字級與主題切換，
 * 教練在教練端調好的介面，一進後台就跑掉。收成一支之後兩件事一起解決。
 *
 * 額外連結用 children 傳（例如分潤試算器頁的「← 回系統」以外的捷徑）；
 * 「← 回系統」一律由這裡出，不要再各頁自己補一顆——原本就有的頁面有、沒有的頁面沒有。
 */
export default async function AdminHeader({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  const [brand, me] = await Promise.all([getBrand(), ensureCoach()]);
  return (
    // ⚠️ flex-wrap 不能省：右側那組（主題 88px＋字級 122px＋回系統＋頭貼）是不可壓縮的，
    //    390px 扣掉內距只剩約 358px，沒有 wrap 就是把最右邊的東西推出畫面。
    //    刻意不用 hidden sm:* 把切換鈕藏起來——字級切換正是給老花用的，
    //    在手機上更需要，寧可頂欄多一列。
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 sm:px-6 py-2.5 border-b border-line bg-panel">
      <Link href="/home" className="flex items-center gap-3 min-w-0" title="回官網首頁">
        {brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
        )}
        <span className="font-serif text-lg tracking-[0.14em] truncate">嵐途 LAN TU</span>
      </Link>
      <span className="text-tx2 text-xs">{label}</span>
      <div className="flex-1" />
      {children}
      <ThemeToggle initial={normalizeTheme(me?.theme ?? DEFAULT_THEME)} persist={!!me} compact />
      <UiScaleToggle initial={me?.uiScale ?? DEFAULT_UI_SCALE} persist={!!me} compact />
      <Link href="/dashboard" className="text-tx2 text-sm hover:text-tx whitespace-nowrap">
        ← 回系統
      </Link>
      <UserButton />
    </header>
  );
}
