import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import BrandSettings from "../BrandSettings";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

// 品牌設定原本內嵌在 /admin 首頁（教練帳號管理）底下，跟名單擠在同一頁、也沒有自己的入口。
// 抽成獨立頁後首頁回歸單一職責，這頁也才進得了「系統設定」那一組。
export default async function BrandPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const brand = await getBrand();

  return (
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
          )}
          <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        </Link>
        <span className="text-[#a9bccf] text-xs">教練管理後台</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[#a9bccf] text-sm hover:text-white">← 回系統</Link>
        <UserButton />
      </header>
      <AdminNav />
      <section className="p-6 max-w-4xl">
        <h1 className="text-xl font-bold mb-1">品牌設定</h1>
        <p className="text-[#a9bccf] text-sm mb-5">Logo 會套用到系統頂欄、報告書封面、瀏覽器分頁圖示與 PWA 圖示。</p>
        <BrandSettings currentLogo={brand.logoUrl} />
      </section>
    </main>
  );
}
