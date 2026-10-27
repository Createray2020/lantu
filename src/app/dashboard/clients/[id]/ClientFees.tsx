"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { fmtMoney0 } from "@/lib/money";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/acctEngine";
import FeeFields, { EMPTY_FEE, feeError, feeToInput, type FeeDraft } from "../../FeeFields";
import { addClientFeeAction, clientCasesAction, addCasePaymentAction, startCaseSigningAction, type ClientCaseRow } from "../../actions";
import { remindAction } from "@/app/sign/[id]/actions";

// 客戶詳情「收款與合約」（2026/10/28；2026/10/09 原為「顧問費」）。
// 一案一卡：收款／合約／發票三組獨立狀態；動作依狀態給——建立付費服務案件、登錄付款、啟動簽約流程、合約進度與下載。
// ⚠️ 按鈕顯示只是方便；每個動作後端都再驗一次（主責教練、全額確認、客戶已綁帳號）。
const INV_LABEL: Record<string, string> = { pending: "待處理", issued: "已開立", failed: "開立失敗", voided: "已作廢", allowance: "折讓處理" };
const CASE_LABEL: Record<string, string> = { open: "進行中", completed: "合約完成", terminated: "已終止", refunded: "已退款" };

export default function ClientFees({ clientId, meId, readOnly, planYears = [] }: { clientId: string; meId: string; readOnly: boolean; planYears?: number[] }) {
  const [rows, setRows] = useState<ClientCaseRow[] | null>(null);
  const [adding, setAdding] = useState<null | number>(null); // 建案：要掛的年度
  const [fee, setFee] = useState<FeeDraft>({ ...EMPTY_FEE, on: true, date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const load = () => clientCasesAction(clientId).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitCase = () => {
    const e = feeError(fee); if (e) { setErr(e); return; }
    setErr(""); setMsg("");
    start(async () => {
      const r = await addClientFeeAction(clientId, feeToInput(fee, meId)!);
      if (!r.ok) { setErr(r.error); return; }
      if (r.warn) setMsg(r.warn);
      setAdding(null); setFee({ ...EMPTY_FEE, on: true, date: new Date().toISOString().slice(0, 10) }); load();
    });
  };
  // 年度續約提示：有規劃年度、卻沒有該年度的案件（複製為新年度之後會看到）
  const caseYears = new Set((rows ?? []).map((r) => r.serviceYear));
  const missingYears = planYears.filter((y) => !caseYears.has(y)).sort((a, b) => b - a);

  return (
    <div className="bg-panel border border-line rounded-xl p-4 shadow-e1 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold">收款與合約</div>
          <div className="text-xs text-tx3">{rows === null ? "載入中…" : rows.length ? `${rows.length} 個服務案件` : "這位客戶還沒有付費服務案件——沒收費的規劃不用建"}</div>
        </div>
        {!readOnly && adding === null && rows !== null && (
          <div className="flex gap-2">
            {missingYears.slice(0, 1).map((y) => (
              <button key={y} className="text-xs rounded-md border border-brand2 text-brand2 px-2.5 py-1.5" onClick={() => { setAdding(y); setFee((f) => ({ ...f, year: String(y), from: `${y}-01-01`, to: `${y}-12-31` })); }}>建立 {y} 年度續約案件</button>
            ))}
            <button className="text-xs rounded-md border border-line2 px-2.5 py-1.5 text-tx2 hover:bg-panel3" onClick={() => setAdding(0)}>＋ 建立付費服務案件</button>
          </div>
        )}
      </div>
      {msg && <p className="text-xs text-tx2">{msg}</p>}

      {adding !== null && (
        <div className="space-y-2">
          <FeeFields value={fee} onChange={(f) => setFee({ ...f, on: true })} meId={meId} lockOn />
          {err && <div className="text-danger text-sm">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button className="px-3 py-1.5 text-sm text-tx2" onClick={() => setAdding(null)}>取消</button>
            <button className="rounded-md bg-brand text-onbrand text-sm px-3 py-1.5 disabled:opacity-40" disabled={pending} onClick={submitCase}>{pending ? "建立中…" : "建立案件並提報付款"}</button>
          </div>
        </div>
      )}

      {(rows ?? []).map((c) => <CaseCard key={c.id} c={c} readOnly={readOnly} onChanged={load} />)}
    </div>
  );
}

function CaseCard({ c, readOnly, onChanged }: { c: ClientCaseRow; readOnly: boolean; onChanged: () => void }) {
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState(String(Math.max(0, c.amountDue - c.confirmed - c.pending) || ""));
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [last5, setLast5] = useState("");
  const [gross, setGross] = useState("");
  const [err, setErr] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [pending, start] = useTransition();

  const pay = () => {
    setErr("");
    start(async () => {
      const amt = Number(amount.replace(/,/g, ""));
      const g = gross.trim() ? Number(gross.replace(/,/g, "")) : null;
      const r = await addCasePaymentAction(c.id, { amount: amt, on, method, last5, gross: g, fee: g != null ? Math.max(0, g - amt) : 0 });
      if (!r.ok) { setErr(r.error); return; }
      setPaying(false); onChanged();
    });
  };
  const startSign = () => {
    setErr(""); setNeedLogin(false);
    start(async () => {
      const r = await startCaseSigningAction(c.id);
      if (!r.ok) { setErr(r.error); setNeedLogin(!!r.needLogin); return; }
      onChanged();
    });
  };
  const contractLabel = !c.docs.length ? (c.met ? "尚無合約" : "待公司確認收款") : c.anyDeclined ? "有拒簽" : c.docsDone === c.docsRequired && c.docsRequired > 0 ? "合約完成" : c.docs.some((d) => d.myTurn) ? "待你確認簽署" : "待客戶簽署";

  return (
    <div className="rounded-lg border border-line bg-panel2 p-3 grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">{c.itemName}</span>
        <span className="text-11 text-tx3">{c.caseNo}・{c.serviceYear} 年度・{c.kind === "renewal" ? "年度續約" : "首次委任"}{c.from ? `・${c.from}～${c.to ?? ""}` : ""}</span>
        <span className="ml-auto text-11 rounded-full border border-line px-2 py-0.5 text-tx2">{CASE_LABEL[c.status] ?? c.status}</span>
      </div>
      {/* 三組狀態 */}
      <div className="grid sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-panel p-2">
          <div className="text-tx3">收款</div>
          <div className={`font-bold ${c.met ? "text-ok" : ""}`}>{fmtMoney0(c.confirmed)}／{fmtMoney0(c.amountDue)}{c.pending > 0 && <span className="text-brand2 font-normal ml-1">待查帳 {fmtMoney0(c.pending)}</span>}</div>
        </div>
        <div className="rounded-md bg-panel p-2">
          <div className="text-tx3">合約</div>
          <div className="font-bold">{contractLabel}{c.docs.length > 0 && <span className="font-normal text-tx2 ml-1">{c.docsDone}/{c.docsRequired}</span>}</div>
        </div>
        <div className="rounded-md bg-panel p-2">
          <div className="text-tx3">發票（公司處理）</div>
          <div className="font-bold">{c.invoice ? `${INV_LABEL[c.invoice.status] ?? c.invoice.status}${c.invoice.invoiceNo ? `・${c.invoice.invoiceNo}` : ""}` : c.met ? "待處理" : "—"}</div>
        </div>
      </div>
      {c.receipts.length > 0 && (
        <ul className="text-xs text-tx2 grid gap-0.5">
          {c.receipts.map((r) => (
            <li key={r.id} className="flex gap-2"><span>{r.on}</span><span>{fmtMoney0(r.gross ?? r.amount)}</span><span className="text-tx3">{PAYMENT_METHODS.find((m) => m.value === r.method)?.label ?? ""}</span>{r.refund > 0 && <span className="text-danger">退 {fmtMoney0(r.refund)}</span>}<span className={r.verified ? "text-ok" : "text-brand2"}>{r.verified ? "公司已確認" : "待查帳"}</span></li>
          ))}
        </ul>
      )}
      {c.docs.length > 0 && (
        <ul className="grid gap-1">
          {c.docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${d.status === "completed" ? "bg-ok" : d.status === "declined" ? "bg-danger" : d.myTurn ? "bg-brand" : "bg-line2"}`} />
              <span className="flex-1 truncate">{d.title} <span className="text-tx3">{d.signers}</span></span>
              {!readOnly && d.status === "pending" && !d.myTurn && (
                <button type="button" className="rounded-md border border-brand2 text-brand2 px-2.5 py-1 disabled:opacity-40" disabled={pending} onClick={() => start(async () => { const x = await remindAction(d.id); setErr(x.ok ? `已提醒 ${x.reminded?.join("、")}` : x.error ?? "失敗"); })}>催簽</button>
              )}
              <Link href={`/sign/${d.id}`} className={`rounded-md px-2.5 py-1 ${d.myTurn ? "bg-brand text-onbrand font-bold" : "border border-line"}`}>{d.myTurn ? "預覽並確認簽署" : d.status === "completed" ? "下載合約" : "查看進度"}</Link>
            </li>
          ))}
        </ul>
      )}
      {/* 動作 */}
      {!readOnly && c.status === "open" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!c.met && !paying && <button className="text-xs rounded-md border border-line2 px-2.5 py-1.5 text-tx2" onClick={() => setPaying(true)}>登錄付款</button>}
          {c.met && c.docs.length === 0 && <button className="text-xs rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={pending} onClick={startSign}>{pending ? "處理中…" : "啟動簽約流程"}</button>}
          {err && <span className="text-xs text-danger">{err}</span>}
          {needLogin && <span className="text-xs text-tx2">（上方「客戶登入」區塊可以產生專用連結）</span>}
        </div>
      )}
      {paying && (
        <div className="grid gap-2 rounded-md border border-line p-2">
          <div className="flex flex-wrap gap-2">
            <label className="grid gap-1 text-11 text-tx3">付款方式<select className={SELECT_SM} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
            <label className="grid gap-1 text-11 text-tx3">金額<input className={`${FIELD_SM} w-28 text-right`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="grid gap-1 text-11 text-tx3">客戶付款日<input type="date" className={`${FIELD_SM} w-40`} value={on} onChange={(e) => setOn(e.target.value)} /></label>
            {method === "bank" ? (
              <label className="grid gap-1 text-11 text-tx3">後五碼<input className={`${FIELD_SM} w-24`} value={last5} onChange={(e) => setLast5(e.target.value)} /></label>
            ) : (
              <label className="grid gap-1 text-11 text-tx3">實付總額（含手續費）<input className={`${FIELD_SM} w-28 text-right`} inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value)} /></label>
            )}
          </div>
          <div className="flex gap-2 text-xs">
            <button className="rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={pending} onClick={pay}>提報付款</button>
            <button className="text-tx2 px-2" onClick={() => setPaying(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
