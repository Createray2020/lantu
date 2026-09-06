import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { ensureActiveVersion, listVersions, loadParams } from "@/lib/comp/repo";
import SystemEditor from "./SystemEditor";
import AdminHeader from "../AdminHeader";
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

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="業務制度" />
      <AdminNav />

      <section className="p-6 max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">財務教練業務制度</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            所有數字欄位預設留空。<b className="text-brand2">留空＝該門檻不檢查、該規則不計算</b>，
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
