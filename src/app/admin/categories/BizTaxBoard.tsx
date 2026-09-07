"use client";

import { useState, useTransition } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD } from "@/components/ui/Field";
import { saveBizTaxAction, resetBizTaxAction, type ActionResult } from "./actions";
import type { BizTaxRow } from "@/lib/bizTaxParams";
import { fmtMoney } from "@/lib/money";
import MoneyInput from "@/components/MoneyInput";

// 企業稅務法規常數的後台面板。
//
// 為什麼要有這一頁：這一塊改得比個人稅制勤，而且「改了沒更新」比「沒寫」更危險——
// 稅捐稽徵法 §41 的罰金上限 110 年修法後從 6 萬提高到 1,000 萬，網路上仍有大量資料寫舊法。
// 放進後台，發現法規變了可以當天改完，不必等改版。
//
// 只能改內建清單裡的 key、不能新增：前端那些常數名是寫死的，多一列沒有用，
// 少一列反而會讓試算靜靜地算出 NaN。「回復內建值」＝把 DB 那列刪掉。

const inputCls = FIELD;
const btnCls =
  "rounded-lg border border-line2 px-3 py-1.5 text-sm text-tx2 hover:bg-panel3 disabled:opacity-40";

const UNIT_HINT: Record<string, string> = {
  rate: "比率（填小數：20% → 0.2）",
  money: "金額（新台幣元）",
  x: "倍數",
  num: "數值（%／年，直接填 8 就是 8%）",
};

function display(v: number, unit: string) {
  if (unit === "rate") return `${+(v * 100).toFixed(4)}%`;
  if (unit === "x") return `${v} 倍`;
  if (unit === "num") return `${v}`;
  return fmtMoney(v);
}

export default function BizTaxBoard({ rows, basis }: { rows: BizTaxRow[]; basis: string }) {
  const [draft, setDraft] = useState<Record<string, { value: string; basis: string; note: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setMsg(okMsg); setErr(null); }
      else { setErr(r.error); setMsg(null); }
    });

  const groups = Array.from(new Set(rows.map((r) => r.grp)));

  return (
    <div className="rounded-xl border border-line bg-panel p-5 mt-6 shadow-e1">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold border-l-[3px] border-brand2 pl-2">企業稅務法規常數</h2>
        <span className="text-xs text-tx3">目前對外顯示的資料基準：{basis}</span>
      </div>
      <p className="text-xs text-tx3 mb-4 leading-relaxed">
        企業主模組（報酬結構試算、股權估值、合規閘、作業手冊）吃的就是這些數字。
        改完全平台即時生效。<b className="text-tx2">比率一律填小數</b>——20% 填 0.2，填 20 會被擋下來。
        每一列的「資料基準」是這個數字自己的有效期，畫面上會取最新的一個對外顯示。
      </p>

      {(msg || err) && (
        <p className={`text-sm mb-3 ${err ? "text-danger" : "text-ok"}`}>{err ?? msg}</p>
      )}

      {groups.map((g) => (
        <div key={g} className="mb-5">
          <h3 className="text-xs text-tx2 mb-2">{g}</h3>
          <div className="tbl-wrap">
            <table className="w-full text-sm border-collapse min-w-[820px] tbl-sticky">
              <thead>
                <tr>
                  {["項目", "目前值", "新值", "資料基準", "備註 / 法源", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold text-xs text-tx2 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.grp === g).map((r) => {
                  const d = draft[r.key] ?? { value: String(r.value), basis: r.basis, note: r.note };
                  const set = (patch: Partial<typeof d>) =>
                    setDraft((prev) => ({ ...prev, [r.key]: { ...d, ...patch } }));
                  return (
                    <tr key={r.key}>
                      <td className="px-3 py-2 border-t border-line align-top">
                        <div className="font-semibold text-tx">{r.label}</div>
                        <code className="text-11 text-tx3">{r.key}</code>
                      </td>
                      <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">
                        <span className="text-brand2 font-bold">{display(r.value, r.unit)}</span>
                        <div className="text-11 text-tx3">{UNIT_HINT[r.unit]}</div>
                      </td>
                      <td className="px-3 py-2 border-t border-line align-top w-[130px]">
                        {/* 金額欄補千分位；比率／倍數是小數，維持自由輸入。 */}
                        {r.unit === "money" ? (
                          <MoneyInput className={inputCls} allowEmpty
                            value={d.value === "" ? null : Number(d.value)}
                            onChange={(v) => set({ value: v === null ? "" : String(v) })} />
                        ) : (
                          <input className={inputCls} value={d.value} inputMode="decimal"
                            onChange={(e) => set({ value: e.target.value })} />
                        )}
                      </td>
                      <td className="px-3 py-2 border-t border-line align-top w-[110px]">
                        <input className={inputCls} value={d.basis} placeholder="2026-08"
                          onChange={(e) => set({ basis: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 border-t border-line align-top">
                        <input className={inputCls} value={d.note}
                          onChange={(e) => set({ note: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">
                        <button disabled={pending} className={btnCls}
                          onClick={() => run(() => saveBizTaxAction({ key: r.key, value: d.value, basis: d.basis, note: d.note }), `已更新「${r.label}」`)}>
                          儲存
                        </button>
                        <button disabled={pending} className={`${btnCls} ml-2`}
                          onClick={async () => {
                            if (!await confirmDialog(`「${r.label}」回復程式內建值？`)) return;
                            setDraft((prev) => { const n = { ...prev }; delete n[r.key]; return n; });
                            run(() => resetBizTaxAction(r.key), `已回復「${r.label}」的內建值`);
                          }}>
                          回復內建
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="text-xs text-tx3 leading-relaxed">
        條號、刑度那些<b className="text-tx2">文字敘述</b>不在這裡——它們一改通常是整段語意都變了，
        不是換個數字就好，維護在 <code>src/lib/bizTax.ts</code> 並隨改版上線。
      </p>
    </div>
  );
}
