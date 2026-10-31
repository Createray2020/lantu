"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { remindAction, reopenAction } from "@/app/sign/[id]/actions";
import { voidInstanceAction } from "@/app/admin/docs/actions";
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
  /** 本人已簽過同範本同版本的另一份（重複發出）→ 標示並建議作廢 */
  dupSigned?: { name: string; at: string } | null;
};

const KIND: Record<DocTodoRow["kind"], { label: string; cls: string }> = {
  stale: { label: "待簽太久", cls: "bg-brand/15 text-brand2" },
  expired: { label: "已逾期", cls: "bg-danger/15 text-danger" },
  declined: { label: "被拒簽", cls: "bg-danger/15 text-danger" },
};

// 「卡住的文件」清單：教練（我的文件頁）與後台（待我處理）共用。動作全是站內：催簽、延長期限、看原因。
// 2026/11/01 Ray：「待我處理，但我要處理什麼？」——後台（canVoid）每列加「作廢」，讓卡住的文件有結案的出口；
// 重複發出的（本人已簽過同版本另一份）直接標出來、作廢原因預填。作廢只標記不刪，紀錄留在「全部文件」。
function defaultVoidReason(r: DocTodoRow): string {
  if (r.dupSigned) return `重複發出：${r.dupSigned.name} 已於 ${r.dupSigned.at} 簽過同版本`;
  if (r.kind === "declined") return `拒簽${r.reason ? `：${r.reason}` : ""}`.slice(0, 200);
  if (r.kind === "expired") return "逾期未簽，不再需要";
  return "";
}

export default function DocTodoList({ rows, days = 14, canVoid = false }: { rows: DocTodoRow[]; days?: number; canVoid?: boolean }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-lg border border-danger/40 bg-panel p-4 grid gap-2">
      <h2 className="font-bold text-sm">需要處理的文件 <span className="text-tx3 font-normal">{rows.length} 份</span></h2>
      <ul className="grid gap-2">
        {rows.map((r) => <Row key={r.id} r={r} days={days} canVoid={canVoid} />)}
      </ul>
    </section>
  );
}

function Row({ r, days, canVoid }: { r: DocTodoRow; days: number; canVoid: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidErr, setVoidErr] = useState<string | null>(null);
  const openVoid = () => { setVoidReason(defaultVoidReason(r)); setVoidErr(null); setVoiding(true); };
  const doVoid = () => start(async () => {
    const x = await voidInstanceAction(r.id, voidReason);
    if (x.ok) { setVoiding(false); setMsg("已作廢"); router.refresh(); } else setVoidErr(x.error ?? "作廢失敗");
  });
  const k = KIND[r.kind];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-md bg-panel2 px-3 py-2">
      <span className={`text-11 rounded px-1.5 py-0.5 ${k.cls}`}>{k.label}</span>
      <span className="text-11 text-tx3">{CASE_TYPE_LABEL[r.caseType as DocCaseType] ?? r.caseType}</span>
      <span className="font-bold truncate">{r.title}</span>
      {r.dupSigned && <span className="text-11 rounded px-1.5 py-0.5 bg-ok/15 text-ok">已簽過同版本 {r.dupSigned.at}</span>}
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
        {canVoid && !voiding && (
          <button type="button" className={`text-xs rounded-md px-2.5 py-1 disabled:opacity-40 ${r.dupSigned ? "border border-danger text-danger" : "border border-line text-tx2"}`} disabled={busy} onClick={openVoid}>作廢</button>
        )}
      </span>
      {r.kind === "declined" && <div className="basis-full text-xs text-tx2 whitespace-pre-wrap break-words">拒簽原因：{r.reason || "（沒有填原因）"}</div>}
      {r.dupSigned && !voiding && <div className="basis-full text-xs text-tx2">{r.dupSigned.name} 已經簽完同一版本的另一份（{r.dupSigned.at}），這份是重複發出的，建議作廢。</div>}
      {voiding && (
        <div className="basis-full mt-1 grid gap-2 rounded-md border border-danger/40 bg-panel p-3">
          <label className="text-xs font-bold text-tx">作廢原因</label>
          <input className="rounded-md border border-line bg-field px-2.5 py-1.5 text-sm" value={voidReason} maxLength={400} onChange={(e) => setVoidReason(e.target.value)} placeholder="必填，會留在紀錄上" autoFocus />
          <p className="text-11 text-tx3">作廢後這份就不能再簽、會從待處理移除；紀錄保留在「全部文件」。之後還要對方簽，可以重新發補簽。已完成的文件不能作廢。</p>
          <div className="flex items-center gap-2">
            <button type="button" className="text-xs rounded-md bg-danger text-white px-3 py-1.5 font-bold disabled:opacity-40" disabled={busy || !voidReason.trim()} onClick={doVoid}>確認作廢</button>
            <button type="button" className="text-xs rounded-md border border-line px-3 py-1.5" disabled={busy} onClick={() => setVoiding(false)}>取消</button>
            {voidErr && <span className="text-xs text-danger">{voidErr}</span>}
          </div>
        </div>
      )}
    </li>
  );
}
