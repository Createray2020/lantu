import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { ensureActiveVersion, listVersions, loadParams } from "@/lib/comp/repo";
import Simulator from "./Simulator";

export const dynamic = "force-dynamic";

// 試算器對全體顧問開放（制度教育與招募說明都靠它），只要是已開通的教練都能看。
// 能改制度的仍只有 admin —— 這頁純唯讀計算，不寫任何資料。
export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (me.status !== "active") redirect("/dashboard");

  const sp = await searchParams;
  const active = await ensureActiveVersion();
  const versions = await listVersions();
  const versionId = versions.some((x) => x.id === sp.v) ? sp.v! : active.id;
  const params = await loadParams(versionId);
  const brand = await getBrand();
  const cur = versions.find((v) => v.id === versionId);

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
        <span className="text-[#a9bccf] text-xs">分潤試算器</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[#a9bccf] text-sm hover:text-white">← 回系統</Link>
        <UserButton />
      </header>

      <section className="p-6 max-w-5xl">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-bold">分潤試算</h1>
          <span className="text-sm text-[#a9bccf]">
            套用制度版本：<b className="text-[#e0bd8b]">{cur?.version ?? "—"}</b>
            {cur?.status === "draft" && "（草稿）"}
          </span>
        </div>
        <Simulator params={params} />
      </section>
    </main>
  );
}
