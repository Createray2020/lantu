"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/components/ui/confirm";
import { calcData, prevYm, type AcctState, type AcctTarget } from "@/lib/acctEngine";
import { saveAcctDraftAction, saveAcctTargetAction, deleteAcctTargetAction } from "./actions";
import { useAcct, TargetWorkbench, MonthEditor, Waterfall, Trend, card, h2, hint, btn, xbtn, numIn, F, P, NUM } from "./AcctParts";

// 帳務 › 目標設定：上半是不綁月份的目標工作台，下半是各月目標清單（點一個月展開改）。不碰實際帳。
export default function TargetsBoard({ initial, today }: { initial: AcctState; today: string }) {
  const { S, setS, run, pending, status } = useAcct(initial);
  const [open, setOpen] = useState<string | null>(null);
  const keys = useMemo(() => Object.keys(S.targets).sort(), [S.targets]);
  const monthKeys = useMemo(() => Object.keys(S.months).sort(), [S.months]);

  const saveDraft = (d: AcctTarget) => { setS((s) => ({ ...s, draft: d })); run(() => saveAcctDraftAction(d), "已存工作台草稿"); };
  const saveTarget = (t: AcctTarget, k: string) => { setS((s) => ({ ...s, targets: { ...s.targets, [k]: t } })); run(() => saveAcctTargetAction(k, t), `已存 ${k} 目標`); };
  const storeDraft = (k: string) => { if (!S.draft) return; saveTarget({ qty: { ...S.draft.qty }, fixed: S.draft.fixed.map((f) => ({ ...f })), net: S.draft.net }, k); setOpen(k); };
  const removeTarget = async (k: string) => {
    if (!await confirmDialog(`刪除 ${k} 的目標？`, { danger: true })) return;
    const rest = { ...S.targets }; delete rest[k];
    setS((s) => ({ ...s, targets: rest }));
    if (open === k) setOpen(null);
    run(() => deleteAcctTargetAction(k), `已刪 ${k} 目標`);
  };
  const copyPrev = (k: string) => { const t = S.targets[prevYm(k)]; if (t) saveTarget({ qty: { ...t.qty }, fixed: t.fixed.map((f) => ({ ...f })), net: t.net }, k); };

  if (!S.items.length) {
    return <div className={card}><p className="text-sm text-tx2">還沒有營業項目。先到 <Link className="text-brand2 underline" href="/admin/accounting">參數設定</Link> 把項目與拆分建起來。</p></div>;
  }
  const t = open ? S.targets[open] : null;
  const rt = t ? calcData(S.items, t, S.params) : null;

  return (
    <div className="space-y-4">
      <div className="text-xs text-tx3 text-right h-4">{status}</div>
      <TargetWorkbench S={S} draft={S.draft} onSave={saveDraft} onStore={storeDraft} latestYm={monthKeys[monthKeys.length - 1] ?? null} today={today} pending={pending} />

      <div className={card}>
        <h2 className={h2}>各月目標</h2>
        <p className={`${hint} mb-3`}>已存進去的目標。點一個月展開改；跟實際帳是兩張表，怎麼改都不動實際數字。</p>
        {keys.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-tx3"><th className="text-left py-1">月份</th><th className="text-right">目標淨利</th><th className="text-right">照筆數算出的淨利</th><th className="text-right">筆數合計</th><th className="text-right">固定支出</th><th className="text-right">實際淨利</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => {
                const x = S.targets[k], r = calcData(S.items, x, S.params);
                const a = S.months[k] ? calcData(S.items, S.months[k], S.params) : null;
                return (
                  <tr key={k} className={`border-t border-line ${open === k ? "bg-brand/10" : ""}`}>
                    <td className="py-1.5"><button className="font-bold hover:text-brand2" onClick={() => setOpen(open === k ? null : k)}>{k}</button></td>
                    <td className="text-right">{F(x.net)}</td>
                    <td className={`text-right ${r.net >= x.net ? "text-ok" : "text-danger"}`}>{F(r.net)}</td>
                    <td className="text-right">{r.byItem.reduce((s, b) => s + b.q, 0)}</td>
                    <td className="text-right">{F(r.fixed)}</td>
                    <td className="text-right text-tx2">{a ? F(a.net) : "—"}</td>
                    <td className="text-right"><button className={xbtn} onClick={() => removeTarget(k)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-sm text-tx3">還沒有任何月份的目標——在上面的工作台設好，填月份存入。</p>}
        <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
          <span className="text-tx2">或直接開一個月：</span>
          <NewTargetRow onCopyPrev={copyPrev} onFromDraft={storeDraft} hasDraft={!!S.draft} targets={S.targets} today={today} />
        </div>
      </div>

      {open && t && rt && (
        <div className={card}>
          <h2 className={h2}>{open} 的目標</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
            目標淨利 <input key={`${open}-net`} className={numIn} inputMode="numeric" defaultValue={t.net} onBlur={(e) => { const v = NUM(e.target.value); if (v !== t.net) saveTarget({ ...t, net: v }, open); }} /> 元／月
            <span className="text-tx3">｜</span>
            <span>照筆數算出來淨利 <b className={rt.net >= t.net ? "text-ok" : "text-danger"}>{F(rt.net)}</b>、毛利率 {P(rt.gm * 100)}</span>
          </div>
          <MonthEditor data={t} res={rt} refQty={S.months[open]?.qty} refLabel="實際" label="目標" keyTag={open} onSave={(m) => saveTarget({ ...m, net: t.net }, open)} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div><div className={`${hint} mb-1`}>目標的錢怎麼一層一層變成淨利</div><Waterfall r={rt} /></div>
            <div><div className={`${hint} mb-1`}>近 12 個月：實際淨利（線）vs 目標淨利（虛線）</div><Trend S={S} ym={open} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewTargetRow({ onCopyPrev, onFromDraft, hasDraft, targets, today }: { onCopyPrev: (k: string) => void; onFromDraft: (k: string) => void; hasDraft: boolean; targets: Record<string, AcctTarget>; today: string }) {
  const [k, setK] = useState(today);
  const ok = /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
  return (
    <>
      <input className={`${numIn} w-28 text-left`} value={k} onChange={(e) => setK(e.target.value)} placeholder="YYYY-MM" />
      <button className={btn} disabled={!ok || !targets[prevYm(k)]} onClick={() => onCopyPrev(k)}>複製上月目標</button>
      <button className={btn} disabled={!ok || !hasDraft} onClick={() => onFromDraft(k)}>從工作台存入</button>
    </>
  );
}
