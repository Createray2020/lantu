"use client";

import { useEffect, useState, useTransition } from "react";
import { fmtMoney0 } from "@/lib/money";
import FeeFields, { EMPTY_FEE, feeError, feeToInput, type FeeDraft } from "../../FeeFields";
import { addClientFeeAction, clientFeesAction, type ClientFeeRow } from "../../actions";

// 客戶詳情：顧問費收款（2026/10/09 Ray）。建客戶時沒勾、之後才收費的，在這裡補記；每一筆標「待查帳／已確認」。
export default function ClientFees({ clientId, meId, readOnly }: { clientId: string; meId: string; readOnly: boolean }) {
  const [rows, setRows] = useState<ClientFeeRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [fee, setFee] = useState<FeeDraft>({ ...EMPTY_FEE, on: true, date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const load = () => clientFeesAction(clientId).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => {
    const e = feeError(fee); if (e) { setErr(e); return; }
    setErr("");
    start(async () => {
      const r = await addClientFeeAction(clientId, feeToInput(fee, meId)!);
      if (!r.ok) { setErr(r.error); return; }
      setAdding(false); setFee({ ...EMPTY_FEE, on: true, date: new Date().toISOString().slice(0, 10) }); load();
    });
  };
  const live = (rows ?? []).filter((r) => !r.void);
  const total = live.filter((r) => r.verified).reduce((a, r) => a + r.amount - r.refund, 0);
  return (
    <div className="bg-panel border border-line rounded-xl p-4 shadow-e1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold">顧問費</div>
          <div className="text-xs text-tx3">{rows === null ? "載入中…" : live.length ? `已確認 ${fmtMoney0(total)}${live.some((r) => !r.verified) ? `・${live.filter((r) => !r.verified).length} 筆待公司查帳` : ""}` : "這位客戶還沒有收費紀錄——沒收費的規劃不用記"}</div>
        </div>
        {!readOnly && !adding && <button className="text-xs rounded-md border border-line2 px-2.5 py-1.5 text-tx2 hover:bg-panel3" onClick={() => setAdding(true)}>＋ 記一筆收費</button>}
      </div>
      {live.length > 0 && (
        <table className="w-full text-sm mt-3">
          <tbody>
            {live.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1.5 whitespace-nowrap">{r.on}</td>
                <td className="text-right tabular-nums">{fmtMoney0(r.amount)}{r.refund > 0 && <span className="text-10 text-danger ml-1">退 {fmtMoney0(r.refund)}</span>}</td>
                <td className="text-xs text-tx3 pl-3">開發 {r.promo}</td>
                <td className="text-right"><span className={`text-10 rounded-full border px-2 py-0.5 ${r.verified ? "border-ok text-ok" : "border-danger text-danger"}`}>{r.verified ? "已確認" : "待查帳"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && (
        <div className="mt-3 space-y-2">
          <FeeFields value={fee} onChange={(f) => setFee({ ...f, on: true })} meId={meId} />
          {err && <div className="text-danger text-sm">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button className="px-3 py-1.5 text-sm text-tx2" onClick={() => setAdding(false)}>取消</button>
            <button className="rounded-md bg-brand text-onbrand text-sm px-3 py-1.5 disabled:opacity-40" disabled={pending} onClick={submit}>{pending ? "記錄中…" : "記下來"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
