"use client";

import { useMemo, useState, useTransition } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { fmtMoney0 } from "@/lib/money";
import {
  calcMonth, calcTarget, calcData, compareMonth, breakeven, goalSolve, leverSensitivity, prevYm, nextYm, isYm,
  type AcctState, type AcctItem, type AcctMonth, type AcctTarget, type AcctAdj, type MonthResult, type Compare,
} from "@/lib/acctEngine";
import {
  saveAcctItemsAction, saveAcctParamsAction, saveAcctGoalAction, saveAcctMonthAction, ensureAcctMonthAction, deleteAcctMonthAction,
  saveAcctTargetAction, deleteAcctTargetAction, type ActionResult,
} from "./actions";

// 帳務後台面板（2026/09/29）。版面照原型 docs/帳務後台_原型.html：
//   ① 一句話結論＋三 KPI＋瀑布圖＋近 12 月趨勢
//   ② 營業項目與單價拆分 ｜ ③ 本月數量
//   ④ 固定支出           ｜ ⑤ 本月損益結構
//   ⑥ 目標設定 ＋ what-if 四根拉桿（只試算不動資料）
// 三種視角（Ray：目標要獨立出來、不跟真實帳務混）：
//   實際＝acct_months；目標＝acct_targets（同形狀＋目標淨利），②③④⑤ 換成編輯目標；
//   對照＝每一格「目標 → 實際（差）」，結論改成「差在哪」，趨勢圖多一條虛線＝目標淨利。
// 狀態在前端一份（S），每一格 onBlur／onChange 存回 server action；引擎 acctEngine 純算。

type View = "actual" | "target" | "compare";
const F = fmtMoney0;
const P = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : "—") + "%";
const D = (n: number) => (n >= 0 ? "+" : "−") + F(Math.abs(n));
const uid = () => Math.random().toString(36).slice(2, 8);
const btn = "rounded-lg border border-line2 px-3 py-1.5 text-sm text-tx2 hover:bg-panel3 disabled:opacity-40";
const xbtn = "text-xs text-tx3 hover:text-danger px-1";
const card = "rounded-xl border border-line bg-panel p-5 shadow-e1";
const h2 = "text-sm font-bold border-l-[3px] border-brand2 pl-2 mb-1";
const hint = "text-xs text-tx3 leading-relaxed";
const numIn = `${FIELD_SM} w-24 text-right`;
const nameIn = `${FIELD_SM} w-40`;
const NUM = (v: string) => { const x = Number(String(v).replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
const diffCls = (n: number) => (n > 0 ? "text-ok" : n < 0 ? "text-danger" : "text-tx3");
const EMPTY: AcctMonth = { qty: {}, fixed: [] };

export default function AcctBoard({ initial, today }: { initial: AcctState; today: string }) {
  const [S, setS] = useState<AcctState>({ ...initial, targets: initial.targets ?? {} });
  const keys = useMemo(() => Object.keys(S.months).sort(), [S.months]);
  const [ym, setYm] = useState<string>(keys.includes(today) ? today : keys[keys.length - 1] ?? today);
  const [view, setView] = useState<View>("actual");
  const [adj, setAdj] = useState<Required<AcctAdj>>({ price: 0, split: 0, qty: 0, fix: 0 });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, okMsg: string) =>
    start(async () => { const r = await fn(); if (r.ok) { setMsg(okMsg); setErr(null); } else { setErr(r.error); setMsg(null); } });

  const month: AcctMonth = S.months[ym] ?? EMPTY;
  const hasMonth = !!S.months[ym];
  const target: AcctTarget | null = S.targets[ym] ?? null;
  const r = useMemo(() => calcMonth(S, ym), [S, ym]);
  const p = useMemo(() => calcMonth(S, prevYm(ym)), [S, ym]);
  const rt = useMemo(() => calcTarget(S, ym), [S, ym]);
  const cmp = useMemo(() => compareMonth(S, ym), [S, ym]);

  // ---- 存檔（先改本地、再打 action）----
  const saveItems = (items: AcctItem[]) => { setS((s) => ({ ...s, items })); run(() => saveAcctItemsAction(items), "已存營業項目"); };
  const saveMonth = (m: AcctMonth) => { setS((s) => ({ ...s, months: { ...s.months, [ym]: m } })); run(() => saveAcctMonthAction(ym, m), `已存 ${ym} 實際`); };
  const saveTarget = (t: AcctTarget, k = ym) => { setS((s) => ({ ...s, targets: { ...s.targets, [k]: t } })); run(() => saveAcctTargetAction(k, t), `已存 ${k} 目標`); };
  const saveGoal = (netTarget: number) => { setS((s) => ({ ...s, goal: { netTarget } })); run(() => saveAcctGoalAction({ netTarget }), "已存目標淨利"); };
  const saveVat = (vatRate: number) => { setS((s) => ({ ...s, params: { vatRate } })); run(() => saveAcctParamsAction({ vatRate }), "已存營業稅率"); };
  const openMonth = (k: string) => {
    if (!isYm(k)) return;
    if (S.months[k]) { setYm(k); return; }
    // 本地先複製最近一個月的固定支出，畫面不用等 round-trip；server 端 ensureAcctMonth 做同一件事
    const src = [...keys].reverse().find((x) => x <= k) ?? keys[keys.length - 1];
    setS((s) => ({ ...s, months: { ...s.months, [k]: { qty: {}, fixed: src ? s.months[src].fixed.map((f) => ({ ...f })) : [] } } }));
    setYm(k);
    run(() => ensureAcctMonthAction(k), `已開 ${k}`);
  };
  const removeMonth = async () => {
    if (!hasMonth || !await confirmDialog(`刪除 ${ym} 的實際數量與固定支出？`, { danger: true })) return;
    const rest = { ...S.months }; delete rest[ym];
    setS((s) => ({ ...s, months: rest }));
    const ks = Object.keys(rest).sort();
    setYm(ks[ks.length - 1] ?? today);
    run(() => deleteAcctMonthAction(ym), `已刪 ${ym} 實際`);
  };
  const removeTarget = async () => {
    if (!target || !await confirmDialog(`刪除 ${ym} 的目標？`, { danger: true })) return;
    const rest = { ...S.targets }; delete rest[ym];
    setS((s) => ({ ...s, targets: rest }));
    run(() => deleteAcctTargetAction(ym), `已刪 ${ym} 目標`);
  };
  /** 目標從哪來：① 用試算反推的筆數＋這個月的固定支出 ② 複製上月目標 ③ 從實際複製 */
  const targetFromSolve = () => {
    if (!r) return;
    const g = goalSolve(S, r);
    const qty: Record<string, number> = {};
    for (const x of g.perItem) qty[x.id] = x.needQ;
    saveTarget({ qty, fixed: month.fixed.map((f) => ({ ...f })), net: S.goal.netTarget });
  };
  const targetFromPrev = () => { const t = S.targets[prevYm(ym)]; if (t) saveTarget({ qty: { ...t.qty }, fixed: t.fixed.map((f) => ({ ...f })), net: t.net }); };
  const targetFromActual = () => saveTarget({ qty: { ...month.qty }, fixed: month.fixed.map((f) => ({ ...f })), net: r?.net ?? 0 });

  const be = r ? breakeven(r, S.params.vatRate) : Infinity;
  const dn = r && p ? r.net - p.net : null;
  const g = r ? goalSolve(S, r) : null;
  const w = useMemo(() => calcMonth(S, ym, adj), [S, ym, adj]);
  const sens = useMemo(() => leverSensitivity(S, ym), [S, ym]);

  // 目標視角下 ②③④⑤ 編輯的是目標；MonthEditor 共用同一套畫面
  const editing: { data: AcctMonth; res: MonthResult | null; save: (m: AcctMonth) => void; label: string } = view === "target"
    ? { data: target ?? EMPTY, res: rt, save: (m) => saveTarget({ ...m, net: target?.net ?? S.goal.netTarget }), label: "目標" }
    : { data: month, res: r, save: saveMonth, label: "實際" };
  const editable = view === "target" ? !!target : hasMonth;

  return (
    <div className="space-y-4">
      {/* 月份與視角 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tx2">看哪一個月</span>
        <button className={btn} onClick={() => openMonth(prevYm(ym))}>‹</button>
        <select className={SELECT_SM} value={hasMonth ? ym : ""} onChange={(e) => setYm(e.target.value)}>
          {!hasMonth && <option value="">（{ym} 還沒開）</option>}
          {keys.map((k) => <option key={k} value={k}>{k}{S.targets[k] ? "・有目標" : ""}</option>)}
        </select>
        <button className={btn} onClick={() => openMonth(nextYm(ym))}>›</button>
        {!hasMonth && <button className={`${btn} border-brand2 text-brand2`} onClick={() => openMonth(ym)}>開 {ym} 這一個月</button>}
        <span className="inline-flex rounded-lg border border-line overflow-hidden ml-2">
          {([["actual", "實際"], ["target", "目標"], ["compare", "對照"]] as [View, string][]).map(([v, l]) => (
            <button key={v} className={`px-3 py-1.5 text-sm ${view === v ? "bg-brand text-onbrand font-bold" : "text-tx2 hover:bg-panel3"}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </span>
        {view === "actual" && hasMonth && <button className={xbtn} onClick={removeMonth}>刪這個月的實際</button>}
        {view === "target" && target && <button className={xbtn} onClick={removeTarget}>刪這個月的目標</button>}
        <span className="text-xs text-tx3 ml-auto">{pending ? "存檔中…" : err ? <span className="text-danger">{err}</span> : msg ?? ""}</span>
      </div>

      {/* ① 結論與圖 */}
      {view === "compare" ? (
        cmp && r && rt ? <CompareHero ym={ym} cmp={cmp} r={r} rt={rt} S={S} /> : (
          <div className={card}><p className="text-sm text-tx2">{ym} 要同時有實際與目標才能對照。{!target && <>切到「目標」把目標建起來。</>}{!hasMonth && <>先按「開 {ym} 這一個月」。</>}</p></div>
        )
      ) : view === "target" ? (
        rt && target ? (
          <div className={card}>
            <p className="text-base leading-relaxed mb-3">
              {ym} 目標：營業額 <b className="text-brand2">{F(rt.rev)}</b>、毛利率 <b>{P(rt.gm * 100)}</b>、固定支出 {F(rt.fixed)}，照這樣算下來淨利 <b className={rt.net >= 0 ? "text-ok" : "text-danger"}>{F(rt.net)}</b>；
              設定的目標淨利 <b>{F(target.net)}</b>{Math.round(rt.net) !== Math.round(target.net) && <>（{rt.net >= target.net ? "筆數算出來超過目標" : `筆數算出來還差 ${F(target.net - rt.net)}`}）</>}。
            </p>
            <div className="flex items-center gap-2 text-sm mb-3">目標淨利 <input className={numIn} inputMode="numeric" defaultValue={target.net} onBlur={(e) => { const v = NUM(e.target.value); if (v !== target.net) saveTarget({ ...target, net: v }); }} /> 元／月</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div><div className={`${hint} mb-1`}>目標的錢怎麼一層一層變成淨利</div><Waterfall r={rt} /></div>
              <div><div className={`${hint} mb-1`}>近 12 個月：實際淨利（線）vs 目標淨利（虛線）</div><Trend S={S} ym={ym} /></div>
            </div>
          </div>
        ) : (
          <div className={card}>
            <p className="text-sm text-tx2 mb-3">{ym} 還沒有目標。目標可以從三個地方來：</p>
            <div className="flex flex-wrap gap-2">
              <button className={`${btn} border-brand2 text-brand2`} disabled={!r || !(S.goal.netTarget > 0)} onClick={targetFromSolve}>用試算反推（目標淨利 {F(S.goal.netTarget)} → 每項筆數）</button>
              <button className={btn} disabled={!S.targets[prevYm(ym)]} onClick={targetFromPrev}>複製上月目標</button>
              <button className={btn} disabled={!hasMonth} onClick={targetFromActual}>從這個月的實際複製</button>
            </div>
            {!(S.goal.netTarget > 0) && <p className={`${hint} mt-2`}>試算反推要先在最下面「5・目標設定」填目標淨利。</p>}
          </div>
        )
      ) : r ? (
        <div className={card}>
          <p className="text-base leading-relaxed mb-3">
            {ym} 營業額 <b className="text-brand2">{F(r.rev)}</b>，毛利率 <b>{P(r.gm * 100)}</b>，扣掉固定支出 {F(r.fixed)} 與營業稅後淨利{" "}
            <b className={r.net >= 0 ? "text-ok" : "text-danger"}>{F(r.net)}</b>（淨利率 {P(r.nm * 100)}）
            {dn != null && <>，比上月{dn >= 0 ? "多" : "少"} {F(Math.abs(dn))}</>}。
            {Number.isFinite(be) ? <>損益兩平營業額約 <b>{F(be)}</b>，目前{r.rev >= be ? `已過線 ${P((r.rev / be - 1) * 100)}` : `還差 ${F(be - r.rev)}`}。</> : <>目前的毛利率蓋不過營業稅，沒有損益兩平點。</>}
            {target && <> 目標淨利 {F(target.net)}，{r.net >= target.net ? <span className="text-ok">已達標</span> : <>還差 {F(target.net - r.net)}</>}。</>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {([["營業額", r.rev, p ? `上月 ${F(p.rev)}` : ""], ["營業毛利", r.gp, `毛利率 ${P(r.gm * 100)}`], ["淨利", r.net, `淨利率 ${P(r.nm * 100)}`]] as [string, number, string][]).map(([l, v, s]) => (
              <div key={l} className="rounded-lg bg-panel2 p-3">
                <div className="text-xs text-tx3">{l}</div>
                <div className={`text-2xl font-bold ${v < 0 ? "text-danger" : ""}`}>{F(v)}</div>
                <div className="text-xs text-tx3">{s}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div><div className={`${hint} mb-1`}>這個月的錢是怎麼一層一層變成淨利的</div><Waterfall r={r} /></div>
            <div><div className={`${hint} mb-1`}>近 12 個月：營業額（淡）、毛利（金）、淨利（線）{Object.keys(S.targets).length ? "、目標淨利（虛線）" : ""}</div><Trend S={S} ym={ym} /></div>
          </div>
        </div>
      ) : (
        <div className={card}><p className="text-sm text-tx2">{ym} 還沒有資料。先在下面把營業項目建起來，再按「開 {ym} 這一個月」填數量。</p></div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ② 營業項目與單價拆分 */}
        <div className={card}>
          <h2 className={h2}>1・營業項目與單價拆分</h2>
          <p className={`${hint} mb-3`}>每個項目的單價要分給誰：比例（%）或固定金額都可以。扣完就是這一筆的毛利。實際與目標共用同一套單價與拆分。</p>
          <ItemsEditor items={S.items} onSave={saveItems} />
        </div>
        {/* ③ 本月數量 */}
        <div className={card}>
          <h2 className={h2}>2・本月數量與營業狀況{view !== "actual" && <span className="text-tx3 font-normal">（{view === "target" ? "目標" : "目標 → 實際"}）</span>}</h2>
          <p className={`${hint} mb-3`}>{view === "target" ? "這個月每個項目想賣幾筆。" : view === "compare" ? "每一項目標賣幾筆、實際賣幾筆、差幾筆對淨利影響多少。" : "這個月每個項目賣出幾筆。之後接上實際訂單就自動帶入。"}</p>
          {view === "compare" ? (
            cmp ? <CompareQty cmp={cmp} /> : <p className="text-sm text-tx3">要同時有實際與目標。</p>
          ) : editing.res && editable ? (
            <table key={`${view}-${ym}`} className="w-full text-sm">
              <thead><tr className="text-xs text-tx3"><th className="text-left py-1">項目</th><th className="text-right">{view === "target" ? "實際" : "上月"}</th><th className="text-right">{editing.label}筆數</th><th className="text-right">營業額</th><th className="text-right">毛利</th><th className="text-right">佔毛利</th></tr></thead>
              <tbody>
                {editing.res.byItem.map((b) => (
                  <tr key={b.it.id} className="border-t border-line">
                    <td className="py-1.5">{b.it.name}</td>
                    <td className="text-right text-tx3">{view === "target" ? (month.qty[b.it.id] ?? 0) : p ? (p.byItem.find((x) => x.it.id === b.it.id)?.q ?? 0) : "—"}</td>
                    <td className="text-right"><input className={`${FIELD_SM} w-20 text-right`} inputMode="numeric" defaultValue={editing.data.qty[b.it.id] ?? 0} onBlur={(e) => { const v = NUM(e.target.value); if (v !== (editing.data.qty[b.it.id] ?? 0)) editing.save({ ...editing.data, qty: { ...editing.data.qty, [b.it.id]: v } }); }} /></td>
                    <td className="text-right">{F(b.rev)}</td>
                    <td className="text-right text-brand2">{F(b.gp)}</td>
                    <td className="text-right text-tx2">{editing.res!.gp ? P(b.gp / editing.res!.gp * 100) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td /><td className="text-right">{editing.res.byItem.reduce((a, b) => a + b.q, 0)}</td><td className="text-right">{F(editing.res.rev)}</td><td className="text-right text-brand2">{F(editing.res.gp)}</td><td className="text-right">{P(editing.res.gm * 100)}</td></tr>
              </tbody>
            </table>
          ) : <p className="text-sm text-tx3">{view === "target" ? "這個月還沒有目標。" : "這個月還沒開。"}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ④ 固定支出 */}
        <div className={card}>
          <h2 className={h2}>3・固定支出（每月）{view !== "actual" && <span className="text-tx3 font-normal">（{view === "target" ? "目標" : "目標 → 實際"}）</span>}</h2>
          <p className={`${hint} mb-3`}>{view === "target" ? "這個月固定支出打算控制在多少。" : view === "compare" ? "同名的列合併比較。" : "不隨銷量變動的費用，一列一項；按月存，開新月份會把上一個月的複製過來。"}</p>
          {view === "compare" ? (
            cmp ? <CompareFixed cmp={cmp} /> : <p className="text-sm text-tx3">要同時有實際與目標。</p>
          ) : editable ? (
            <>
              <table key={`${view}-${ym}`} className="w-full text-sm">
                <thead><tr className="text-xs text-tx3"><th className="text-left py-1">項目</th><th className="text-right">每月金額</th><th /></tr></thead>
                <tbody>
                  {editing.data.fixed.map((f, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5"><input className={nameIn} defaultValue={f.name} onBlur={(e) => { if (e.target.value !== f.name) editing.save({ ...editing.data, fixed: editing.data.fixed.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }); }} /></td>
                      <td className="text-right"><input className={numIn} inputMode="numeric" defaultValue={f.amt} onBlur={(e) => { const v = NUM(e.target.value); if (v !== f.amt) editing.save({ ...editing.data, fixed: editing.data.fixed.map((x, j) => j === i ? { ...x, amt: v } : x) }); }} /></td>
                      <td className="text-right"><button className={xbtn} onClick={() => editing.save({ ...editing.data, fixed: editing.data.fixed.filter((_, j) => j !== i) })}>✕</button></td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line font-bold"><td className="py-1.5">合計</td><td className="text-right">{F(editing.data.fixed.reduce((a, f) => a + f.amt, 0))}</td><td /></tr>
                </tbody>
              </table>
              <button className={`${btn} mt-2`} onClick={() => editing.save({ ...editing.data, fixed: [...editing.data.fixed, { name: "新支出", amt: 0 }] })}>＋ 新增固定支出</button>
            </>
          ) : <p className="text-sm text-tx3">{view === "target" ? "這個月還沒有目標。" : "這個月還沒開。"}</p>}
        </div>
        {/* ⑤ 損益表 */}
        <div className={card}>
          <h2 className={h2}>4・本月損益結構{view !== "actual" && <span className="text-tx3 font-normal">（{view === "target" ? "目標" : "目標 → 實際"}）</span>}</h2>
          <p className={`${hint} mb-3`}>營業稅率 <input className={`${FIELD_SM} w-14 text-right`} inputMode="decimal" defaultValue={S.params.vatRate} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.vatRate) saveVat(v); }} /> %（營所稅先不算）</p>
          {view === "compare" ? (
            r && rt ? <PLCompare r={r} rt={rt} vat={S.params.vatRate} /> : <p className="text-sm text-tx3">要同時有實際與目標。</p>
          ) : editing.res && editable ? <PLTable r={editing.res} month={editing.data} vat={S.params.vatRate} /> : <p className="text-sm text-tx3">{view === "target" ? "這個月還沒有目標。" : "這個月還沒開。"}</p>}
        </div>
      </div>

      {/* ⑥ 目標與 what-if */}
      <div className={card}>
        <h2 className={h2}>5・目標設定與可調整的地方</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
          <div>
            <p className={`${hint} mb-2`}>設一個目標淨利，看以現在的毛利結構要賣幾筆才到；滿意就存成這個月的目標（存進目標表，不動實際帳）。</p>
            <div className="flex items-center gap-2 mb-2 text-sm">目標淨利 <input className={numIn} inputMode="numeric" defaultValue={S.goal.netTarget} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.goal.netTarget) saveGoal(v); }} /> 元／月</div>
            {r && g && S.goal.netTarget > 0 ? (
              <>
                <p className="text-sm mb-2">需要「毛利 − 營業稅」達 <b>{F(g.need)}</b>，目前 {F(g.have)}，{g.gap <= 0 ? <b className="text-ok">已達標</b> : <>還差 <b className="text-danger">{F(g.gap)}</b></>}。</p>
                {g.gap > 0 && Number.isFinite(g.k) && (
                  <>
                    <p className={`${hint} mb-1`}>照現在的組合等比放大，每項要賣到：</p>
                    <table className="w-full text-sm">
                      <tbody>{g.perItem.map((x) => <tr key={x.id} className="border-t border-line"><td className="py-1">{x.name}</td><td className="text-right">{x.q} → <b>{x.needQ}</b> 筆</td><td className="text-right text-tx3">或單靠它補：{x.aloneQ == null ? "補不到" : `+${x.aloneQ} 筆`}</td></tr>)}</tbody>
                    </table>
                  </>
                )}
                {g.gap > 0 && !Number.isFinite(g.k) && <p className="text-sm text-tx3">現在的毛利扣稅後 ≤ 0，等比放大也到不了——先看拆分與單價。</p>}
                <button className={`${btn} mt-3 border-brand2 text-brand2`} onClick={async () => { if (target && !await confirmDialog(`${ym} 已有目標，覆蓋成這組筆數與目標淨利 ${F(S.goal.netTarget)}？`)) return; targetFromSolve(); setView("target"); }}>存成 {ym} 的目標</button>
              </>
            ) : <p className="text-sm text-tx3">填一個目標淨利就會算。</p>}
          </div>
          <div>
            <p className={`${hint} mb-2`}>試試看「如果調整這幾件事」淨利會變多少（只是試算，不動任何資料）。</p>
            {([["price", "單價調整", -20, 30, "%"], ["split", "拆分比例調整", -20, 20, " 點"], ["qty", "數量調整", -50, 100, "%"], ["fix", "固定支出調整", -50, 50, "%"]] as [keyof AcctAdj, string, number, number, string][]).map(([k, l, lo, hi, u]) => (
              <div key={k} className="flex items-center gap-3 my-1.5 text-sm">
                <span className="w-28 shrink-0">{l}</span>
                <input type="range" className="flex-1" min={lo} max={hi} value={adj[k]} onChange={(e) => setAdj({ ...adj, [k]: Number(e.target.value) })} />
                <b className="w-16 text-right">{adj[k]}{u}</b>
              </div>
            ))}
            {r && w && (
              <div className="mt-3 text-sm">
                調整後淨利 <b className={w.net >= 0 ? "text-ok" : "text-danger"}>{F(w.net)}</b>（{D(w.net - r.net)}）・毛利率 {P(w.gm * 100)}
                {S.goal.netTarget > 0 && <> ・ {w.net >= S.goal.netTarget ? <span className="text-ok">達到目標</span> : <>離目標還差 {F(S.goal.netTarget - w.net)}</>}</>}
                <div className={`${hint} mt-2`}>
                  可調整的槓桿：拆分比例每降 1 點 ≈ 淨利 +{F(sens.split1)}；固定支出每省 1 萬 ＝ 淨利 +10,000；單價每 +1% ≈ 淨利 +{F(sens.price1)}（固定額拆分的項目吃得到，比例制的拆分會跟著漲）；數量每 +1% ≈ 淨利 +{F(sens.qty1)}。
                </div>
                {(adj.price || adj.split || adj.qty || adj.fix) ? <button className={`${btn} mt-2`} onClick={() => setAdj({ price: 0, split: 0, qty: 0, fix: 0 })}>拉桿歸零</button> : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 對照視角 ----------
function CompareHero({ ym, cmp, r, rt, S }: { ym: string; cmp: Compare; r: MonthResult; rt: MonthResult; S: AcctState }) {
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
function CompareQty({ cmp }: { cmp: Compare }) {
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
function CompareFixed({ cmp }: { cmp: Compare }) {
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
function PLCompare({ r, rt, vat }: { r: MonthResult; rt: MonthResult; vat: number }) {
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
function ItemsEditor({ items, onSave }: { items: AcctItem[]; onSave: (items: AcctItem[]) => void }) {
  const set = (i: number, patch: Partial<AcctItem>) => onSave(items.map((x, j) => j === i ? { ...x, ...patch } : x));
  return (
    <div>
      {items.map((it, i) => {
        const price = it.price;
        let split = 0;
        const rows = it.splits.map((s) => { const v = s.mode === "pct" ? price * s.v / 100 : s.v; split += v; return v; });
        const gp = price - split, gm = price ? gp / price : 0;
        return (
          <div key={it.id} className="mb-3 pb-3 border-b border-line">
            <div className="flex flex-wrap items-center gap-2">
              <input className={nameIn} defaultValue={it.name} onBlur={(e) => { if (e.target.value !== it.name) set(i, { name: e.target.value }); }} />
              <span className="text-sm text-tx2">單價</span>
              <input className={numIn} inputMode="numeric" defaultValue={it.price} onBlur={(e) => { const v = NUM(e.target.value); if (v !== it.price) set(i, { price: v }); }} />
              <button className={`${xbtn} ml-auto`} onClick={async () => { if (await confirmDialog(`刪除「${it.name}」？各月的數量也不再計入。`, { danger: true })) onSave(items.filter((_, j) => j !== i)); }}>✕</button>
            </div>
            <div className="rounded-lg bg-panel2 p-2 mt-2">
              {it.splits.map((s, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-10 tracking-wider text-tx3 rounded-full border border-line px-2 py-0.5">分給</span>
                  <input className={`${FIELD_SM} w-28`} defaultValue={s.to} placeholder="對象" onBlur={(e) => { if (e.target.value !== s.to) set(i, { splits: it.splits.map((x, k) => k === j ? { ...x, to: e.target.value } : x) }); }} />
                  <select className={SELECT_SM} value={s.mode} onChange={(e) => set(i, { splits: it.splits.map((x, k) => k === j ? { ...x, mode: e.target.value as "pct" | "amt" } : x) })}>
                    <option value="pct">比例 %</option><option value="amt">固定金額</option>
                  </select>
                  <input className={`${FIELD_SM} w-20 text-right`} inputMode="decimal" defaultValue={s.v} onBlur={(e) => { const v = NUM(e.target.value); if (v !== s.v) set(i, { splits: it.splits.map((x, k) => k === j ? { ...x, v } : x) }); }} />
                  <span className="text-xs text-tx3">＝ {F(rows[j])}</span>
                  <button className={xbtn} onClick={() => set(i, { splits: it.splits.filter((_, k) => k !== j) })}>✕</button>
                </div>
              ))}
              <button className="text-xs text-tx2 hover:text-tx" onClick={() => set(i, { splits: [...it.splits, { to: "", mode: "pct", v: 0 }] })}>＋ 拆分</button>
            </div>
            <div className="flex justify-between items-center mt-2 text-sm">
              <span className="text-xs text-tx3">拆出 {F(split)}</span>
              <span>單筆毛利 <b className="text-brand2">{F(gp)}</b> ・ 毛利率 <b>{P(gm * 100)}</b></span>
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
function PLRow({ r, l, v, lv, ind, cls }: { r: MonthResult; l: string; v: number; lv?: boolean; ind?: boolean; cls?: string }) {
  return (
    <tr className={`border-t border-line ${lv ? "font-bold" : ""} ${lv && cls === "hi" ? "bg-brand/10" : ""}`}>
      <td className={`py-1.5 ${ind ? "pl-6 text-tx2" : "pl-2"}`}>{l}</td>
      <td className={`text-right ${cls === "ok" ? "text-ok" : cls === "bad" ? "text-danger" : ""}`}>{F(v)}</td>
      <td className="text-right text-tx3 text-xs">{r.rev ? P(v / r.rev * 100) : ""}</td>
    </tr>
  );
}
function PLTable({ r, month, vat }: { r: MonthResult; month: AcctMonth; vat: number }) {
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
const STEPS = (r: MonthResult): [string, number, string, boolean][] => [
  ["營業額", r.rev, "var(--brand2)", true], ["拆分給別人", -r.split, "var(--danger)", false], ["營業毛利", r.gp, "var(--brand2)", true],
  ["固定支出", -r.fixed, "var(--danger)", false], ["營業稅", -r.vat, "var(--danger)", false], ["淨利", r.net, r.net >= 0 ? "var(--ok)" : "var(--danger)", true],
];
function wfBars(steps: [string, number, string, boolean][], sc: number, H: number) {
  let y = 0;
  return steps.map(([, v, , sub]) => {
    let top: number, h: number;
    if (sub) { top = H - 20 - Math.max(0, v) * sc; h = Math.abs(v) * sc; y = v; }
    else { const y0 = y, y1 = y + v; top = H - 20 - Math.max(y0, y1) * sc; h = Math.abs(v) * sc; y = y1; }
    return { top, h };
  });
}
function Waterfall({ r }: { r: MonthResult }) {
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
function WaterfallPair({ rt, r }: { rt: MonthResult; r: MonthResult }) {
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
function Trend({ S, ym }: { S: AcctState; ym: string }) {
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
