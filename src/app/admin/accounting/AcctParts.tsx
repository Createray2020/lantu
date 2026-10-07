"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionResult } from "./actions";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { fmtMoney0 } from "@/lib/money";
import Link from "next/link";
import {
  calcData, suggestQty, isYm, unitOf, SPLIT_MODE_LABEL, ACCT_DEFAULT_PARAMS,
  type AcctState, type AcctItem, type AcctMonth, type AcctTarget, type AcctAdj, type MonthResult, type Compare, type SysRow, type AcctSource, type AcctParams, type SplitMode,
} from "@/lib/acctEngine";

// 帳務三頁共用的元件與常數（2026/09/29 拆頁：參數設定／目標設定／本月帳務）。
// 版面與公式照原型 docs/帳務後台_原型.html；引擎在 lib/acctEngine.ts。

export const F = fmtMoney0;
export const P = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : "—") + "%";
export const D = (n: number) => (n >= 0 ? "+" : "−") + F(Math.abs(n));
export const uid = () => Math.random().toString(36).slice(2, 8);
export const btn = "rounded-lg border border-line2 px-3 py-1.5 text-sm text-tx2 hover:bg-panel3 disabled:opacity-40";
export const xbtn = "text-xs text-tx3 hover:text-danger px-1";
export const card = "rounded-xl border border-line bg-panel p-5 shadow-e1";
export const h2 = "text-sm font-bold border-l-[3px] border-brand2 pl-2 mb-1";
export const hint = "text-xs text-tx3 leading-relaxed";
export const numIn = `${FIELD_SM} w-24 text-right`;
export const nameIn = `${FIELD_SM} w-40`;
export const NUM = (v: string) => { const x = Number(String(v).replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
export const diffCls = (n: number) => (n > 0 ? "text-ok" : n < 0 ? "text-danger" : "text-tx3");
export const EMPTY: AcctMonth = { qty: {}, fixed: [] };

/** 三頁共用的狀態殼：本地一份 S，先改本地再打 action，訊息列統一。 */
export function useAcct(initial: AcctState) {
  const [S, setS] = useState<AcctState>({ ...initial, targets: initial.targets ?? {} });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, okMsg: string) =>
    start(async () => { const r = await fn(); if (r.ok) { setMsg(okMsg); setErr(null); } else { setErr(r.error); setMsg(null); } });
  const status = pending ? "存檔中…" : err ? <span className="text-danger">{err}</span> : msg ?? "";
  return { S, setS, run, pending, status };
}

/** 數量表＋固定支出表：實際與目標共用同一套畫面。keyTag 換了輸入框才會重置（defaultValue 非受控）。 */
export function MonthEditor({ data, res, refQty, refLabel, label, keyTag, onSave, sys, onVoid }: {
  data: AcctMonth; res: MonthResult; refQty?: Record<string, number>; refLabel: string; label: string; keyTag: string; onSave: (m: AcctMonth) => void;
  sys?: SysRow[]; onVoid?: (id: string, v: boolean) => void;
}) {
  const [openSys, setOpenSys] = useState<string | null>(null);
  const hasSys = !!sys?.length;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs text-tx2 mb-2">{label}筆數</h3>
        <table key={`q-${keyTag}`} className="w-full text-sm">
          <thead><tr className="text-xs text-tx3"><th className="text-left py-1">項目</th><th className="text-right">{refLabel}</th><th className="text-right">{label}筆數</th><th className="text-right">營業額</th><th className="text-right">毛利</th><th className="text-right">佔毛利</th></tr></thead>
          <tbody>
            {res.byItem.map((b) => (
              <tr key={b.it.id} className="border-t border-line">
                <td className="py-1.5">{b.it.name}</td>
                <td className="text-right text-tx3">{refQty ? (refQty[b.it.id] ?? 0) : "—"}</td>
                <td className="text-right whitespace-nowrap">
                  {b.rcN ? <Link href="/admin/accounting/receipts" className="text-xs mr-1 text-brand2 hover:underline" title="逐筆收款（對帳表）記的筆數，到收款明細改">收款 {b.rcN} ＋</Link> : null}
                  {hasSys && b.it.source ? <button className={`text-xs mr-1 ${b.sysN ? "text-brand2" : "text-tx3"} hover:underline`} onClick={() => setOpenSys(openSys === b.it.id ? null : b.it.id)}>系統 {b.sysN} ＋</button> : null}
                  <input className={`${FIELD_SM} w-16 text-right`} inputMode="numeric" defaultValue={data.qty[b.it.id] ?? 0} onBlur={(e) => { const v = NUM(e.target.value); if (v !== (data.qty[b.it.id] ?? 0)) onSave({ ...data, qty: { ...data.qty, [b.it.id]: v } }); }} />
                </td>
                <td className="text-right">{F(b.rev)}</td>
                <td className="text-right text-brand2">{F(b.gp)}</td>
                <td className="text-right text-tx2">{res.gp ? P(b.gp / res.gp * 100) : "—"}</td>
              </tr>
            ))}
            {openSys && sys && (
              <tr className="border-t border-line bg-panel2"><td colSpan={6} className="p-2">
                <div className={`${hint} mb-1`}>系統入帳：{res.byItem.find((b) => b.it.id === openSys)?.it.name}。作廢＝不計入但留痕（免費、退費）。</div>
                {sys.filter((x) => x.itemId === openSys).length ? sys.filter((x) => x.itemId === openSys).map((x) => (
                  <div key={x.id} className={`flex items-center gap-3 text-xs py-0.5 ${x.void ? "text-tx3 line-through" : ""}`}>
                    <span className="w-24 truncate">{x.coachName}</span>
                    <span className="text-tx3">{x.source === "apply" ? "報聘核准" : "培訓帳號"}</span>
                    <span className="text-tx3">{x.createdAt.slice(0, 10)}</span>
                    <span className="ml-auto">{F(x.amount)}</span>
                    {onVoid && <button className="text-tx3 hover:text-tx" onClick={() => onVoid(x.id, !x.void)}>{x.void ? "恢復" : "作廢"}</button>}
                  </div>
                )) : <div className="text-xs text-tx3">這個月沒有系統入帳。</div>}
              </td></tr>
            )}
            <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td /><td className="text-right">{res.byItem.reduce((a, b) => a + b.q, 0)}</td><td className="text-right">{F(res.rev)}</td><td className="text-right text-brand2">{F(res.gp)}</td><td className="text-right">{P(res.gm * 100)}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="text-xs text-tx2 mb-2">{label}固定支出（每月）</h3>
        <table key={`f-${keyTag}`} className="w-full text-sm">
          <thead><tr className="text-xs text-tx3"><th className="text-left py-1">項目</th><th className="text-right">每月金額</th><th /></tr></thead>
          <tbody>
            {data.fixed.map((f, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1.5"><input className={nameIn} defaultValue={f.name} onBlur={(e) => { if (e.target.value !== f.name) onSave({ ...data, fixed: data.fixed.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }); }} /></td>
                <td className="text-right"><input className={numIn} inputMode="numeric" defaultValue={f.amt} onBlur={(e) => { const v = NUM(e.target.value); if (v !== f.amt) onSave({ ...data, fixed: data.fixed.map((x, j) => j === i ? { ...x, amt: v } : x) }); }} /></td>
                <td className="text-right"><button className={xbtn} onClick={() => onSave({ ...data, fixed: data.fixed.filter((_, j) => j !== i) })}>✕</button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td className="text-right">{F(data.fixed.reduce((a, f) => a + f.amt, 0))}</td><td /></tr>
          </tbody>
        </table>
        <button className={`${btn} mt-2`} onClick={() => onSave({ ...data, fixed: [...data.fixed, { name: "新支出", amt: 0 }] })}>＋ 新增固定支出</button>
      </div>
    </div>
  );
}

// ---------- 目標工作台 ----------
export function TargetWorkbench({ S, draft, onSave, onStore, latestYm, today, pending }: {
  S: AcctState; draft: AcctTarget | null; onSave: (d: AcctTarget) => void; onStore: (ym: string) => void; latestYm: string | null; today: string; pending: boolean;
}) {
  const [adj, setAdj] = useState<Required<AcctAdj>>({ price: 0, split: 0, qty: 0, fix: 0 });
  const [baseYm, setBaseYm] = useState<string>(latestYm ?? "");
  const [storeYm, setStoreYm] = useState<string>(today);
  const d: AcctTarget = useMemo(() => draft ?? { qty: {}, fixed: [], net: 0 }, [draft]);
  const res = useMemo(() => calcData(S.items, d, S.params), [S.items, S.params, d]);
  const w = useMemo(() => calcData(S.items, d, S.params, adj), [S.items, S.params, d, adj]);
  const base = baseYm ? S.months[baseYm] : undefined;
  const monthKeys = Object.keys(S.months).sort();
  const suggest = () => {
    const b = base ?? { qty: { ...d.qty }, fixed: d.fixed };
    onSave({ qty: suggestQty(S.items, b, d.net, S.params), fixed: (base ? base.fixed : d.fixed).map((f) => ({ ...f })), net: d.net });
  };
  const netOk = res.net >= d.net;
  const sens = {
    split1: calcData(S.items, d, S.params, { split: -1 }).net - res.net,
    price1: calcData(S.items, d, S.params, { price: 1 }).net - res.net,
    qty1: calcData(S.items, d, S.params, { qty: 1 }).net - res.net,
  };
  return (
    <div className={`${card} border-brand2/40`}>
      <h2 className={h2}>目標工作台</h2>
      <p className={`${hint} mb-3`}>目標不綁月份：先設目標淨利、把每項筆數與固定支出調到算出來的淨利過線，再存入哪一個月。存入前這裡的東西不會動到任何月帳。</p>
      <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
        <span>目標淨利</span>
        <input className={numIn} inputMode="numeric" defaultValue={d.net} onBlur={(e) => { const v = NUM(e.target.value); if (v !== d.net) onSave({ ...d, net: v }); }} />
        <span>元／月</span>
        <span className="text-tx3 mx-1">｜</span>
        <span>以</span>
        <select className={SELECT_SM} value={baseYm} onChange={(e) => setBaseYm(e.target.value)}>
          <option value="">（現在的草稿）</option>
          {monthKeys.map((k) => <option key={k} value={k}>{k} 實際</option>)}
        </select>
        <span>為基準</span>
        <button className={`${btn} border-brand2 text-brand2`} disabled={!(d.net > 0) || (!base && !S.items.length)} onClick={suggest}>反推每項筆數</button>
        <span className={hint}>等比放大到目標；固定支出一起從基準複製</span>
      </div>

      {S.items.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-tx3"><th className="text-left py-1">項目</th><th className="text-right">基準</th><th className="text-right">目標筆數</th><th className="text-right">營業額</th><th className="text-right">毛利</th></tr></thead>
              <tbody>
                {res.byItem.map((b) => (
                  <tr key={b.it.id} className="border-t border-line">
                    <td className="py-1.5">{b.it.name}</td>
                    <td className="text-right text-tx3">{base ? (base.qty[b.it.id] ?? 0) : "—"}</td>
                    <td className="text-right"><input key={`${b.it.id}-${d.qty[b.it.id] ?? 0}`} className={`${FIELD_SM} w-20 text-right`} inputMode="numeric" defaultValue={d.qty[b.it.id] ?? 0} onBlur={(e) => { const v = NUM(e.target.value); if (v !== (d.qty[b.it.id] ?? 0)) onSave({ ...d, qty: { ...d.qty, [b.it.id]: v } }); }} /></td>
                    <td className="text-right">{F(b.rev)}</td>
                    <td className="text-right text-brand2">{F(b.gp)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td /><td className="text-right">{res.byItem.reduce((a, b) => a + b.q, 0)}</td><td className="text-right">{F(res.rev)}</td><td className="text-right text-brand2">{F(res.gp)}</td></tr>
              </tbody>
            </table>
            <table className="w-full text-sm mt-3">
              <thead><tr className="text-xs text-tx3"><th className="text-left py-1">固定支出</th><th className="text-right">每月金額</th><th /></tr></thead>
              <tbody>
                {d.fixed.map((f, i) => (
                  <tr key={`${i}-${f.name}-${f.amt}`} className="border-t border-line">
                    <td className="py-1.5"><input className={nameIn} defaultValue={f.name} onBlur={(e) => { if (e.target.value !== f.name) onSave({ ...d, fixed: d.fixed.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }); }} /></td>
                    <td className="text-right"><input className={numIn} inputMode="numeric" defaultValue={f.amt} onBlur={(e) => { const v = NUM(e.target.value); if (v !== f.amt) onSave({ ...d, fixed: d.fixed.map((x, j) => j === i ? { ...x, amt: v } : x) }); }} /></td>
                    <td className="text-right"><button className={xbtn} onClick={() => onSave({ ...d, fixed: d.fixed.filter((_, j) => j !== i) })}>✕</button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td className="text-right">{F(res.fixed)}</td><td /></tr>
              </tbody>
            </table>
            <button className={`${btn} mt-2`} onClick={() => onSave({ ...d, fixed: [...d.fixed, { name: "新支出", amt: 0 }] })}>＋ 固定支出</button>
          </div>
          <div>
            <p className="text-base leading-relaxed mb-2">
              照這組設定：營業額 <b className="text-brand2">{F(res.rev)}</b>、毛利率 <b>{P(res.gm * 100)}</b>、扣固定支出 {F(res.fixed)} 與營業稅，淨利 <b className={res.net >= 0 ? "text-ok" : "text-danger"}>{F(res.net)}</b>
              {d.net > 0 && <>，{netOk ? <span className="text-ok">達到目標淨利 {F(d.net)}</span> : <>離目標淨利 {F(d.net)} 還差 <b className="text-danger">{F(d.net - res.net)}</b></>}</>}。
            </p>
            <Waterfall r={res} />
            <p className={`${hint} mt-3 mb-1`}>試試看調整這幾件事（只在這裡試算，不寫進草稿）：</p>
            {([["price", "單價調整", -20, 30, "%"], ["split", "拆分比例調整", -20, 20, " 點"], ["qty", "數量調整", -50, 100, "%"], ["fix", "固定支出調整", -50, 50, "%"]] as [keyof AcctAdj, string, number, number, string][]).map(([k, l, lo, hi, u]) => (
              <div key={k} className="flex items-center gap-3 my-1 text-sm">
                <span className="w-28 shrink-0">{l}</span>
                <input type="range" className="flex-1" min={lo} max={hi} value={adj[k]} onChange={(e) => setAdj({ ...adj, [k]: Number(e.target.value) })} />
                <b className="w-16 text-right">{adj[k]}{u}</b>
              </div>
            ))}
            {(adj.price || adj.split || adj.qty || adj.fix) ? (
              <div className="text-sm mt-1">調整後淨利 <b className={w.net >= 0 ? "text-ok" : "text-danger"}>{F(w.net)}</b>（{D(w.net - res.net)}）・毛利率 {P(w.gm * 100)} <button className={`${xbtn} ml-2`} onClick={() => setAdj({ price: 0, split: 0, qty: 0, fix: 0 })}>歸零</button></div>
            ) : null}
            <div className={`${hint} mt-2`}>可調整的槓桿：拆分比例每降 1 點 ≈ 淨利 +{F(sens.split1)}；固定支出每省 1 萬 ＝ +10,000；單價每 +1% ≈ +{F(sens.price1)}（固定額拆分的項目吃得到）；數量每 +1% ≈ +{F(sens.qty1)}。</div>
          </div>
        </div>
      ) : <p className="text-sm text-tx3">先在下面「1・營業項目與單價拆分」建項目，工作台才有東西可算。</p>}

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-line text-sm">
        <span>滿意了，存入</span>
        <input className={`${FIELD_SM} w-28`} value={storeYm} onChange={(e) => setStoreYm(e.target.value)} placeholder="YYYY-MM" />
        <button className={`${btn} border-brand2 text-brand2`} disabled={pending || !isYm(storeYm) || !S.items.length} onClick={async () => {
          if (!isYm(storeYm)) return;
          if (S.targets[storeYm] && !await confirmDialog(`${storeYm} 已有目標，覆蓋？`)) return;
          onStore(storeYm);
        }}>存成 {isYm(storeYm) ? storeYm : "…"} 的目標</button>
        {isYm(storeYm) && S.targets[storeYm] && <span className={hint}>{storeYm} 目前目標淨利 {F(S.targets[storeYm].net)}</span>}
      </div>
    </div>
  );
}

// ---------- 對照視角 ----------
export function CompareHero({ ym, cmp, r, rt, S }: { ym: string; cmp: Compare; r: MonthResult; rt: MonthResult; S: AcctState }) {
  const d = cmp.net.diff;
  return (
    <div className={card}>
      <p className="text-base leading-relaxed mb-3">
        {ym} 目標淨利 <b>{F(cmp.net.target)}</b>，實際 <b className={r.net >= 0 ? "text-ok" : "text-danger"}>{F(cmp.net.actual)}</b>，
        {d >= 0 ? <><span className="text-ok">超過 {F(d)}</span></> : <><span className="text-danger">差 {F(-d)}</span></>}
        {cmp.drivers.length ? <>——主要是{cmp.drivers.join("、")}</> : <>——筆數與固定支出都跟目標一樣</>}。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        {([["營業額", cmp.rev], ["營業毛利", cmp.gp], ["固定支出", { ...cmp.fixed, diff: -cmp.fixed.diff }], ["淨利", cmp.net]] as [string, { target: number; actual: number; diff: number }][]).map(([l, x]) => (
          <div key={l} className="rounded-lg bg-panel2 p-3">
            <div className="text-xs text-tx3">{l}</div>
            <div className="text-sm text-tx2">{F(x.target)} →</div>
            <div className="text-2xl font-bold">{F(x.actual)}</div>
            <div className={`text-xs ${diffCls(x.diff)}`}>{D(l === "固定支出" ? -x.diff : x.diff)}{l === "固定支出" && x.diff !== 0 ? (x.diff > 0 ? "（省了）" : "（超了）") : ""}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div><div className={`${hint} mb-1`}>目標（淡）vs 實際（實）每一層</div><WaterfallPair rt={rt} r={r} /></div>
        <div><div className={`${hint} mb-1`}>近 12 個月：實際淨利（線）vs 目標淨利（虛線）</div><Trend S={S} ym={ym} /></div>
      </div>
    </div>
  );
}
export function CompareQty({ cmp }: { cmp: Compare }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-tx3"><th className="text-left py-1">項目</th><th className="text-right">目標</th><th className="text-right">實際</th><th className="text-right">差</th><th className="text-right">對淨利</th></tr></thead>
      <tbody>
        {cmp.items.map((x) => (
          <tr key={x.key} className="border-t border-line">
            <td className="py-1.5">{x.name}</td><td className="text-right text-tx2">{x.target}</td><td className="text-right font-bold">{x.actual}</td>
            <td className={`text-right ${diffCls(x.diff)}`}>{x.diff >= 0 ? "+" : "−"}{Math.abs(x.diff)}</td>
            <td className={`text-right ${diffCls(x.netEffect)}`}>{D(x.netEffect)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td className="text-right">{cmp.items.reduce((a, x) => a + x.target, 0)}</td><td className="text-right">{cmp.items.reduce((a, x) => a + x.actual, 0)}</td><td className={`text-right ${diffCls(cmp.items.reduce((a, x) => a + x.diff, 0))}`}>{(() => { const s = cmp.items.reduce((a, x) => a + x.diff, 0); return (s >= 0 ? "+" : "−") + Math.abs(s); })()}</td><td className={`text-right ${diffCls(cmp.items.reduce((a, x) => a + x.netEffect, 0))}`}>{D(cmp.items.reduce((a, x) => a + x.netEffect, 0))}</td></tr>
      </tbody>
    </table>
  );
}
export function CompareFixed({ cmp }: { cmp: Compare }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-tx3"><th className="text-left py-1">項目</th><th className="text-right">目標</th><th className="text-right">實際</th><th className="text-right">差</th></tr></thead>
      <tbody>
        {cmp.fixedRows.map((x) => (
          <tr key={x.key} className="border-t border-line">
            <td className="py-1.5">{x.name}</td><td className="text-right text-tx2">{F(x.target)}</td><td className="text-right font-bold">{F(x.actual)}</td>
            <td className={`text-right ${diffCls(-x.diff)}`}>{D(x.diff)}{x.diff !== 0 && <span className="text-xs text-tx3">{x.diff > 0 ? "超" : "省"}</span>}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td className="text-right">{F(cmp.fixed.target)}</td><td className="text-right">{F(cmp.fixed.actual)}</td><td className={`text-right ${diffCls(-cmp.fixed.diff)}`}>{D(cmp.fixed.diff)}</td></tr>
      </tbody>
    </table>
  );
}
export function PLCompare({ r, rt, vat }: { r: MonthResult; rt: MonthResult; vat: number }) {
  const rows: [string, number, number, boolean, boolean][] = [
    ["營業額", rt.rev, r.rev, true, false], ["減：拆分給別人", -rt.split, -r.split, false, false], ["營業毛利", rt.gp, r.gp, true, false],
    ["減：固定支出", -rt.fixed, -r.fixed, false, false], [`減：營業稅 ${vat}%`, -rt.vat, -r.vat, false, false], ["淨利", rt.net, r.net, true, true],
  ];
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-tx3"><th className="text-left py-1 pl-2">科目</th><th className="text-right">目標</th><th className="text-right">實際</th><th className="text-right">差</th></tr></thead>
      <tbody>
        {rows.map(([l, t, a, hi, last]) => (
          <tr key={l} className={`border-t border-line ${hi ? "font-bold" : ""} ${hi && !last ? "bg-brand/10" : ""}`}>
            <td className="py-1.5 pl-2">{l}</td><td className="text-right text-tx2">{F(t)}</td><td className={`text-right ${last ? (a < 0 ? "text-danger" : "text-ok") : ""}`}>{F(a)}</td>
            <td className={`text-right ${diffCls(a - t)}`}>{D(a - t)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- 營業項目編輯 ----------
export function ItemsEditor({ items, onSave, params = ACCT_DEFAULT_PARAMS }: { items: AcctItem[]; onSave: (items: AcctItem[]) => void; params?: AcctParams }) {
  const set = (i: number, patch: Partial<AcctItem>) => onSave(items.map((x, j) => j === i ? { ...x, ...patch } : x));
  return (
    <div>
      {items.map((it, i) => {
        const price = it.price;
        // 示範數字：分潤池用「2 位分潤人」那一階（最常見），其餘照公式
        const demoSharers = it.splits.some((s) => s.mode === "pool") ? [{ name: "分潤一" }, { name: "分潤二" }].slice(0, Math.min(2, params.poolTiers.length)) : [];
        const u = unitOf(it, {}, undefined, params, demoSharers);
        const rowVal = (s: { to: string; mode: SplitMode; v: number }) => {
          if (s.mode === "pool") return u.rows.filter((r) => demoSharers.some((d) => d.name === r.to)).reduce((a, r) => a + r.v, 0);
          if (s.mode === "keep") return price * s.v / 100;
          return u.rows.find((r) => r.to === s.to)?.v ?? 0;
        };
        const split = u.split, gp = u.gp, gm = u.gm;
        return (
          <div key={it.id} className="mb-3 pb-3 border-b border-line">
            <div className="flex flex-wrap items-center gap-2">
              <input className={nameIn} defaultValue={it.name} onBlur={(e) => { if (e.target.value !== it.name) set(i, { name: e.target.value }); }} />
              <span className="text-sm text-tx2">單價</span>
              <input className={numIn} inputMode="numeric" defaultValue={it.price} onBlur={(e) => { const v = NUM(e.target.value); if (v !== it.price) set(i, { price: v }); }} />
              <span className="text-xs text-tx3">分類</span>
              <input className={`${FIELD_SM} w-24`} defaultValue={it.cat ?? ""} placeholder="（選填）" title="收款明細與匯款對帳用來分組，例如：嵐途學院、活動" onBlur={(e) => { if (e.target.value.trim() !== (it.cat ?? "")) set(i, { cat: e.target.value.trim() }); }} />
              <span className="text-xs text-tx3">自動來源</span>
              <select className={SELECT_SM} value={it.source ?? ""} onChange={(e) => set(i, { source: e.target.value as AcctSource | "" })} title="系統事件發生時自動記一筆到本月帳務；同一種來源只能掛一個項目">
                <option value="">無（只手填）</option>
                <option value="apply" disabled={items.some((x, k) => k !== i && x.source === "apply")}>報聘核准</option>
                <option value="license" disabled={items.some((x, k) => k !== i && x.source === "license")}>培訓帳號開通</option>
              </select>
              <button className={`${xbtn} ml-auto`} onClick={async () => { if (await confirmDialog(`刪除「${it.name}」？各月的數量也不再計入。`, { danger: true })) onSave(items.filter((_, j) => j !== i)); }}>✕</button>
            </div>
            <div className="rounded-lg bg-panel2 p-2 mt-2">
              {it.splits.map((s, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-10 tracking-wider text-tx3 rounded-full border border-line px-2 py-0.5">分給</span>
                  <input className={`${FIELD_SM} w-28`} defaultValue={s.to} placeholder="對象" onBlur={(e) => { if (e.target.value !== s.to) set(i, { splits: it.splits.map((x, k) => k === j ? { ...x, to: e.target.value } : x) }); }} />
                  <select className={SELECT_SM} value={s.mode} onChange={(e) => set(i, { splits: it.splits.map((x, k) => k === j ? { ...x, mode: e.target.value as SplitMode } : x) })}>
                    {(Object.keys(SPLIT_MODE_LABEL) as SplitMode[]).map((m) => <option key={m} value={m}>{SPLIT_MODE_LABEL[m]}</option>)}
                  </select>
                  {s.mode === "pool"
                    ? <span className="text-xs text-tx3">每筆依分潤人數查切法表（{params.poolTiers.map((t, n) => `${n + 1} 人 ${t.join("／")}`).join("；")}）</span>
                    : <input className={`${FIELD_SM} w-20 text-right`} inputMode="decimal" defaultValue={s.v} onBlur={(e) => { const v = NUM(e.target.value); if (v !== s.v) set(i, { splits: it.splits.map((x, k) => k === j ? { ...x, v } : x) }); }} />}
                  <span className="text-xs text-tx3">＝ {F(rowVal(s))}{s.mode === "pool" ? "（2 人時）" : s.mode === "keep" ? "（留在公司）" : ""}</span>
                  <button className={xbtn} onClick={() => set(i, { splits: it.splits.filter((_, k) => k !== j) })}>✕</button>
                </div>
              ))}
              <button className="text-xs text-tx2 hover:text-tx" onClick={() => set(i, { splits: [...it.splits, { to: "", mode: "pct", v: 0 }] })}>＋ 拆分</button>
            </div>
            <div className="flex justify-between items-center mt-2 text-sm">
              <span className="text-xs text-tx3">匯出去 {F(split)}</span>
              <span>公司實收 <b className="text-brand2">{F(gp)}</b> ・ 毛利率 <b>{P(gm * 100)}</b></span>
            </div>
            <div className="h-1.5 rounded bg-line overflow-hidden mt-1"><i className="block h-full bg-brand2" style={{ width: `${Math.max(0, Math.min(100, gm * 100))}%` }} /></div>
          </div>
        );
      })}
      <button className={btn} onClick={() => onSave([...items, { id: uid(), name: "新項目", price: 0, splits: [] }])}>＋ 新增營業項目</button>
    </div>
  );
}

// ---------- 損益表 ----------
export function PLRow({ r, l, v, lv, ind, cls }: { r: MonthResult; l: string; v: number; lv?: boolean; ind?: boolean; cls?: string }) {
  return (
    <tr className={`border-t border-line ${lv ? "font-bold" : ""} ${lv && cls === "hi" ? "bg-brand/10" : ""}`}>
      <td className={`py-1.5 ${ind ? "pl-6 text-tx2" : "pl-2"}`}>{l}</td>
      <td className={`text-right ${cls === "ok" ? "text-ok" : cls === "bad" ? "text-danger" : ""}`}>{F(v)}</td>
      <td className="text-right text-tx3 text-xs">{r.rev ? P(v / r.rev * 100) : ""}</td>
    </tr>
  );
}
export function PLTable({ r, month, vat }: { r: MonthResult; month: AcctMonth; vat: number }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-tx3"><th className="text-left py-1 pl-2">科目</th><th className="text-right">金額</th><th className="text-right">佔營業額</th></tr></thead>
      <tbody>
        <PLRow r={r} l="營業額" v={r.rev} lv cls="hi" />
        {r.byItem.map((b) => <PLRow key={b.it.id} r={r} l={`${b.it.name} × ${b.q}`} v={b.rev} ind />)}
        <PLRow r={r} l="減：拆分給別人" v={-r.split} lv />
        {Object.entries(r.byTo).map(([t, v]) => <PLRow key={t} r={r} l={t || "（未填對象）"} v={-v} ind />)}
        <PLRow r={r} l="營業毛利" v={r.gp} lv cls="hi" />
        <PLRow r={r} l="減：固定支出" v={-r.fixed} lv />
        {month.fixed.map((f, i) => <PLRow key={i} r={r} l={f.name} v={-f.amt} ind />)}
        <PLRow r={r} l={`減：營業稅 ${vat}%`} v={-r.vat} lv />
        <PLRow r={r} l="淨利" v={r.net} lv cls={r.net < 0 ? "bad" : "ok"} />
      </tbody>
    </table>
  );
}

// ---------- 圖 ----------
export const STEPS = (r: MonthResult): [string, number, string, boolean][] => [
  ["營業額", r.rev, "var(--brand2)", true], ["拆分給別人", -r.split, "var(--danger)", false], ["營業毛利", r.gp, "var(--brand2)", true],
  ["固定支出", -r.fixed, "var(--danger)", false], ["營業稅", -r.vat, "var(--danger)", false], ["淨利", r.net, r.net >= 0 ? "var(--ok)" : "var(--danger)", true],
];
export function wfBars(steps: [string, number, string, boolean][], sc: number, H: number) {
  let y = 0;
  return steps.map(([, v, , sub]) => {
    let top: number, h: number;
    if (sub) { top = H - 20 - Math.max(0, v) * sc; h = Math.abs(v) * sc; y = v; }
    else { const y0 = y, y1 = y + v; top = H - 20 - Math.max(y0, y1) * sc; h = Math.abs(v) * sc; y = y1; }
    return { top, h };
  });
}
export function Waterfall({ r }: { r: MonthResult }) {
  const steps = STEPS(r);
  const W = 520, H = 220, pad = 30, max = Math.max(1, r.rev) * 1.05, sc = (H - pad - 20) / max, bw = 60, gap = (W - pad) / steps.length;
  const bars = wfBars(steps, sc, H);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="本月損益瀑布圖">
      {steps.map(([l, v, c, sub], i) => {
        const x = pad + i * gap + 10, { top, h } = bars[i];
        return (
          <g key={l}>
            <rect x={x} y={top} width={bw} height={Math.max(1, h)} rx={3} fill={c} opacity={sub ? 1 : 0.75} />
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--tx3)">{l}</text>
            <text x={x + bw / 2} y={top - 4} textAnchor="middle" fontSize={11} fill="var(--tx)">{F(Math.abs(v))}</text>
          </g>
        );
      })}
    </svg>
  );
}
/** 對照：每一層兩根柱，左淡＝目標、右實＝實際。 */
export function WaterfallPair({ rt, r }: { rt: MonthResult; r: MonthResult }) {
  const st = STEPS(rt), sa = STEPS(r);
  const W = 520, H = 220, pad = 30, max = Math.max(1, rt.rev, r.rev) * 1.05, sc = (H - pad - 20) / max, bw = 30, gap = (W - pad) / st.length;
  const bt = wfBars(st, sc, H), ba = wfBars(sa, sc, H);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="目標與實際損益瀑布圖">
      {st.map(([l, , c, sub], i) => {
        const x = pad + i * gap + 8;
        return (
          <g key={l}>
            <rect x={x} y={bt[i].top} width={bw} height={Math.max(1, bt[i].h)} rx={3} fill={c} opacity={0.3} />
            <rect x={x + bw + 2} y={ba[i].top} width={bw} height={Math.max(1, ba[i].h)} rx={3} fill={sa[i][2]} opacity={sub ? 1 : 0.75} />
            <text x={x + bw + 1} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--tx3)">{l}</text>
            <text x={x + bw + 1} y={Math.min(bt[i].top, ba[i].top) - 4} textAnchor="middle" fontSize={11} fill="var(--tx)">{F(Math.abs(sa[i][1]))}</text>
          </g>
        );
      })}
    </svg>
  );
}
export function Trend({ S, ym }: { S: AcctState; ym: string }) {
  const keys = Array.from(new Set([...Object.keys(S.months), ...Object.keys(S.targets)])).sort().filter((k) => k <= ym).slice(-12);
  const rows = keys.map((k) => ({ k, a: S.months[k] ? calcData(S.items, S.months[k], S.params) : null, t: S.targets[k]?.net ?? null }));
  if (!rows.length) return null;
  const W = 520, H = 220, pad = 34;
  const max = Math.max(1, ...rows.map((x) => x.a?.rev ?? 0), ...rows.map((x) => x.t ?? 0)) * 1.1;
  const min = Math.min(0, ...rows.map((x) => x.a?.net ?? 0));
  const sc = (H - 40) / (max - min), y0 = H - 20 + min * sc, bw = (W - pad) / rows.length;
  const cxOf = (i: number) => pad + i * bw + 4 + (bw - 8) / 2;
  const path = rows.map((x, i) => x.a ? { cx: cxOf(i), cy: y0 - x.a.net * sc } : null).filter((q): q is { cx: number; cy: number } => !!q).map((q, i) => (i ? "L" : "M") + q.cx + " " + q.cy).join(" ");
  const tpath = rows.map((x, i) => x.t != null ? { cx: cxOf(i), cy: y0 - x.t * sc } : null).filter((q): q is { cx: number; cy: number } => !!q).map((q, i) => (i ? "L" : "M") + q.cx + " " + q.cy).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="近 12 個月趨勢">
      <line x1={pad} x2={W} y1={y0} y2={y0} stroke="var(--line)" />
      {rows.map((x, i) => {
        const bx = pad + i * bw + 4, cx = cxOf(i);
        return (
          <g key={x.k}>
            {x.a && <rect x={bx} y={y0 - x.a.rev * sc} width={Math.max(1, bw - 8)} height={x.a.rev * sc} fill="var(--brand2)" opacity={0.18} />}
            {x.a && <rect x={bx} y={y0 - x.a.gp * sc} width={Math.max(1, bw - 8)} height={x.a.gp * sc} fill="var(--brand2)" opacity={x.k === ym ? 1 : 0.6} />}
            {x.a && <circle cx={cx} cy={y0 - x.a.net * sc} r={3} fill="var(--ok)" />}
            {x.t != null && <circle cx={cx} cy={y0 - x.t * sc} r={2.5} fill="none" stroke="var(--tx2)" strokeWidth={1.5} />}
            {(rows.length <= 6 || i % 2 === 1) && <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--tx3)">{x.k.slice(2)}</text>}
          </g>
        );
      })}
      {tpath && <path d={tpath} fill="none" stroke="var(--tx2)" strokeWidth={1.5} strokeDasharray="5 4" />}
      {path && <path d={path} fill="none" stroke="var(--ok)" strokeWidth={2} />}
    </svg>
  );
}
