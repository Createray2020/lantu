import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { listCategories } from "@/lib/financeCategories";
import { listEduCosts, defaultEduCosts } from "@/lib/eduCosts";
import { listBizTaxParams, defaultBizTaxRows, getBizTaxPayload } from "@/lib/bizTaxParams";
import CategoriesBoard from "./CategoriesBoard";
import BizTaxBoard from "./BizTaxBoard";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [rows, eduRows, brand, bizRows, bizPayload] = await Promise.all([
    listCategories(), listEduCosts(), getBrand(), listBizTaxParams(), getBizTaxPayload(),
  ]);
  // DB 有就用 DB 的，沒有那一列就顯示程式內建值（和前端 fallback 同一套語意）
  const bizByKey = new Map(bizRows.map((r) => [r.key, r]));
  const bizMerged = defaultBizTaxRows().map((d) => bizByKey.get(d.key) ?? d);

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
        <span className="text-[#a9bccf] text-xs">類別與參數設定</span>
        <div className="flex-1" />
        
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">收支資債類別・教育費用參數</h1>
          <p className="text-sm text-[#a9bccf] mt-1 leading-relaxed">
            這裡改的是<b className="text-[#e0bd8b]">全平台共用</b>的選項，所有教練即時生效（重新整理即可看到）。
            顆粒度愈細，之後的分析資料愈有得比——但同一個概念請只留一個名字，別出現同義詞。
          </p>
        </div>
        <CategoriesBoard rows={rows} eduRows={eduRows.length ? eduRows : defaultEduCosts()} />
        <BizTaxBoard rows={bizMerged} basis={bizPayload.basis} />
      </section>
    </main>
  );
}
