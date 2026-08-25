import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { getAnDefaultPayload, anBoardRows } from "@/lib/anDefaults";
import { AN_MODULE_KEYS } from "@/lib/analysisModules";
import AnalysisDefaultBoard from "./AnalysisDefaultBoard";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function AnalysisDefaultsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [payload, brand] = await Promise.all([getAnDefaultPayload(), getBrand()]);

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
        <span className="text-[#a9bccf] text-xs">分析模組預設</span>
        <div className="flex-1" />
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-4xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">客戶分析頁 · 模組預設順序</h1>
          <p className="text-sm text-[#a9bccf] mt-1 leading-relaxed">
            決定教練打開客戶分析頁時，那一排模組<b className="text-[#e0bd8b]">第一時間</b>怎麼排、哪些先收起來。
            排在前面的是你希望大家一坐下來就先談的東西。
          </p>
        </div>
        <AnalysisDefaultBoard rows={anBoardRows(payload)} builtin={[...AN_MODULE_KEYS]} />
      </section>
    </main>
  );
}
