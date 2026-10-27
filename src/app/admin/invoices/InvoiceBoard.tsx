"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { fmtMoney0 } from "@/lib/money";
import { saveInvoiceAction } from "./actions";

export type InvoiceRow = {
  caseType: "client_service" | "training";
  caseId: string;
  label: string;
  itemName: string;
  amountDue: number;
  confirmed: number;
  met: boolean;
  coachName: string;
  invoice: { buyerKind: string; title: string; taxId: string; email: string; carrier: string; invoiceNo: string; issuedOn: string | null; amount: number; status: string; failReason: string; note: string } | null;
};
const STATUS = [["pending", "待處理"], ["issued", "已開立"], ["failed", "開立失敗"], ["voided", "已作廢"], ["allowance", "折讓處理"]] as const;
const label = (s: string) => STATUS.find((x) => x[0] === s)?.[1] ?? s;

export default function InvoiceBoard({ rows }: { rows: InvoiceRow[] }) {
  const [tab, setTab] = useState<"todo" | "all">("todo");
  const list = rows.filter((r) => tab === "all" || !r.invoice || r.invoice.status === "pending" || r.invoice.status === "failed");
  return (
    <div className="grid gap-3">
      <div className="flex gap-1 text-xs">
        <button className={`rounded-md border px-2.5 py-1 ${tab === "todo" ? "border-brand2 text-brand2" : "border-line text-tx2"}`} onClick={() => setTab("todo")}>待處理</button>
        <button className={`rounded-md border px-2.5 py-1 ${tab === "all" ? "border-brand2 text-brand2" : "border-line text-tx2"}`} onClick={() => setTab("all")}>全部</button>
      </div>
      {list.length === 0 && <p className="text-sm text-tx3">沒有待處理的發票。</p>}
      {list.map((r) => <Row key={`${r.caseType}:${r.caseId}`} r={r} />)}
    </div>
  );
}

function Row({ r }: { r: InvoiceRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inv = r.invoice;
  const [f, setF] = useState({
    buyerKind: inv?.buyerKind ?? "person", title: inv?.title ?? r.label, taxId: inv?.taxId ?? "", email: inv?.email ?? "", carrier: inv?.carrier ?? "",
    invoiceNo: inv?.invoiceNo ?? "", issuedOn: inv?.issuedOn ?? "", amount: String(inv?.amount || r.confirmed || r.amountDue), status: inv?.status ?? "pending", failReason: inv?.failReason ?? "", note: inv?.note ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => start(async () => {
    const res = await saveInvoiceAction(r.caseType, r.caseId, { ...f, amount: Number(String(f.amount).replace(/,/g, "")) || 0, issuedOn: f.issuedOn || null });
    setMsg(res.ok ? "已儲存" : res.error);
    if (res.ok) { setOpen(false); router.refresh(); }
  });
  const st = inv?.status ?? "pending";
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-11 rounded px-1.5 py-0.5 bg-panel2 text-tx2">{r.caseType === "training" ? "培訓費" : "顧問服務"}</span>
        <span className="font-bold">{r.label}</span>
        <span className="text-tx2">{r.itemName}</span>
        {r.coachName && <span className="text-11 text-tx3">教練 {r.coachName}</span>}
        <span className={`text-xs ${r.met ? "text-ok" : "text-tx2"}`}>已確認 {fmtMoney0(r.confirmed)}／{fmtMoney0(r.amountDue)}</span>
        <span className={`ml-auto text-xs rounded px-2 py-0.5 ${st === "issued" ? "bg-ok/15 text-ok" : st === "failed" ? "bg-danger/15 text-danger" : "bg-panel2 text-tx2"}`}>{label(st)}{inv?.invoiceNo ? `・${inv.invoiceNo}` : ""}</span>
        <button className="text-xs rounded-md border border-line px-2.5 py-1" onClick={() => setOpen((o) => !o)}>{open ? "收合" : inv ? "編輯" : "回填發票"}</button>
      </div>
      {open && (
        <div className="grid gap-2 border-t border-line pt-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="grid gap-1 text-tx3">買受人<select className={SELECT_SM} value={f.buyerKind} onChange={(e) => set({ buyerKind: e.target.value })}><option value="person">個人</option><option value="company">公司</option></select></label>
            <label className="grid gap-1 text-tx3">抬頭<input className={`${FIELD_SM} w-44`} value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
            {f.buyerKind === "company" && <label className="grid gap-1 text-tx3">統編<input className={`${FIELD_SM} w-28`} value={f.taxId} onChange={(e) => set({ taxId: e.target.value })} /></label>}
            <label className="grid gap-1 text-tx3">Email<input className={`${FIELD_SM} w-48`} value={f.email} onChange={(e) => set({ email: e.target.value })} /></label>
            <label className="grid gap-1 text-tx3">載具<input className={`${FIELD_SM} w-32`} value={f.carrier} onChange={(e) => set({ carrier: e.target.value })} placeholder="/ABC1234" /></label>
            <label className="grid gap-1 text-tx3">發票號碼<input className={`${FIELD_SM} w-32`} value={f.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} /></label>
            <label className="grid gap-1 text-tx3">開立日期<input type="date" className={`${FIELD_SM} w-40`} value={f.issuedOn} onChange={(e) => set({ issuedOn: e.target.value })} /></label>
            <label className="grid gap-1 text-tx3">金額<input className={`${FIELD_SM} w-28 text-right`} inputMode="numeric" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
            <label className="grid gap-1 text-tx3">狀態<select className={SELECT_SM} value={f.status} onChange={(e) => set({ status: e.target.value })}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {(f.status === "failed" || f.status === "voided" || f.status === "allowance") && <label className="grid gap-1 text-tx3">原因／後續<input className={`${FIELD_SM} w-56`} value={f.failReason} onChange={(e) => set({ failReason: e.target.value })} /></label>}
            <label className="grid gap-1 text-tx3 flex-1 min-w-40">備註<input className={`${FIELD_SM} w-full`} value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button className="rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={busy} onClick={save}>儲存</button>
            {msg && <span className="text-tx2">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
