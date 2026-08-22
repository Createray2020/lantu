import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { ensureActiveVersion, listVersions, loadParams } from "@/lib/comp/repo";
import SystemEditor from "./SystemEditor";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function SystemPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const sp = await searchParams;
  const active = await ensureActiveVersion();
  const versions = await listVersions();
  // ?v= 指到不存在的版本時退回生效版，而不是丟 404 —— 版本被封存／刪掉時網址還在手上是常態。
  const versionId = versions.some((x) => x.id === sp.v) ? sp.v! : active.id;
  const params = await loadParams(versionId);
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
        <span className="text-[#a9bccf] text-xs">業務制度</span>
        <div className="flex-1" />
        
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">財務顧問業務制度</h1>
          <p className="text-sm text-[#a9bccf] mt-1 leading-relaxed">
            所有數字欄位預設留空。<b className="text-[#e0bd8b]">留空＝該門檻不檢查、該規則不計算</b>，
            不是 0；引擎遇到未設定的門檻會跳過而不是擋人。要照《業務制度辦法 V4.0》開跑，
            按右上角「載入 V4 辦法數值」即可一次帶入（只填空白欄位，不覆蓋已填的）。
          </p>
        </div>

        <SystemEditor
          versionId={versionId}
          versions={versions.map((v) => ({
            id: v.id, version: v.version, status: v.status,
            effectiveFrom: v.effectiveFrom, changeNote: v.changeNote,
          }))}
          initial={params}
        />
      </section>
    </main>
  );
}
