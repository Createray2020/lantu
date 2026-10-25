import { redirect } from "next/navigation";
import { ensureCoach, isAdmin, listCoaches } from "@/lib/coach";
import { MODULES, getModuleStates } from "@/lib/platformModules";
import { monthTokensByCoach } from "@/lib/aiUsage";
import { assistantConfigured, assistantModel, monthlyCap } from "@/lib/assistant";
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

  const [states, usage, coachList] = await Promise.all([
    getModuleStates(),
    monthTokensByCoach().catch(() => []),
    listCoaches().catch(() => []),
  ]);
  const coachName = new Map(coachList.map((c) => [c.id, c.name || c.clerkName || c.id]));
  const cap = monthlyCap();
  const totalTokens = usage.reduce((a, u) => a + u.tokens, 0);
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

        {/* AI 助理用量（2026/10/25）：費用從 Ray 的 Anthropic 帳號扣，這裡是唯一看得到「花在哪」的地方。 */}
        <div className="mt-8 rounded-xl border border-line bg-panel p-4">
          <h2 className="text-base font-bold">AI 助理 · 本月用量</h2>
          <p className="text-xs text-tx2 mt-1 leading-relaxed">
            金鑰 {assistantConfigured() ? <b className="text-ok">已設定</b> : <b className="text-danger">未設定（面板會顯示「尚未啟用」）</b>}
            ・模型 <code>{assistantModel()}</code>
            ・每位教練月上限 {cap > 0 ? `${cap.toLocaleString()} tokens` : "不限"}
            ・本月合計 {totalTokens.toLocaleString()} tokens（台北月份）
          </p>
          {usage.length === 0 ? (
            <p className="text-sm text-tx3 mt-3">這個月還沒有人用過。</p>
          ) : (
            <table className="w-full text-sm mt-3">
              <thead className="text-tx3 text-xs">
                <tr><th className="text-left py-1">教練</th><th className="text-right">次數</th><th className="text-right">tokens</th><th className="text-right">提出預覽卡</th></tr>
              </thead>
              <tbody>
                {usage.sort((a, b) => b.tokens - a.tokens).map((u) => (
                  <tr key={u.coachId} className="border-t border-line">
                    <td className="py-1">{coachName.get(u.coachId) ?? u.coachId}</td>
                    <td className="text-right">{u.calls.toLocaleString()}</td>
                    <td className={"text-right " + (cap > 0 && u.tokens >= cap ? "text-danger font-bold" : "")}>{u.tokens.toLocaleString()}</td>
                    <td className="text-right">{u.ops.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
