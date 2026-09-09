import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { MODULES, getModuleStates } from "@/lib/platformModules";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import ModuleBoard, { type ModuleRowView } from "./ModuleBoard";

export const dynamic = "force-dynamic";

// 模組開關（2026/09/09 Ray）：「先關閉學習區，架設完成後再打開，確保未來維修功能。」
// 做的是一張通用開關表，不是學習區專屬的一顆布林——未來任何模組要維修都關在這裡。
export default async function ModulesPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const states = await getModuleStates();
  const rows: ModuleRowView[] = MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    area: m.area,
    effect: m.effect,
    defaultNotice: m.defaultNotice,
    enabled: states[m.key]?.enabled ?? m.defaultEnabled,
    notice: states[m.key]?.notice ?? m.defaultNotice,
    configured: states[m.key]?.configured ?? false,
  }));

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="模組開關" />
      <AdminNav />

      <section className="max-w-3xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">模組開關 · 維修與開放</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            還沒建置完成、或臨時要進維修的模組在這裡關掉。
            關閉的模組<b className="text-brand2">入口會整個不出現</b>，直接打網址的人看到下方那段說明文字，
            相關的寫入動作也會被擋下——不是把畫面藏起來而已。
            <br />
            後台管理頁不受影響：學習區關著的時候，「學習區管理」照樣可以先把課程與教材建好。
          </p>
        </div>
        <ModuleBoard rows={rows} />
      </section>
    </main>
  );
}
