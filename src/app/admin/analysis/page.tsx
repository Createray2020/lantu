import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getAnDefaultPayload, anBoardRows } from "@/lib/anDefaults";
import { AN_MODULE_KEYS } from "@/lib/analysisModules";
import AnalysisDefaultBoard from "./AnalysisDefaultBoard";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function AnalysisDefaultsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const payload = await getAnDefaultPayload();

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="分析模組預設" />
      <AdminNav />

      <section className="p-6 max-w-4xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">客戶分析頁 · 模組預設順序</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            決定教練打開客戶分析頁時，那一排模組<b className="text-brand2">第一時間</b>怎麼排、哪些先收起來。
            排在前面的是你希望大家一坐下來就先談的東西。
          </p>
        </div>
        <AnalysisDefaultBoard rows={anBoardRows(payload)} builtin={[...AN_MODULE_KEYS]} />
      </section>
    </main>
  );
}
