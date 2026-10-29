"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { remindAction, reopenAction } from "@/app/sign/[id]/actions";
import { CASE_TYPE_LABEL, type DocCaseType } from "@/lib/docs";

export type DocTodoRow = {
  id: string;
  title: string;
  caseType: string;
  kind: "stale" | "expired" | "declined";
  waitingOn: string;
  days: number;
  expiresAt: string | null;
  remindCount: number;
  canRemind: boolean;
  /** 拒簽原因（LT03）：清單上直接看得到，不必點進去 */
  reason?: string | null;
};

const KIND: Record<DocTodoRow["kind"], { label: string; cls: string }> = {
  stale: { label: "待簽太久", cls: "bg-brand/15 text-brand2" },
  expired: { label: "已逾期", cls: "bg-danger/15 text-danger" },
  declined: { label: "被拒簽", cls: "bg-danger/15 text-danger" },
};

// 「卡住的文件」清單：教練（我的文件頁）與後台（待我處理）共用。動作全是站內：催簽、延長期限、看原因。
export default function DocTodoList({ rows, days = 14 }: { rows: DocTodoRow[]; days?: number }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-lg border border-danger/40 bg-panel p-4 grid gap-2">
      <h2 className="font-bold text-sm">需要處理的文件 <span className="text-tx3 font-normal">{rows.length} 份</span></h2>
      <ul className="grid gap-2">
        {rows.map((r) => <Row key={r.id} r={r} days={days} />)}
      </ul>
    </section>
  );
}

function Row({ r, days }: { r: DocTodoRow; days: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const k = KIND[r.kind];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-md bg-panel2 px-3 py-2">
      <span className={`text-11 rounded px-1.5 py-0.5 ${k.cls}`}>{k.label}</span>
      <span className="text-11 text-tx3">{CASE_TYPE_LABEL[r.caseType as DocCaseType] ?? r.caseType}</span>
      <span className="font-bold truncate">{r.title}</span>
      <span className="text-xs text-tx2">
        {r.kind === "declined" ? `${r.waitingOn} 拒簽` : `等 ${r.waitingOn || "簽署人"} ${r.days} 天`}
        {r.remindCount > 0 ? `・已催 ${r.remindCount} 次` : ""}
        {r.expiresAt ? `・期限 ${r.expiresAt}` : ""}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {msg && <span className="text-11 text-tx2">{msg}</span>}
        {r.kind === "stale" && r.canRemind && (
          <button type="button" className="text-xs rounded-md border border-brand2 text-brand2 px-2.5 py-1 disabled:opacity-40" disabled={busy} onClick={() => start(async () => { const x = await remindAction(r.id); setMsg(x.ok ? `已提醒 ${x.reminded?.join("、")}` : x.error ?? "失敗"); if (x.ok) router.refresh(); })}>催簽</button>
        )}
        {r.kind === "expired" && (
          <button type="button" className="text-xs rounded-md border border-line px-2.5 py-1 disabled:opacity-40" disabled={busy} onClick={() => start(async () => { const x = await reopenAction(r.id, days); setMsg(x.ok ? `延到 ${x.expiresAt}` : x.error ?? "失敗"); if (x.ok) router.refresh(); })}>延長 {days} 天</button>
        )}
        <Link href={`/sign/${r.id}`} className="text-xs rounded-md border border-line px-2.5 py-1">{r.kind === "declined" ? "看原因" : "查看"}</Link>
      </span>
      {r.kind === "declined" && <div className="basis-full text-xs text-tx2 whitespace-pre-wrap break-words">拒簽原因：{r.reason || "（沒有填原因）"}</div>}
    </li>
  );
}
