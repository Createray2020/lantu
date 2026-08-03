import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import * as engine from "@/lib/engine";

// P0 佔位儀表板：驗證登入 + 已移植引擎可在伺服器端運算。
// P1 起改為真正的客戶管理三層畫面。
export default async function Dashboard() {
  const user = await currentUser();
  const c = engine.sampleCase();
  const m = engine.metrics(c);
  const h = engine.health(c);
  const rn = engine.retireNeed(c);
  const mc = engine.monteCarlo(c, 500);
  const rp = engine.riskProfile(c);
  const fmt = (v: number) => new Intl.NumberFormat("zh-TW").format(Math.round(v));

  const cards: [string, string][] = [
    ["淨資產", fmt(m.net)],
    ["財務健康等級", h.grade],
    ["退休缺口", fmt(rn.gap)],
    ["蒙地卡羅不破產機率", `${(mc.pSuccess * 100).toFixed(0)}%`],
    ["投資風險屬性", rp ? rp.tier.name : "未評定"],
  ];

  return (
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7]">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        <span className="text-[#a9bccf] text-xs">全方位財務規劃</span>
        <div className="flex-1" />
        <span className="text-sm text-[#a9bccf]">
          {user?.firstName || user?.emailAddresses?.[0]?.emailAddress}
        </span>
        <UserButton />
      </header>

      <section className="p-6 max-w-4xl">
        <div className="rounded-xl border border-[#c99a5b]/40 bg-[#12334f] p-4 mb-6">
          <p className="text-sm text-[#a9bccf]">
            P0 骨架就緒：Next 16 · Neon · Drizzle · Clerk 登入 · 已移植 v12 財務引擎（伺服器端運算）。
            下方數字由示範個案即時計算，證明引擎已接上。
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-[#17406a] p-4">
              <div className="text-xs text-[#a9bccf] mb-1">{label}</div>
              <div className="text-2xl font-bold text-[#e0bd8b]">{value}</div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-[#6f869c]">
          下一步（P1）：客戶管理三層架構 — 客戶列表、客戶詳情（概況／年度版本／諮詢紀錄）、教練儀表板、年度重製與版本比較。
        </p>
      </section>
    </main>
  );
}
