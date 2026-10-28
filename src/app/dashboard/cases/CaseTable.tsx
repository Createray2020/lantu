"use client";

import Link from "next/link";
import { useState } from "react";
import { STAGE_LABEL, STAGE_SEQ, STATUS_LABEL, FLAG_LABEL, type Stage } from "@/lib/caseEngine";
import type { CaseListRow } from "../caseActions";

const fmt = (d: string | null) => (d ? d.slice(5).replace("-", "/") : "—");
type Filter = "all" | "overdue" | "soon" | "waiting" | "paused" | "closed";

export default function CaseTable({ rows }: { rows: CaseListRow[] }) {
  const [f, setF] = useState<Filter>("all");
  const [stage, setStage] = useState<"" | Stage>("");
  const list = rows.filter((r) => {
    if (stage && r.stage !== stage) return false;
    if (f === "overdue") return r.overdue > 0;
    if (f === "soon") return r.status === "active" && r.overdue === 0 && r.daysToDue !== null && r.daysToDue <= 3;
    if (f === "waiting") return r.flags.includes("waiting");
    if (f === "paused") return r.status === "paused";
    if (f === "closed") return r.status === "closed";
    return r.status !== "closed";
  });
  const chip = (k: Filter, label: string) => <button key={k} onClick={() => setF(k)} className={`text-xs rounded-full px-2.5 py-1 border ${f === k ? "border-brand text-brand bg-brand/10" : "border-line text-tx2"}`}>{label}</button>;
  return (
    <div className="bg-panel border border-line rounded-xl shadow-e1">
      <div className="flex flex-wrap items-center gap-1.5 p-3 border-b border-line">
        {chip("all", "進行中")}{chip("overdue", "逾期")}{chip("soon", "即將到期")}{chip("waiting", "等待客戶")}{chip("paused", "暫停")}{chip("closed", "已結案")}
        <select className="ml-auto bg-field border border-line2 rounded-md text-xs px-2 py-1" value={stage} onChange={(e) => setStage(e.target.value as "" | Stage)}>
          <option value="">全部階段</option>
          {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => <option key={s} value={s}>{STAGE_SEQ[s]}・{STAGE_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-11 uppercase tracking-wider text-tx3">
            <tr className="text-left">
              <th className="px-3 py-2 font-normal">客戶</th><th className="px-3 py-2 font-normal">教練</th><th className="px-3 py-2 font-normal">目前階段</th>
              <th className="px-3 py-2 font-normal">到期</th><th className="px-3 py-2 font-normal">狀態／標記</th><th className="px-3 py-2 font-normal text-right">進度</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-panel2">
                <td className="px-3 py-2"><Link href={`/dashboard/clients/${r.clientId}`} className="font-bold hover:underline">{r.clientName}</Link><div className="text-10 text-tx3">{r.caseNo}</div></td>
                <td className="px-3 py-2 text-tx2">{r.coachName}{r.s3Name ? <div className="text-10 text-tx3">S3 {r.s3Name}</div> : null}</td>
                <td className="px-3 py-2">{STAGE_SEQ[r.stage]}・{STAGE_LABEL[r.stage]}</td>
                <td className="px-3 py-2">
                  <span className={r.overdue > 0 ? "text-danger font-bold" : r.daysToDue !== null && r.daysToDue <= 3 ? "text-brand2 font-bold" : "text-tx2"}>{fmt(r.curDue)}</span>
                  {r.overdue > 0 && <span className="text-10 text-danger ml-1">逾期 {r.overdue} 天{r.escalation ? `・第 ${r.escalation} 步` : ""}</span>}
                  {r.overdue === 0 && r.daysToDue !== null && r.daysToDue >= 0 && r.daysToDue <= 3 && r.status === "active" && <span className="text-10 text-brand2 ml-1">{r.daysToDue} 天</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="text-tx2">{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}</span>
                  {r.flags.map((x) => <span key={x} className={`ml-1 rounded-full px-1.5 py-0.5 text-10 ${x === "overdue" || x === "complaint" ? "bg-danger/15 text-danger" : "bg-brand2/15 text-brand2"}`}>{FLAG_LABEL[x as keyof typeof FLAG_LABEL] ?? x}</span>)}
                </td>
                <td className="px-3 py-2 text-right text-tx2">{r.done}／{r.total}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-tx3">這個篩選下沒有案件。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
