"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/components/ui/confirm";
import { SELECT_SM } from "@/components/ui/Field";
import { calcMonth, calcTarget, compareMonth, breakeven, prevYm, nextYm, isYm, type AcctState, type AcctMonth } from "@/lib/acctEngine";
import { saveAcctMonthAction, ensureAcctMonthAction, deleteAcctMonthAction } from "./actions";
import { useAcct, MonthEditor, PLTable, Waterfall, Trend, CompareHero, CompareQty, CompareFixed, PLCompare, card, h2, hint, btn, xbtn, F, P, EMPTY } from "./AcctParts";

// 帳務 › 本月帳務：選月份 → 填實際（數量、固定支出）→ 結論／KPI／圖 → 損益結構。有目標的月份多一個「對照」。
export default function MonthlyBoard({ initial, today }: { initial: AcctState; today: string }) {
  const { S, setS, run, status } = useAcct(initial);
  const keys = useMemo(() => Object.keys(S.months).sort(), [S.months]);
  const [ym, setYm] = useState<string>(keys.includes(today) ? today : keys[keys.length - 1] ?? today);
  const [cmpOn, setCmpOn] = useState(false);
  const month: AcctMonth = S.months[ym] ?? EMPTY;
  const hasMonth = !!S.months[ym];
  const target = S.targets[ym] ?? null;
  const r = useMemo(() => calcMonth(S, ym), [S, ym]);
  const p = useMemo(() => calcMonth(S, prevYm(ym)), [S, ym]);
  const rt = useMemo(() => calcTarget(S, ym), [S, ym]);
  const cmp = useMemo(() => compareMonth(S, ym), [S, ym]);
  const showCmp = cmpOn && !!cmp && !!r && !!rt;

  const saveMonth = (m: AcctMonth) => { setS((s) => ({ ...s, months: { ...s.months, [ym]: m } })); run(() => saveAcctMonthAction(ym, m), `已存 ${ym}`); };
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
    run(() => deleteAcctMonthAction(ym), `已刪 ${ym}`);
  };

  if (!S.items.length) {
    return <div className={card}><p className="text-sm text-tx2">還沒有營業項目。先到 <Link className="text-brand2 underline" href="/admin/accounting">參數設定</Link> 把項目與拆分建起來。</p></div>;
  }
  const be = r ? breakeven(r, S.params.vatRate) : Infinity;
  const dn = r && p ? r.net - p.net : null;

  return (
    <div className="space-y-4">
      {/* 月份列 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tx2">看哪一個月</span>
        <button className={btn} onClick={() => openMonth(prevYm(ym))}>‹</button>
        <select className={SELECT_SM} value={hasMonth ? ym : ""} onChange={(e) => setYm(e.target.value)}>
          {!hasMonth && <option value="">（{ym} 還沒開）</option>}
          {keys.map((k) => <option key={k} value={k}>{k}{S.targets[k] ? "・有目標" : ""}</option>)}
        </select>
        <button className={btn} onClick={() => openMonth(nextYm(ym))}>›</button>
        {!hasMonth && <button className={`${btn} border-brand2 text-brand2`} onClick={() => openMonth(ym)}>開 {ym} 這一個月</button>}
        {hasMonth && target && (
          <span className="inline-flex rounded-lg border border-line overflow-hidden ml-2">
            {([[false, "實際"], [true, "對照目標"]] as [boolean, string][]).map(([v, l]) => (
              <button key={l} className={`px-3 py-1.5 text-sm ${cmpOn === v ? "bg-brand text-onbrand font-bold" : "text-tx2 hover:bg-panel3"}`} onClick={() => setCmpOn(v)}>{l}</button>
            ))}
          </span>
        )}
        {hasMonth && !target && <Link href="/admin/accounting/targets" className="text-xs text-tx3 hover:text-brand2">這個月還沒目標 → 去目標設定</Link>}
        {hasMonth && <button className={xbtn} onClick={removeMonth}>刪這個月</button>}
        <span className="text-xs text-tx3 ml-auto">{status}</span>
      </div>

      {!hasMonth ? (
        <div className={card}><p className="text-sm text-tx2">{ym} 還沒有資料。按「開 {ym} 這一個月」開始填數量；固定支出會從最近一個月複製過來。</p></div>
      ) : showCmp && cmp && r && rt ? (
        <>
          <CompareHero ym={ym} cmp={cmp} r={r} rt={rt} S={S} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={card}><h2 className={h2}>筆數：目標 → 實際</h2><p className={`${hint} mb-3`}>差幾筆對淨利影響多少。</p><CompareQty cmp={cmp} /></div>
            <div className={card}><h2 className={h2}>固定支出：目標 → 實際</h2><p className={`${hint} mb-3`}>同名的列合併比較。</p><CompareFixed cmp={cmp} /></div>
          </div>
          <div className={card}><h2 className={h2}>損益結構：目標 → 實際</h2><PLCompare r={r} rt={rt} vat={S.params.vatRate} /></div>
        </>
      ) : r ? (
        <>
          {/* ① 填實際 */}
          <div className={card}>
            <h2 className={h2}>{ym} 實際</h2>
            <p className={`${hint} mb-3`}>這個月每個項目賣出幾筆、固定支出實際是多少。之後接上實際訂單就自動帶入。</p>
            <MonthEditor data={month} res={r} refQty={target ? target.qty : S.months[prevYm(ym)]?.qty} refLabel={target ? "目標" : "上月"} label="本月" keyTag={ym} onSave={saveMonth} />
          </div>
          {/* ② 結論與圖 */}
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
          {/* ③ 損益結構 */}
          <div className={card}>
            <h2 className={h2}>{ym} 損益結構</h2>
            <p className={`${hint} mb-3`}>營業額 → 減拆分＝營業毛利 → 減固定支出、減營業稅 {S.params.vatRate}% ＝ 淨利。</p>
            <PLTable r={r} month={month} vat={S.params.vatRate} />
          </div>
        </>
      ) : null}
    </div>
  );
}
