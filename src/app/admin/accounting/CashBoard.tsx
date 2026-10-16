"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import {
  cashLedger, cashFixedStatus, isYm, prevYm, nextYm, CASH_CAT_FIXED, CASH_CATS_IN, CASH_CATS_OUT,
  type AcctState, type CashEntry, type CashMonth, type CashRow,
} from "@/lib/acctEngine";
import { saveCashOpeningAction, saveCashEntryAction, deleteCashEntryAction } from "./actions";
import { useAcct, card, h2, hint, btn, xbtn, F, NUM, uid } from "./AcctParts";

// 帳務 › 現金帳（2026/10/16 Ray）：一個公司帳戶。
// 一句話結論：「帳戶現在應該有多少」。首屏一個大數＋逐月流入／流出（期末餘額一條線），底下才是日記帳。
// 自動列：收款（已確認、未作廢，實收）＝流入；分潤「已匯」＝流出。手記列：固定支出實付、稅費、其他收支（acct_cash）。
// 固定支出不自動視為已付（Ray 拍板逐筆記實付）：本月帳務的固定支出列在這裡顯示「還沒記實付」，一鍵帶入。
export default function CashBoard({ initial, today }: { initial: AcctState; today: string }) {
  const { S, setS, run, status, pending } = useAcct(initial);
  const L = useMemo(() => cashLedger(S), [S]);
  const monthKeys = useMemo(() => Array.from(new Set([...Object.keys(S.months), ...L.months.map((m) => m.ym)])).sort(), [S.months, L.months]);
  const [ym, setYm] = useState<string>(monthKeys.includes(today) ? today : monthKeys[monthKeys.length - 1] ?? today);
  const [editing, setEditing] = useState<CashEntry | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const rows = useMemo(() => L.rows.filter((r) => r.ym === ym), [L.rows, ym]);
  const m = L.months.find((x) => x.ym === ym) ?? null;
  const fixed = useMemo(() => cashFixedStatus(S, ym), [S, ym]);
  const unpaidFixed = fixed.filter((f) => !f.paid && f.amt > 0);
  const recent = L.months.slice(-8);

  const setEntries = (fn: (es: CashEntry[]) => CashEntry[]) => setS((s) => ({ ...s, cash: { opening: s.cash?.opening ?? { amount: 0, from: "" }, entries: fn(s.cash?.entries ?? []) } }));
  const save = (e: CashEntry) => {
    const id = e.id || null;
    const local = { ...e, id: e.id || `tmp-${uid()}` };
    setEntries((es) => [...es.filter((x) => x.id !== local.id), local]);
    setEditing(null);
    if (e.on.slice(0, 7) !== ym && isYm(e.on.slice(0, 7))) setYm(e.on.slice(0, 7));
    run(async () => {
      const res = await saveCashEntryAction(id, e);
      if (res.ok && res.info && res.info !== local.id) setEntries((es) => es.map((x) => x.id === local.id ? { ...x, id: res.info! } : x));
      return res;
    }, id ? "已改這一筆" : "已記一筆");
  };
  const remove = async (r: CashRow) => {
    if (!await confirmDialog(`刪除 ${r.on} ${r.name} 的 ${F(r.amount)}？`, { danger: true })) return;
    setEntries((es) => es.filter((x) => x.id !== r.id));
    run(() => deleteCashEntryAction(r.id), "已刪");
  };
  const saveOpening = (amount: number, from: string) => {
    setS((s) => ({ ...s, cash: { opening: { amount, from }, entries: s.cash?.entries ?? [] } }));
    setOpenEdit(false);
    run(() => saveCashOpeningAction({ amount, from }), "期初餘額已存");
  };
  const defaultOn = ym === today.slice(0, 7) ? today : `${ym}-01`;
  const payFixed = (name: string, amt: number) => setEditing({ id: "", on: defaultOn, kind: "out", amount: amt, cat: CASH_CAT_FIXED, name, note: "" });

  return (
    <div className="space-y-4">
      {/* 首屏：帳戶現在應該有多少 */}
      <div className={card}>
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start">
          <div>
            <div className="text-xs text-tx3">帳戶現在應該有</div>
            <div className={`text-3xl font-extrabold tabular-nums ${L.balance < 0 ? "text-danger" : ""}`}>{F(L.balance)}</div>
            <div className="text-xs text-tx3 mt-1">
              期初 {F(L.opening.amount)}{L.opening.from ? `（${L.opening.from} 起算）` : ""} ＋ 流入 {F(L.inflow)} − 流出 {F(L.outflow)}
              <button className="ml-2 underline hover:text-brand2" onClick={() => setOpenEdit(!openEdit)}>{openEdit ? "收起" : "改期初"}</button>
            </div>
            {openEdit && <OpeningForm init={L.opening} pending={pending} onSave={saveOpening} />}
            {L.warns.map((w) => <p key={w} className="text-xs text-danger mt-1">⚠ {w}</p>)}
          </div>
          <div>
            {recent.length ? <CashBars months={recent} current={ym} onPick={setYm} /> : <p className={hint}>還沒有任何進出。收款明細確認入帳、分潤標已匯之後會自動出現在這裡。</p>}
          </div>
        </div>
      </div>

      {/* 月份列 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tx2">看哪一個月</span>
        <button className={btn} onClick={() => setYm(prevYm(ym))}>‹</button>
        <select className={SELECT_SM} value={monthKeys.includes(ym) ? ym : ""} onChange={(e) => { if (isYm(e.target.value)) setYm(e.target.value); }}>
          {!monthKeys.includes(ym) && <option value="">{ym}（還沒有進出）</option>}
          {monthKeys.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className={btn} onClick={() => setYm(nextYm(ym))}>›</button>
        <button className={`${btn} border-brand2 text-brand2`} disabled={!!editing} onClick={() => setEditing({ id: "", on: defaultOn, kind: "out", amount: 0, cat: CASH_CATS_OUT[CASH_CATS_OUT.length - 1], name: "", note: "" })}>＋ 記一筆</button>
        <span className="text-xs text-tx3 ml-auto">{status}</span>
      </div>

      {/* 本月現金流量表 */}
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className={h2}>{ym} 現金流量</h2>
          <span className="text-xs text-tx3">{m ? `${m.n} 筆` : "沒有進出"}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi l="期初" v={F(m?.opening ?? openingBefore(L, ym))} />
          <Kpi l="流入" v={F(m?.inflow ?? 0)} cls="text-ok" />
          <Kpi l="流出" v={F(m?.outflow ?? 0)} cls="text-danger" />
          <Kpi l="期末" v={F(m?.closing ?? openingBefore(L, ym))} cls="text-brand2" />
        </div>
        {m && Object.keys(m.byCat).length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-tx2">
            {Object.entries(m.byCat).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, v]) => <span key={k}>{k} <b className={v >= 0 ? "text-ok" : "text-danger"}>{v >= 0 ? "+" : "−"}{F(Math.abs(v))}</b></span>)}
          </div>
        )}
        {unpaidFixed.length > 0 && (
          <div className="mt-3 rounded-lg bg-panel2 p-3">
            <div className="text-xs text-tx2 mb-1">本月帳務的固定支出還沒記實付（付了才算流出）：</div>
            <div className="flex flex-wrap gap-2">
              {unpaidFixed.map((f) => <button key={f.name} className={`${btn} text-xs`} disabled={!!editing} onClick={() => payFixed(f.name, f.amt)}>記實付：{f.name} {F(f.amt)}</button>)}
              <Link href="/admin/accounting/monthly" className="text-xs text-tx3 self-center hover:text-brand2">固定支出列在本月帳務</Link>
            </div>
          </div>
        )}
      </div>

      {editing && <EntryForm key={editing.id || "new"} init={editing} pending={pending} onCancel={() => setEditing(null)} onSave={save} />}

      {/* 日記帳 */}
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className={h2}>{ym} 日記帳</h2>
          <span className="text-xs text-tx3">收款、分潤匯款是自動列（到來源頁改）；其他可以改、可以刪</span>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-tx3"><th className="text-left py-1 whitespace-nowrap">日期</th><th className="text-left">類別</th><th className="text-left">內容</th><th className="text-right">流入</th><th className="text-right">流出</th><th className="text-right">餘額</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-1.5 whitespace-nowrap">{r.on}</td>
                    <td className="whitespace-nowrap"><span className={`text-10 rounded-full border px-2 py-0.5 ${r.src === "manual" ? "border-line text-tx2" : "border-brand2 text-brand2"}`}>{r.cat || "—"}</span></td>
                    <td>{r.name}{r.note && <div className="text-xs text-tx3">{r.note}</div>}</td>
                    <td className="text-right tabular-nums text-ok">{r.kind === "in" ? F(r.amount) : ""}</td>
                    <td className="text-right tabular-nums text-danger">{r.kind === "out" ? F(r.amount) : ""}</td>
                    <td className={`text-right tabular-nums ${r.balance < 0 ? "text-danger" : "text-tx2"}`}>{F(r.balance)}</td>
                    <td className="text-right whitespace-nowrap">
                      {r.src === "receipt" && <Link href="/admin/accounting/receipts" className="text-xs text-tx3 hover:text-brand2 px-1 no-underline">收款明細 ›</Link>}
                      {r.src === "payout" && <Link href="/admin/accounting/payouts" className="text-xs text-tx3 hover:text-brand2 px-1 no-underline">分潤匯款 ›</Link>}
                      {r.src === "manual" && (<>
                        <button className="text-xs text-tx3 hover:text-tx px-1" onClick={() => setEditing({ id: r.id, on: r.on, kind: r.kind, amount: r.amount, cat: r.cat, name: r.name, note: r.note })}>改</button>
                        <button className={xbtn} onClick={() => remove(r)}>✕</button>
                      </>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={hint}>這個月還沒有進出。</p>}
      </div>
    </div>
  );
}

/** 某月沒有任何進出時的期初＝上一個有進出的月份期末（沒有就是期初餘額）。 */
function openingBefore(L: ReturnType<typeof cashLedger>, ym: string): number {
  const prev = L.months.filter((m) => m.ym < ym);
  return prev.length ? prev[prev.length - 1].closing : L.opening.amount;
}

function Kpi({ l, v, cls }: { l: string; v: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <div className="text-xs text-tx3">{l}</div>
      <div className={`text-lg font-bold tabular-nums ${cls ?? ""}`}>{v}</div>
    </div>
  );
}

/** 逐月流入（上）／流出（下）兩根柱＋期末餘額一條線。點月份切換。 */
function CashBars({ months, current, onPick }: { months: CashMonth[]; current: string; onPick: (ym: string) => void }) {
  const W = 560, H = 170, padX = 8, top = 16, bottom = 18, mid = top + (H - top - bottom) / 2;
  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.inflow, m.outflow)));
  const maxBal = Math.max(1, ...months.map((m) => Math.abs(m.closing)));
  const bw = (W - padX * 2) / months.length;
  const half = (H - top - bottom) / 2 - 14;
  const pts = months.map((m, i) => ({ x: padX + i * bw + bw / 2, y: mid - m.closing / maxBal * half }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="逐月流入、流出與期末餘額">
      <line x1={padX} x2={W - padX} y1={mid} y2={mid} stroke="var(--line2)" />
      {months.map((m, i) => {
        const x = padX + i * bw + 6, w = Math.max(2, bw - 12);
        const hi = m.inflow / maxBar * half, ho = m.outflow / maxBar * half;
        const cur = m.ym === current;
        return (
          <g key={m.ym} className="cursor-pointer" onClick={() => onPick(m.ym)}>
            <rect x={x} y={mid - hi} width={w} height={Math.max(0, hi)} rx={2} fill="var(--ok)" opacity={cur ? 0.9 : 0.4} />
            <rect x={x} y={mid} width={w} height={Math.max(0, ho)} rx={2} fill="var(--danger)" opacity={cur ? 0.9 : 0.4} />
            <text x={x + w / 2} y={H - 4} textAnchor="middle" fontSize={11} fill={cur ? "var(--tx)" : "var(--tx3)"} fontWeight={cur ? 700 : 400}>{m.ym.slice(2)}</text>
          </g>
        );
      })}
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--brand2)" strokeWidth={2} />
      {pts.map((p, i) => (
        <g key={months[i].ym}>
          <circle cx={p.x} cy={p.y} r={3} fill="var(--brand2)" />
          <text x={p.x} y={p.y - 6} textAnchor="middle" fontSize={10} fill="var(--brand2)">{F(months[i].closing)}</text>
        </g>
      ))}
      <text x={padX} y={top - 4} fontSize={10} fill="var(--tx3)">綠＝流入　紅＝流出　線＝期末餘額</text>
    </svg>
  );
}

function OpeningForm({ init, pending, onSave }: { init: { amount: number; from: string }; pending: boolean; onSave: (amount: number, from: string) => void }) {
  const [amt, setAmt] = useState(String(init.amount || ""));
  const [from, setFrom] = useState(init.from);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-tx2">期初餘額</span>
      <input className={`${FIELD_SM} w-32 text-right`} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <span className="text-tx2">從</span>
      <input type="date" className={`${FIELD_SM} w-36`} value={from} onChange={(e) => setFrom(e.target.value)} />
      <span className="text-tx2">起算</span>
      <button className={`${btn} border-brand2 text-brand2`} disabled={pending} onClick={() => onSave(NUM(amt), from)}>存</button>
      <span className={hint}>期初＝那一天開始前帳戶裡的錢；之後的進出都從這裡往下累計。</span>
    </div>
  );
}

function EntryForm({ init, pending, onCancel, onSave }: { init: CashEntry; pending: boolean; onCancel: () => void; onSave: (e: CashEntry) => void }) {
  const [e, setE] = useState<CashEntry>(init);
  const [amt, setAmt] = useState(init.amount ? String(init.amount) : "");
  const cats = e.kind === "in" ? CASH_CATS_IN : CASH_CATS_OUT;
  const ok = !!e.on && NUM(amt) > 0 && !!e.name.trim();
  const setKind = (kind: "in" | "out") => setE({ ...e, kind, cat: kind === "in" ? CASH_CATS_IN[0] : CASH_CATS_OUT[CASH_CATS_OUT.length - 1] });
  return (
    <div className={`${card} border-brand2`}>
      <h2 className={h2}>{e.id ? "改這一筆" : "記一筆"}</h2>
      <div className="flex flex-wrap items-end gap-3 mt-2 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">收／支</span>
          <select className={SELECT_SM} value={e.kind} onChange={(ev) => setKind(ev.target.value as "in" | "out")}><option value="out">支出</option><option value="in">收入</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">日期</span>
          <input type="date" className={`${FIELD_SM} w-36`} value={e.on} onChange={(ev) => setE({ ...e, on: ev.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">類別</span>
          <select className={SELECT_SM} value={cats.includes(e.cat) ? e.cat : "__other"} onChange={(ev) => setE({ ...e, cat: ev.target.value === "__other" ? "" : ev.target.value })}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}<option value="__other">自訂…</option>
          </select></label>
        {!cats.includes(e.cat) && <label className="flex flex-col gap-1"><span className="text-xs text-tx3">自訂類別</span>
          <input className={`${FIELD_SM} w-28`} value={e.cat} onChange={(ev) => setE({ ...e, cat: ev.target.value })} /></label>}
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">內容</span>
          <input className={`${FIELD_SM} w-56`} value={e.name} placeholder="記帳費 10 月／房租…" onChange={(ev) => setE({ ...e, name: ev.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">金額</span>
          <input className={`${FIELD_SM} w-28 text-right`} inputMode="numeric" value={amt} onChange={(ev) => setAmt(ev.target.value)} /></label>
        <label className="flex flex-col gap-1 flex-1 min-w-40"><span className="text-xs text-tx3">備註</span>
          <input className={`${FIELD_SM} w-full`} value={e.note} onChange={(ev) => setE({ ...e, note: ev.target.value })} /></label>
        <div className="flex gap-2">
          <button className={`${btn} border-brand2 text-brand2`} disabled={!ok || pending} onClick={() => onSave({ ...e, amount: NUM(amt), name: e.name.trim(), cat: e.cat.trim() })}>{e.id ? "存" : "記下來"}</button>
          <button className={btn} onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
