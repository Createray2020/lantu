"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { payoutsOf, prevYm, nextYm, isYm, bankLine, TAX_MODE_LABEL, type AcctState, type PayoutLine } from "@/lib/acctEngine";
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
  const max = Math.max(1, ...sum.lines.map((l) => l.tax.net));
  const missing = sum.lines.filter((l) => !l.rec || !bankLine(l.rec) || !l.rec.taxMode);

  const mark = (l: PayoutLine, paidOn: string, amount: number) => {
    const m = amount > 0 ? { paidOn, amount, note: l.mark?.note ?? "" } : null;
    setS((s) => {
      const all = { ...(s.payouts ?? {}) }, mm = { ...(all[ym] ?? {}) };
      if (m) mm[l.key] = m; else delete mm[l.key];
      all[ym] = mm;
      return { ...s, payouts: all };
    });
    run(() => markAcctPayoutAction(ym, l.key, m ?? { amount: 0 }), m ? `已標 ${l.payee} 已匯` : `已取消 ${l.payee} 的已匯`);
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
          <span className="text-xs text-tx3">結算 {ym} 入帳・發放日 {sum.payDate}（每月 5 日，遇假日提前）・收款 {F(sum.received)}・公司實收 {F(sum.company)}</span>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-3">
          <Kpi l="應付合計" v={F(sum.due)} />
          <Kpi l="扣繳後實匯" v={F(sum.net)} sub={sum.due - sum.net > 0 ? `扣繳 ${F(sum.due - sum.net)}` : ""} />
          <Kpi l="已匯" v={F(sum.paid)} cls="text-ok" />
          <Kpi l="還要匯" v={F(sum.remaining)} cls={sum.remaining > 0 ? "text-danger" : "text-ok"} />
        </div>
        {sum.lines.length ? (
          <div className="mt-4 space-y-1.5" role="img" aria-label="各受款人應匯金額">
            {sum.lines.map((l) => (
              <div key={l.payee} className="flex items-center gap-2 text-sm">
                <span className="w-28 truncate" title={l.payee}>{l.payee}</span>
                <div className="flex-1 h-4 rounded bg-line overflow-hidden relative">
                  <i className="absolute inset-y-0 left-0 bg-brand2 opacity-30" style={{ width: `${l.tax.net / max * 100}%` }} />
                  <i className="absolute inset-y-0 left-0 bg-ok" style={{ width: `${Math.min(l.tax.net, l.mark?.amount ?? 0) / max * 100}%` }} />
                </div>
                <span className={`w-24 text-right tabular-nums ${l.remaining > 0.5 ? "" : "text-ok"}`}>{F(l.tax.net)}</span>
                <span className="w-14 text-xs text-tx3 text-right">{l.mark ? (l.remaining > 0.5 ? "部分" : "已匯") : "未匯"}</span>
              </div>
            ))}
          </div>
        ) : <p className={`${hint} mt-3`}>這個月沒有要匯出去的錢。</p>}
        {sum.warns.length > 0 && <ul className="mt-3 text-xs text-danger space-y-0.5">{sum.warns.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
        {missing.length > 0 && <p className="mt-3 text-xs text-danger">⚠ 還沒填帳號或稅務方式：{missing.map((l) => l.payee).join("、")} → <Link href="/admin/accounting/payees" className="underline">去受款人</Link></p>}
      </div>

      {sum.lines.length > 0 && (
        <div className={card}>
          <h2 className={h2}>對帳表：匯給誰、匯多少</h2>
          <p className={`${hint} mb-2`}>點 ▸ 看這筆錢是哪幾筆收款湊出來的；「對帳單」是給對方的那一張。匯完填日期按「標已匯」；金額預設＝實匯，分批匯就改成這次匯的數字。</p>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-tx3"><th className="text-left py-1">受款人</th><th className="text-left">匯入</th><th className="text-right">應付</th><th className="text-right">扣繳</th><th className="text-right">實匯</th><th className="text-right">已匯</th><th className="text-left pl-4">匯款日</th><th /></tr></thead>
            <tbody>
              {sum.lines.map((l) => (
                <PayoutRow key={`${ym}-${l.key}`} ym={ym} l={l} isOpen={open === l.key} onToggle={() => setOpen(open === l.key ? null : l.key)} onMark={(d, a) => mark(l, d, a)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ l, v, cls, sub }: { l: string; v: string; cls?: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <div className="text-xs text-tx3">{l}</div>
      <div className={`text-lg font-bold ${cls ?? ""}`}>{v}</div>
      {sub ? <div className="text-xs text-tx3">{sub}</div> : null}
    </div>
  );
}

function PayoutRow({ ym, l, isOpen, onToggle, onMark }: { ym: string; l: PayoutLine; isOpen: boolean; onToggle: () => void; onMark: (paidOn: string, amount: number) => void }) {
  const [date, setDate] = useState(l.mark?.paidOn || new Date().toISOString().slice(0, 10));
  const [amt, setAmt] = useState<number>(l.mark?.amount ?? Math.round(l.tax.net));
  const done = !!l.mark && l.remaining <= 0.5;
  const bank = bankLine(l.rec);
  const tx = l.tax.withhold + l.tax.nhi;
  return (
    <>
      <tr className={`border-t border-line ${done ? "text-tx3" : ""}`}>
        <td className="py-1.5 whitespace-nowrap">
          <button className="hover:text-brand2 text-left" onClick={onToggle}>{isOpen ? "▾" : "▸"} {l.payee}</button>
          <Link href={`/admin/accounting/payouts/statement?key=${encodeURIComponent(l.key)}&ym=${ym}`} className="text-xs text-tx3 hover:text-brand2 ml-2 underline">對帳單</Link>
          <div className="text-10 text-tx3">{l.srcs.length} 筆・{l.rec ? TAX_MODE_LABEL[l.rec.taxMode] : "未建受款人"}{l.rec?.taxMode === "invoice" ? "（要收發票）" : ""}</div>
        </td>
        <td className="text-xs text-tx2 max-w-56 truncate" title={bank ? `${bank}${l.rec?.accountName ? `　戶名 ${l.rec.accountName}` : ""}` : ""}>{bank || <span className="text-danger">未填帳號</span>}</td>
        <td className="text-right tabular-nums">{F(l.due)}</td>
        <td className="text-right tabular-nums text-tx3">{tx ? `−${F(tx)}` : "—"}</td>
        <td className="text-right tabular-nums font-bold">{F(l.tax.net)}</td>
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
        <tr className="bg-panel2"><td colSpan={8} className="p-2">
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
