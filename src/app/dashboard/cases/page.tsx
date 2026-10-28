import { redirect } from "next/navigation";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import { ensureCoach } from "@/lib/coach";
import { listCasesAction } from "../caseActions";
import CaseTable from "./CaseTable";
import { STAGE_LABEL, STAGE_SEQ, STAGES } from "@/lib/caseEngine";

export const dynamic = "force-dynamic";

// 教練端：案件總表（服務進度）。範圍依身分：主責看自己、S3 看所屬、客戶關係／行政財法／管理看全部。
const SCOPE_LABEL: Record<string, string> = { admin: "全部案件（系統管理）", client_relations: "全部案件（客戶關係）", admin_finance: "全部案件（行政財法）", s3: "所屬教練的案件（S3）", own: "我的案件" };

export default async function CasesPage() {
  const me = await ensureCoach();
  if (!me || me.status !== "active") redirect("/dashboard");
  const [hp, data] = await Promise.all([headerProps(me), listCasesAction()]);
  const overdue = data.rows.filter((r) => r.overdue > 0).length;
  const soon = data.rows.filter((r) => r.overdue === 0 && r.daysToDue !== null && r.daysToDue <= 3 && r.status === "active").length;
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <DashboardHeader {...hp} />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-xl font-bold">案件進度</h1>
            <p className="text-sm text-tx2 mt-1">{SCOPE_LABEL[data.scope] ?? data.scope}・共 {data.rows.length} 案</p>
          </div>
          <div className="ml-auto flex gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 ${overdue ? "bg-danger/15 text-danger" : "bg-panel2 text-tx3"}`}>逾期 {overdue}</span>
            <span className={`rounded-full px-2.5 py-1 ${soon ? "bg-brand2/15 text-brand2" : "bg-panel2 text-tx3"}`}>3 天內到期 {soon}</span>
          </div>
        </div>
        {data.rows.length > 0 && (
          <div className="grid sm:grid-cols-[auto_1fr] gap-3 text-xs">
            <div className="rounded-xl border border-line bg-panel p-3 min-w-44">
              <div className="text-tx3">準時完成率</div>
              <div className="text-2xl font-bold mt-0.5">{data.kpi.onTime + data.kpi.late ? `${Math.round((data.kpi.onTime / (data.kpi.onTime + data.kpi.late)) * 100)}%` : "—"}</div>
              <div className="text-10 text-tx3">已完成階段 {data.kpi.onTime + data.kpi.late} 個，其中準時 {data.kpi.onTime}</div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-3 grid grid-cols-5 gap-2">
              {STAGES.map((s) => (
                <div key={s}>
                  <div className="text-tx3 truncate">{STAGE_SEQ[s]}・{STAGE_LABEL[s]}</div>
                  <div className="text-lg font-bold">{data.kpi.byStage[s] ?? 0} <span className="text-10 font-normal text-tx3">案</span></div>
                  <div className="text-10 text-tx3">平均 {data.kpi.avgDays[s] == null ? "—" : `${data.kpi.avgDays[s]} 天`}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <CaseTable rows={data.rows} />
      </section>
    </main>
  );
}
