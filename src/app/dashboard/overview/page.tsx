import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getCoachDashboard } from "@/lib/dashboard";
import DashboardHeader from "../DashboardHeader";
import { STATUS_LABEL, REVIEW_TYPE_LABEL, STAGE_LABEL, STAGE_ORDER, stageColor } from "../format";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (coach.status !== "active") redirect("/dashboard");
  const d = await getCoachDashboard(coach.id);

  const kpi = (label: string, value: number, hint?: string) => (
    <div className="bg-[#0c2135] border border-white/10 rounded-xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[#6b7d8f]">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-[#6b7d8f]">{hint}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader isAdmin={coach.role === "admin"} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid gap-6">
        <h1 className="font-serif text-xl tracking-wide">教練儀表板</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpi("客戶總數", d.counts.total)}
          {kpi("進行中", d.counts.active)}
          {kpi("本週要諮詢", d.counts.upcomingWeek)}
          {kpi("待辦事項", d.counts.openItems)}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">本週要諮詢</h2>
            {d.thisWeek.length === 0 ? <Empty>本週沒有排定的諮詢</Empty> : (
              <div className="grid gap-2">
                {d.thisWeek.map((a, i) => (
                  <Link key={i} href={`/dashboard/clients/${a.clientId}`} className="flex items-center gap-2 bg-[#0c2135] hover:bg-[#123049] border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <span className="text-[#e0bd8b] font-bold w-24">{a.date}</span>
                    <span className="flex-1">{a.clientName}</span>
                    <span className="text-[11px] text-[#6b7d8f]">{REVIEW_TYPE_LABEL[a.type] ?? a.type}</span>
                  </Link>
                ))}
              </div>
            )}
            {d.thisMonth.length > d.thisWeek.length && (
              <>
                <h2 className="text-xs uppercase tracking-wider text-[#6b7d8f] mt-4 mb-2">本月其餘</h2>
                <div className="grid gap-2">
                  {d.thisMonth.slice(d.thisWeek.length).map((a, i) => (
                    <Link key={i} href={`/dashboard/clients/${a.clientId}`} className="flex items-center gap-2 bg-[#0c2135] hover:bg-[#123049] border border-white/10 rounded-lg px-3 py-2 text-sm">
                      <span className="text-[#a9bccf] w-24">{a.date}</span>
                      <span className="flex-1">{a.clientName}</span>
                      <span className="text-[11px] text-[#6b7d8f]">{REVIEW_TYPE_LABEL[a.type] ?? a.type}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">逾期未檢視</h2>
            {d.overdue.length === 0 ? <Empty>沒有逾期</Empty> : (
              <div className="grid gap-2">
                {d.overdue.map((a, i) => (
                  <Link key={i} href={`/dashboard/clients/${a.clientId}`} className="flex items-center gap-2 bg-[#0c2135] hover:bg-[#123049] border border-[#d9773f]/30 rounded-lg px-3 py-2 text-sm">
                    <span className="text-[#d9773f] font-bold w-24">{a.date}</span>
                    <span className="flex-1">{a.clientName}</span>
                    <span className="text-[11px] text-[#6b7d8f]">{REVIEW_TYPE_LABEL[a.type] ?? a.type}</span>
                  </Link>
                ))}
              </div>
            )}

            <h2 className="text-xs uppercase tracking-wider text-[#6b7d8f] mt-4 mb-2">待辦動作項目</h2>
            {d.openItems.length === 0 ? <Empty>沒有待辦</Empty> : (
              <div className="grid gap-2">
                {d.openItems.slice(0, 12).map((i) => (
                  <Link key={i.id} href={`/dashboard/clients/${i.clientId}`} className="flex items-start gap-2 bg-[#0c2135] hover:bg-[#123049] border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <span className="flex-1">
                      {i.title}
                      <span className="block text-[11px] text-[#6b7d8f]">{i.clientName}{i.owner ? " · " + i.owner : ""}</span>
                    </span>
                    <span className={"text-[11px] " + (i.overdue ? "text-[#d9773f]" : "text-[#6b7d8f]")}>{i.dueDate ?? "無期限"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section>
          <h2 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">客戶分佈</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Dist title="狀態" data={d.byStatus} labelMap={STATUS_LABEL} />
            <Dist title="客群階段分佈" data={d.byGrade} labelMap={STAGE_LABEL} stageColored
              note="反映客群結構，非服務品質指標" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Dist({ title, data, labelMap, stageColored, note }: { title: string; data: Record<string, number>; labelMap?: Record<string, string>; stageColored?: boolean; note?: string }) {
  // 階段分佈固定照旅程順序（整裝 → 遠行），不依人數排序，避免讀成排行榜。
  const order = stageColored ? [...STAGE_ORDER as readonly string[], "未評"] : null;
  const entries = Object.entries(data).sort((a, b) =>
    order ? order.indexOf(a[0]) - order.indexOf(b[0]) : b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="bg-[#0c2135] border border-white/10 rounded-xl p-3">
      <div className="text-[12px] text-[#a9bccf] mb-2">{title}</div>
      {entries.length === 0 ? <div className="text-[#6b7d8f] text-sm">—</div> : (
        <div className="grid gap-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="w-16 text-[12px] truncate" style={stageColored ? { color: stageColor(k), fontWeight: 700 } : undefined}>{labelMap?.[k] ?? k}</span>
              <div className="flex-1 h-2 rounded bg-[#0a1a2b] overflow-hidden">
                <div className="h-full rounded" style={{ width: `${(v / max) * 100}%`, background: stageColored ? stageColor(k) : "#c99a5b" }} />
              </div>
              <span className="w-6 text-right text-[12px] text-[#a9bccf]">{v}</span>
            </div>
          ))}
        </div>
      )}
      {note && <div className="text-[11px] text-[#6b7d8f] mt-2">{note}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[#6b7d8f] text-sm bg-[#0c2135] border border-white/10 rounded-lg px-3 py-6 text-center">{children}</div>;
}
