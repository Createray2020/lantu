"use client";

// 教練「移除帳號」流程。這是給誤建帳號用的稀有動作 ——
// 正常離職請用停權（不動任何資料）。移除前必須把兩件事清乾淨：
//   1. 分潤案件：有過就永遠不能移除（財務紀錄，稽核不可刪）
//   2. 名下客戶：要先整批轉移給接手教練
// 資料庫的 RESTRICT 是最後一道防線，這裡先擋是為了給得出人看得懂的理由。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transferClientsAction, removeCoachAction } from "./actions";

export default function RemoveCoach({
  id,
  name,
  clientCount,
  caseCount,
  candidates,
}: {
  id: string;
  name: string;
  clientCount: number;
  caseCount: number;
  candidates: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const blockedByCases = caseCount > 0;
  const blockedByClients = clientCount > 0;

  function doTransfer() {
    setError(null); setMsg(null);
    if (!to) { setError("請先選擇接手教練"); return; }
    startTransition(async () => {
      const r = await transferClientsAction(id, to);
      if (r.ok) { setMsg(`已轉移 ${r.moved ?? 0} 位客戶`); router.refresh(); }
      else setError(r.error);
    });
  }

  function doRemove() {
    setError(null); setMsg(null);
    startTransition(async () => {
      const r = await removeCoachAction(id);
      if (r.ok) router.refresh();
      else { setError(r.error); setConfirming(false); }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] text-tx3 hover:text-danger underline underline-offset-2"
      >
        移除帳號…
      </button>
    );
  }

  return (
    <div className="mt-2 w-[300px] rounded-lg border border-danger-solid/40 bg-danger-solid/25/60 p-3 text-left">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-danger">移除「{name}」</span>
        <div className="flex-1" />
        <button type="button" onClick={() => { setOpen(false); setConfirming(false); setError(null); setMsg(null); }}
          className="text-[10px] text-tx3 hover:text-tx">收起</button>
      </div>

      <div className="text-[11px] text-tx2 mb-2">
        名下客戶 <b className="text-tx">{clientCount}</b> 位 · 分潤案件 <b className="text-tx">{caseCount}</b> 筆
      </div>

      {blockedByCases ? (
        <p className="text-[11px] text-brand2 leading-relaxed">
          此教練有 {caseCount} 筆案件分潤紀錄，依稽核不可移除。<br />要停止他的存取請用「停權」。
        </p>
      ) : blockedByClients ? (
        <>
          <p className="text-[11px] text-tx2 mb-2 leading-relaxed">
            移除前要先把 {clientCount} 位客戶轉給接手教練（客戶與規劃會完整保留）。
          </p>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full bg-field border border-line rounded-md px-2 py-1.5 text-xs text-tx mb-2"
          >
            <option value="">選擇接手教練…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <button
            type="button" disabled={pending} onClick={doTransfer}
            className="w-full rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {pending ? "轉移中…" : `轉移 ${clientCount} 位客戶`}
          </button>
        </>
      ) : confirming ? (
        <>
          <p className="text-[11px] text-danger mb-2 leading-relaxed">
            確定要永久移除這個帳號？此動作無法復原。
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={doRemove}
              className="flex-1 rounded-md bg-danger-solid text-onsolid font-bold px-3 py-1.5 text-xs disabled:opacity-50">
              {pending ? "移除中…" : "確定移除"}
            </button>
            <button type="button" onClick={() => setConfirming(false)}
              className="rounded-md border border-line2 text-tx2 px-3 py-1.5 text-xs">取消</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-tx2 mb-2">沒有客戶也沒有分潤紀錄，可以移除。</p>
          <button type="button" onClick={() => setConfirming(true)}
            className="w-full rounded-md border border-danger-solid text-danger font-bold px-3 py-1.5 text-xs">
            移除帳號
          </button>
        </>
      )}

      {msg && <div className="mt-2 text-[10px] text-ok">{msg}</div>}
      {error && <div className="mt-2 text-[10px] text-danger">失敗：{error}</div>}
    </div>
  );
}
