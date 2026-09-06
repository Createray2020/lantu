import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getApplySettings } from "@/lib/coachApplyStore";
import { rankCaps } from "@/lib/quota";
import { RANK_ORDER } from "@/lib/license";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import ApplySettingsBoard from "./ApplySettingsBoard";

export const dynamic = "force-dynamic";

// 報聘設定：核准時自動帶什麼、放行前一定要打的勾。
// 與 /admin/analysis 同一層語意 —— 後台定一份、現場照著跑。
export default async function ApplySettingsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [settings, caps] = await Promise.all([getApplySettings(), rankCaps()]);
  const rankCodes = [...RANK_ORDER, ...Object.keys(caps).filter((c) => !RANK_ORDER.includes(c as never))];

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="報聘設定" />
      <AdminNav />

      <section className="max-w-3xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">報聘 · 核准預設值與審核檢核表</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            決定新教練<b className="text-brand2">核准開通那一刻</b>自動帶什麼（職級、推薦人、使用期限），
            以及審核者按下核准之前一定要打的勾。這裡改了不會回頭動已經開通的帳號。
          </p>
        </div>
        <ApplySettingsBoard settings={settings} rankCodes={rankCodes} />
      </section>
    </main>
  );
}
