"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { calcReceipt, payoutsOf, prevYm, nextYm, isYm, netOf, referralChain, isFormalRank, type AcctState, type AcctItem, type Receipt, type Sharer, type CoachLite } from "@/lib/acctEngine";
import { saveAcctReceiptAction, deleteAcctReceiptAction } from "./actions";
import { useAcct, card, h2, hint, btn, xbtn, F, NUM, uid } from "./AcctParts";

// 帳務 › 收款明細（2026/10/08）：對帳表的每一列進系統。
// 首屏一張「錢去了哪裡」＋三個數（收款／公司實收／待匯出），底下逐筆表照項目分組，像 Excel 的分頁。
// 每一筆的拆分由 acctEngine.calcReceipt 算，規則掛在參數設定的項目上。

const EMPTY_FORM = (it: AcctItem | undefined, ym: string): Receipt => ({
  id: "", ym, itemId: it?.id ?? "", on: `${ym}-01`, amount: it?.price ?? 0, last5: "", payer: "", payerCoachId: null, sharers: [], payees: {}, note: "", void: false, refund: 0, source: "manual",
});
/** 手填的分潤人（備援）：對得上名冊就帶 coachId 與目前職級。正規做法是用「推薦人」挑人讓系統展開輔導鏈。 */
const parseSharers = (text: string, coachList: CoachLite[]): Sharer[] =>
  text.split(/[、,，/／\s]+/).map((x) => x.trim()).filter(Boolean).map((name) => {
    const c = coachList.find((k) => k.name === name);
    return c ? { name, coachId: c.id, rankCode: c.rankCode ?? null } : { name };
  });

export default function ReceiptsBoard({ initial, today }: { initial: AcctState; today: string }) {
  const { S, setS, run, status, pending } = useAcct(initial);
  const keys = useMemo(() => Array.from(new Set([...Object.keys(S.months), ...Object.keys(S.receipts ?? {})])).sort(), [S.months, S.receipts]);
  const [ym, setYm] = useState<string>(keys.includes(today) ? today : keys[keys.length - 1] ?? today);
  const [editing, setEditing] = useState<Receipt | null>(null);   // id 空＝新增
  const rows = useMemo(() => [...(S.receipts?.[ym] ?? [])].sort((a, b) => a.on.localeCompare(b.on) || a.id.localeCompare(b.id)), [S.receipts, ym]);
  const sum = useMemo(() => payoutsOf(S, ym), [S, ym]);
  const coachList = S.coachList ?? [];

  const upsertLocal = (r: Receipt) => setS((s) => {
    const all = { ...(s.receipts ?? {}) };
    for (const k of Object.keys(all)) all[k] = all[k].filter((x) => x.id !== r.id);
    all[r.ym] = [...(all[r.ym] ?? []), r];
    const months = s.months[r.ym] ? s.months : { ...s.months, [r.ym]: { qty: {}, fixed: [] } };
    return { ...s, receipts: all, months };
  });
  const save = (r: Receipt) => {
    const id = r.id || null;
    const local = { ...r, id: r.id || `tmp-${uid()}` };
    upsertLocal(local);
    setEditing(null);
    if (r.ym !== ym) setYm(r.ym);
    run(async () => {
      const res = await saveAcctReceiptAction(id, r);
      if (res.ok && res.info && res.info !== local.id) upsertLocal({ ...local, id: res.info });
      return res;
    }, id ? "已改這一筆" : "已記一筆收款");
  };
  const remove = async (r: Receipt) => {
    if (!await confirmDialog(`刪除 ${r.on} ${r.payer} 的 ${F(r.amount)}？`, { danger: true })) return;
    setS((s) => ({ ...s, receipts: { ...(s.receipts ?? {}), [r.ym]: (s.receipts?.[r.ym] ?? []).filter((x) => x.id !== r.id) } }));
    run(() => deleteAcctReceiptAction(r.id), "已刪");
  };
  const toggleVoid = (r: Receipt) => save({ ...r, void: !r.void });

  // 分組：照項目的分類（沒有分類就用項目名）；順序照參數設定的項目順序
  const groups = useMemo(() => {
    const out: { key: string; title: string; items: AcctItem[]; rows: Receipt[] }[] = [];
    for (const it of S.items) {
      const key = it.cat || it.name;
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, title: key, items: [], rows: [] }; out.push(g); }
      g.items.push(it);
      g.rows.push(...rows.filter((r) => r.itemId === it.id));
    }
    return out.filter((g) => g.rows.length);
  }, [S.items, rows]);

  // 錢去了哪裡：公司實收 ＋ 各受款人
  const flow = useMemo(() => {
    const parts = [{ name: "公司實收", v: sum.company, cls: "var(--brand2)" }, ...sum.lines.slice(0, 6).map((l, i) => ({ name: l.payee, v: l.due, cls: i % 2 ? "var(--tx3)" : "var(--tx2)" }))];
    const rest = sum.lines.slice(6).reduce((a, l) => a + l.due, 0);
    if (rest > 0) parts.push({ name: "其他", v: rest, cls: "var(--line2)" });
    return parts.filter((p) => p.v > 0);
  }, [sum]);

  if (!S.items.length) {
    return <div className={card}><p className="text-sm text-tx2">還沒有營業項目。先到 <Link className="text-brand2 underline" href="/admin/accounting">參數設定</Link> 把項目與拆分建起來。</p></div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tx2">看哪一個月</span>
        <button className={btn} onClick={() => setYm(prevYm(ym))}>‹</button>
        <select className={SELECT_SM} value={keys.includes(ym) ? ym : ""} onChange={(e) => { if (isYm(e.target.value)) setYm(e.target.value); }}>
          {!keys.includes(ym) && <option value="">{ym}（還沒有收款）</option>}
          {keys.map((k) => <option key={k} value={k}>{k}・{(S.receipts?.[k] ?? []).length} 筆</option>)}
        </select>
        <button className={btn} onClick={() => setYm(nextYm(ym))}>›</button>
        <button className={`${btn} border-brand2 text-brand2`} disabled={!!editing} onClick={() => setEditing(EMPTY_FORM(S.items[0], ym))}>＋ 記一筆收款</button>
        <span className="text-xs text-tx3 ml-auto">{status}</span>
      </div>

      {/* 首屏：錢去了哪裡 */}
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className={h2}>{ym} 收進來的錢去了哪裡</h2>
          <span className="text-xs text-tx3">{rows.filter((r) => !r.void).length} 筆收款</span>
        </div>
        {sum.received > 0 ? (
          <>
            <div className="flex h-7 w-full rounded-lg overflow-hidden" role="img" aria-label="收款流向">
              {flow.map((p) => <i key={p.name} className="block h-full" style={{ width: `${p.v / sum.received * 100}%`, background: p.cls }} title={`${p.name} ${F(p.v)}`} />)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-tx2">
              {flow.map((p) => <span key={p.name}><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: p.cls }} />{p.name} {F(p.v)}（{Math.round(p.v / sum.received * 100)}%）</span>)}
            </div>
          </>
        ) : <p className={hint}>這個月還沒有收款。</p>}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Kpi l="本月收款" v={F(sum.received)} />
          <Kpi l="公司實收" v={F(sum.company)} cls="text-brand2" sub={sum.received ? `${Math.round(sum.company / sum.received * 100)}%` : ""} />
          <Kpi l="待匯出" v={F(sum.remaining)} cls={sum.remaining > 0 ? "text-danger" : "text-ok"} sub={<Link href="/admin/accounting/payouts" className="hover:text-brand2 underline">去分潤匯款</Link>} />
        </div>
        {sum.warns.length > 0 && <ul className="mt-3 text-xs text-danger space-y-0.5">{sum.warns.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
      </div>

      {editing && (
        <ReceiptForm key={editing.id || "new"} init={editing} S={S} coachList={coachList} pending={pending} onCancel={() => setEditing(null)} onSave={save} />
      )}

      {/* 逐筆：照項目分組（像 Excel 的分頁） */}
      {groups.map((g) => (
        <div key={g.key} className={card}>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className={h2}>{g.title}</h2>
            <span className="text-xs text-tx3">{g.rows.filter((r) => !r.void).length} 筆・{F(g.rows.filter((r) => !r.void).reduce((a, r) => a + netOf(r), 0))}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-tx3"><th className="text-left py-1 whitespace-nowrap">匯款日期</th>{g.items.length > 1 && <th className="text-left">項目</th>}<th className="text-right">金額</th><th className="text-left pl-3">後五碼</th><th className="text-left">匯款人</th><th className="text-left">分潤人</th><th className="text-left">拆分</th><th /></tr></thead>
              <tbody>
                {g.rows.map((r) => {
                  const it = S.items.find((i) => i.id === r.itemId)!;
                  const rr = calcReceipt(it, netOf(r), r.sharers, r.payees, S.params, {}, r.allocs);
                  const isCase = r.source === "case";
                  return (
                    <tr key={r.id} className={`border-t border-line align-top ${r.void ? "text-tx3 line-through" : ""}`}>
                      <td className="py-1.5 whitespace-nowrap">{r.on}</td>
                      {g.items.length > 1 && <td className="whitespace-nowrap">{it.name}</td>}
                      <td className="text-right whitespace-nowrap">{F(r.amount)}{r.refund > 0 && <div className="text-10 text-danger">退 {F(r.refund)}</div>}</td>
                      <td className="pl-3 text-tx2">{r.last5 || "—"}</td>
                      <td className="whitespace-nowrap">{r.payer}{r.payerCoachId && <span className="text-10 text-tx3 ml-1">教練</span>}</td>
                      <td className="text-tx2">{isCase ? <span className="text-tx3">案件</span> : r.sharers.length ? r.sharers.map((s) => `${s.name}${s.rankCode ? ` ${s.rankCode}` : ""}`).join(" → ") : <span className="text-tx3">—</span>}</td>
                      <td className="no-underline">
                        <div className="flex flex-wrap gap-1">
                          {rr.rows.filter((x) => x.v !== 0).map((x, i) => <span key={i} className={`text-10 rounded-full border px-2 py-0.5 whitespace-nowrap ${x.mode === "keep" ? "border-brand2 text-brand2" : "border-line text-tx2"}`} title={x.label}>{x.to} {F(x.v)}</span>)}
                          <span className="text-10 rounded-full bg-panel3 text-brand2 px-2 py-0.5 whitespace-nowrap font-bold">公司 {F(rr.company)}</span>
                          {rr.warn && <span className="text-10 text-danger">⚠ {rr.warn}</span>}
                        </div>
                        {r.note && <div className="text-xs text-tx3 mt-0.5">{r.note}</div>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {isCase ? <Link href="/admin/cases" className="text-xs text-tx3 hover:text-brand2 px-1 no-underline">案件與分潤 ›</Link> : (<>
                          <button className="text-xs text-tx3 hover:text-tx px-1" onClick={() => setEditing(r)}>改</button>
                          <button className="text-xs text-tx3 hover:text-tx px-1" onClick={() => toggleVoid(r)}>{r.void ? "恢復" : "作廢"}</button>
                          <button className={xbtn} onClick={() => remove(r)}>✕</button>
                        </>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!groups.length && !editing && <div className={card}><p className="text-sm text-tx2">{ym} 還沒有收款。按「＋ 記一筆收款」開始。</p></div>}
    </div>
  );
}

function Kpi({ l, v, cls, sub }: { l: string; v: string; cls?: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <div className="text-xs text-tx3">{l}</div>
      <div className={`text-lg font-bold ${cls ?? ""}`}>{v}</div>
      {sub ? <div className="text-xs text-tx3">{sub}</div> : null}
    </div>
  );
}

/** 一筆收款的表單（新增與改共用）。改項目會把金額帶成單價；分潤人用「、」分，對得上名冊就連結。 */
function ReceiptForm({ init, S, coachList, pending, onCancel, onSave }: {
  init: Receipt; S: AcctState; coachList: CoachLite[]; pending: boolean; onCancel: () => void; onSave: (r: Receipt) => void;
}) {
  const [r, setR] = useState<Receipt>(init);
  const [sharerText, setSharerText] = useState(init.sharers.map((s) => s.name).join("、"));
  const it = S.items.find((i) => i.id === r.itemId) ?? S.items[0];
  const restSplits = it.splits.filter((s) => s.mode === "rest");
  const hasPool = it.splits.some((s) => s.mode === "pool");
  const preview = calcReceipt(it, netOf(r), r.sharers, r.payees, S.params);
  const referrerId = r.sharers[0]?.coachId ?? "";
  const [manualShare, setManualShare] = useState(() => init.sharers.length > 0 && !init.sharers[0]?.coachId);
  const pickReferrer = (id: string) => set({ sharers: id ? referralChain(id, coachList) : [] });
  const payerCoach = coachList.find((c) => c.id === r.payerCoachId);
  const payerFormal = !!payerCoach && isFormalRank(payerCoach.rankCode);
  const set = (patch: Partial<Receipt>) => setR((x) => ({ ...x, ...patch }));
  const pickItem = (id: string) => { const n = S.items.find((i) => i.id === id); if (n) set({ itemId: id, amount: n.price || r.amount }); };
  const setPayer = (payer: string) => { const c = coachList.find((k) => k.name === payer.trim()); set({ payer, payerCoachId: c ? c.id : null }); };
  const submit = () => onSave({ ...r, ym: r.on.slice(0, 7), itemId: it.id, sharers: manualShare ? parseSharers(sharerText, coachList) : r.sharers });
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(r.on) && r.amount > 0;
  return (
    <div className={`${card} border-brand2`}>
      <h2 className={h2}>{r.id ? "改這一筆" : "記一筆收款"}</h2>
      <div className="flex flex-wrap items-end gap-3 mt-2 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">項目</span>
          <select className={SELECT_SM} value={it.id} onChange={(e) => pickItem(e.target.value)}>{S.items.map((i) => <option key={i.id} value={i.id}>{i.cat ? `${i.cat}・` : ""}{i.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">匯款日期</span>
          <input type="date" className={`${FIELD_SM} w-40`} value={r.on} onChange={(e) => set({ on: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">匯款金額</span>
          <input className={`${FIELD_SM} w-28 text-right`} inputMode="numeric" value={r.amount} onChange={(e) => set({ amount: NUM(e.target.value) })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">後五碼</span>
          <input className={`${FIELD_SM} w-28`} value={r.last5} placeholder="或「信用卡分期」" onChange={(e) => set({ last5: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">匯款人</span>
          <input className={`${FIELD_SM} w-32`} list="acct-coach-names" value={r.payer} onChange={(e) => setPayer(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-tx3">退款（部分退款填金額）</span>
          <input className={`${FIELD_SM} w-24 text-right`} inputMode="numeric" value={r.refund || ""} placeholder="0" onChange={(e) => set({ refund: NUM(e.target.value) })} /></label>
        {hasPool && !manualShare && (
          <label className="flex flex-col gap-1"><span className="text-xs text-tx3">推薦人（系統沿他的輔導鏈算差階）</span>
            <span className="flex items-center gap-2">
              <select className={SELECT_SM} value={referrerId} onChange={(e) => pickReferrer(e.target.value)}>
                <option value="">無（不計推薦）</option>
                {coachList.map((c) => <option key={c.id} value={c.id}>{c.name}{c.rankCode ? `（${c.rankCode}）` : ""}</option>)}
              </select>
              <button type="button" className="text-xs text-tx3 hover:text-tx underline" onClick={() => { setManualShare(true); setSharerText(r.sharers.map((x) => x.name).join("、")); }}>改手填</button>
            </span></label>
        )}
        {hasPool && manualShare && (
          <label className="flex flex-col gap-1"><span className="text-xs text-tx3">分潤人（職級低→高，用「、」分）</span>
            <span className="flex items-center gap-2">
              <input className={`${FIELD_SM} w-56`} value={sharerText} placeholder="沒有就留空" onChange={(e) => { setSharerText(e.target.value); set({ sharers: parseSharers(e.target.value, coachList) }); }} />
              <button type="button" className="text-xs text-tx3 hover:text-tx underline" onClick={() => { setManualShare(false); pickReferrer(r.sharers[0]?.coachId ?? ""); }}>改挑推薦人</button>
            </span></label>
        )}
        {restSplits.map((s) => (
          <label key={s.to} className="flex flex-col gap-1"><span className="text-xs text-tx3">{s.to}（餘額 {s.v}%）匯給</span>
            <input className={`${FIELD_SM} w-32`} list="acct-coach-names" value={r.payees[s.to] ?? ""} placeholder={s.to} onChange={(e) => set({ payees: { ...r.payees, [s.to]: e.target.value } })} /></label>
        ))}
        <label className="flex flex-col gap-1 flex-1 min-w-40"><span className="text-xs text-tx3">備註</span>
          <input className={`${FIELD_SM} w-full`} value={r.note} onChange={(e) => set({ note: e.target.value })} /></label>
        <datalist id="acct-coach-names">{coachList.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </div>
      {hasPool && r.sharers.length > 0 && (
        <div className="text-xs text-tx3 mt-2">推薦端：{r.sharers.map((x) => `${x.name}${x.rankCode ? ` ${x.rankCode}` : ""}`).join(" → ")}{payerFormal && <span className="text-danger ml-2">⚠ 匯款人已是正式教練，依制度不計推薦</span>}</div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-tx2">
        <span className="text-tx3">這一筆會拆成：</span>
        {preview.rows.filter((x) => x.v !== 0).map((x, i) => <span key={i} className={`rounded-full border px-2 py-0.5 ${x.mode === "keep" ? "border-brand2 text-brand2" : "border-line"}`}>{x.to} {F(x.v)}<span className="text-tx3 ml-1">{x.label}</span></span>)}
        <span className="rounded-full bg-panel3 text-brand2 px-2 py-0.5 font-bold">公司實收 {F(preview.company)}</span>
        {preview.warn && <span className="text-danger">⚠ {preview.warn}</span>}
      </div>
      <div className="flex gap-2 mt-3">
        <button className={`${btn} border-brand2 text-brand2`} disabled={!ok || pending} onClick={submit}>{r.id ? "存" : "記下來"}</button>
        <button className={btn} onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
