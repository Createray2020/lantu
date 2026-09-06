import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { ensureActiveVersion, listVersions, loadParams } from "@/lib/comp/repo";
import Simulator from "./Simulator";
import AdminHeader from "../../AdminHeader";
import AdminNav from "../../AdminNav";

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
  const cur = versions.find((v) => v.id === versionId);

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="分潤試算器" />
      <AdminNav />

      <section className="max-w-5xl mx-auto px-5 py-6">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-bold">分潤試算</h1>
          <span className="text-sm text-tx2">
            套用制度版本：<b className="text-brand2">{cur?.version ?? "—"}</b>
            {cur?.status === "draft" && "（草稿）"}
          </span>
        </div>
        <Simulator params={params} />
      </section>
    </main>
  );
}
