import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { getApplySettings } from "@/lib/coachApplyStore";
import { rankCaps } from "@/lib/quota";
import { RANK_ORDER } from "@/lib/license";
import AdminNav from "../AdminNav";
import ApplySettingsBoard from "./ApplySettingsBoard";

export const dynamic = "force-dynamic";

// 報聘設定：核准時自動帶什麼、放行前一定要打的勾。
// 與 /admin/analysis 同一層語意 —— 後台定一份、現場照著跑。
export default async function ApplySettingsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [settings, brand, caps] = await Promise.all([getApplySettings(), getBrand(), rankCaps()]);
  const rankCodes = [...RANK_ORDER, ...Object.keys(caps).filter((c) => !RANK_ORDER.includes(c as never))];

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
        <span className="text-[#a9bccf] text-xs">報聘設定</span>
        <div className="flex-1" />
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-3xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">報聘 · 核准預設值與審核檢核表</h1>
          <p className="text-sm text-[#a9bccf] mt-1 leading-relaxed">
            決定新教練<b className="text-[#e0bd8b]">核准開通那一刻</b>自動帶什麼（職級、上線、使用期限），
            以及審核者按下核准之前一定要打的勾。這裡改了不會回頭動已經開通的帳號。
          </p>
        </div>
        <ApplySettingsBoard settings={settings} rankCodes={rankCodes} />
      </section>
    </main>
  );
}
