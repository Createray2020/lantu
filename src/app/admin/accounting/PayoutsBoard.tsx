"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { payoutsOf, prevYm, nextYm, isYm, type AcctState, type PayoutLine } from "@/lib/acctEngine";
import { markAcctPayoutAction } from "./actions";
import { useAcct, card, h2, hint, btn, xbtn, F, NUM } from "./AcctParts";

// 帳務 › 分潤匯款（2026/10/08）：回答「這個月要匯給誰、匯多少」。
// 應匯金額每次從收款明細算（不另存），只存「已匯」的紀錄（acct_payouts）。
// 首屏：待匯總額一個數＋每個受款人一條量表（已匯的那一段實色），點開看是哪幾筆湊的。
export default function PayoutsBoard({ initial, today }: { initial: AcctState; today: string }) {
  const { S, setS, run, status } = useAcct(initial);
  const keys = useMemo(() => Object.keys(S.receipts ?? {}).sort(), [S.receipts]);
  const [ym, setYm] = useState<string>(keys.includes(today) ? today : keys[keys.length - 1] ?? today);
  const [open, setOpen] = useState<string | null>(null);
  const sum = useMemo(() => payoutsOf(S, ym), [S, ym]);
  const max = Math.max(1, ...sum.lines.map((l) => l.due));

  const mark = (l: PayoutLine, paidOn: string, amount: number) => {
    const m = amount > 0 ? { paidOn, amount, note: l.mark?.note ?? "" } : null;
    setS((s) => {
      const all = { ...(s.payouts ?? {}) }, mm = { ...(all[ym] ?? {}) };
      if (m) mm[l.payee] = m; else delete mm[l.payee];
      all[ym] = mm;
      return { ...s, payouts: all };
    });
    run(() => markAcctPayoutAction(ym, l.payee, m ?? { amount: 0 }), m ? `已標 ${l.payee} 已匯` : `已取消 ${l.payee} 的已匯`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tx2">看哪一個月</span>
        <button className={btn} onClick={() => setYm(prevYm(ym))}>‹</button>
        <select className={SELECT_SM} value={keys.includes(ym) ? ym : ""} onChange={(e) => { if (isYm(e.target.value)) setYm(e.target.value); }}>
          {!keys.includes(ym) && <option value="">{ym}（還沒有收款）</option>}
          {keys.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className={btn} onClick={() => setYm(nextYm(ym))}>›</button>
        <Link href="/admin/accounting/receipts" className="text-xs text-tx3 hover:text-brand2">收款有漏？去收款明細補</Link>
        <span className="text-xs text-tx3 ml-auto">{status}</span>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h2}>{ym} 要匯出去的錢</h2>
          <span className="text-xs text-tx3">收款 {F(sum.received)}・公司實收 {F(sum.company)}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <Kpi l="應匯合計" v={F(sum.due)} />
          <Kpi l="已匯" v={F(sum.paid)} cls="text-ok" />
          <Kpi l="還要匯" v={F(sum.remaining)} cls={sum.remaining > 0 ? "text-danger" : "text-ok"} />
        </div>
        {sum.lines.length ? (
          <div className="mt-4 space-y-1.5" role="img" aria-label="各受款人應匯金額">
            {sum.lines.map((l) => (
              <div key={l.payee} className="flex items-center gap-2 text-sm">
                <span className="w-28 truncate" title={l.payee}>{l.payee}</span>
                <div className="flex-1 h-4 rounded bg-line overflow-hidden relative">
                  <i className="absolute inset-y-0 left-0 bg-brand2 opacity-30" style={{ width: `${l.due / max * 100}%` }} />
                  <i className="absolute inset-y-0 left-0 bg-ok" style={{ width: `${Math.min(l.due, l.mark?.amount ?? 0) / max * 100}%` }} />
                </div>
                <span className={`w-24 text-right tabular-nums ${l.remaining > 0.5 ? "" : "text-ok"}`}>{F(l.due)}</span>
                <span className="w-14 text-xs text-tx3 text-right">{l.mark ? (l.remaining > 0.5 ? "部分" : "已匯") : "未匯"}</span>
              </div>
            ))}
          </div>
        ) : <p className={`${hint} mt-3`}>這個月沒有要匯出去的錢。</p>}
        {sum.warns.length > 0 && <ul className="mt-3 text-xs text-danger space-y-0.5">{sum.warns.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
      </div>

      {sum.lines.length > 0 && (
        <div className={card}>
          <h2 className={h2}>對帳表：匯給誰、匯多少</h2>
          <p className={`${hint} mb-2`}>點受款人看這筆錢是哪幾筆收款湊出來的。匯完填日期按「標已匯」；金額預設＝應匯，分批匯就改成這次匯的數字。</p>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-tx3"><th className="text-left py-1">受款人</th><th className="text-right">應匯</th><th className="text-right">來自</th><th className="text-right">已匯</th><th className="text-left pl-4">匯款日</th><th /></tr></thead>
            <tbody>
              {sum.lines.map((l) => (
                <PayoutRow key={`${ym}-${l.payee}`} l={l} isOpen={open === l.payee} onToggle={() => setOpen(open === l.payee ? null : l.payee)} onMark={(d, a) => mark(l, d, a)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ l, v, cls }: { l: string; v: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <div className="text-xs text-tx3">{l}</div>
      <div className={`text-lg font-bold ${cls ?? ""}`}>{v}</div>
    </div>
  );
}

function PayoutRow({ l, isOpen, onToggle, onMark }: { l: PayoutLine; isOpen: boolean; onToggle: () => void; onMark: (paidOn: string, amount: number) => void }) {
  const [date, setDate] = useState(l.mark?.paidOn || new Date().toISOString().slice(0, 10));
  const [amt, setAmt] = useState<number>(l.mark?.amount ?? Math.round(l.due));
  const done = !!l.mark && l.remaining <= 0.5;
  return (
    <>
      <tr className={`border-t border-line ${done ? "text-tx3" : ""}`}>
        <td className="py-1.5"><button className="hover:text-brand2 text-left" onClick={onToggle}>{isOpen ? "▾" : "▸"} {l.payee}</button></td>
        <td className="text-right tabular-nums font-bold">{F(l.due)}</td>
        <td className="text-right text-tx3">{l.srcs.length} 筆</td>
        <td className="text-right">
          {l.mark ? <span className="text-ok">{F(l.mark.amount)}</span> : <input className={`${FIELD_SM} w-24 text-right`} inputMode="numeric" value={amt} onChange={(e) => setAmt(NUM(e.target.value))} />}
        </td>
        <td className="pl-4">
          {l.mark ? <span className="text-xs">{l.mark.paidOn || "—"}</span> : <input type="date" className={`${FIELD_SM} w-36`} value={date} onChange={(e) => setDate(e.target.value)} />}
        </td>
        <td className="text-right whitespace-nowrap">
          {l.mark
            ? <button className={xbtn} onClick={() => onMark("", 0)}>取消已匯</button>
            : <button className={`${btn} border-ok text-ok`} disabled={!(amt > 0)} onClick={() => onMark(date, amt)}>標已匯</button>}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-panel2"><td colSpan={6} className="p-2">
          <table className="w-full text-xs">
            <tbody>
              {l.srcs.map((s, i) => (
                <tr key={i} className="text-tx2">
                  <td className="py-0.5 w-24">{s.on}</td><td>{s.itemName}</td><td>{s.payer}</td><td className="text-tx3">{s.label}</td><td className="text-right tabular-nums">{F(s.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </td></tr>
      )}
    </>
  );
}
