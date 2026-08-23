"use client";

import { useState, useTransition } from "react";
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

const inputCls =
  "w-full rounded border border-white/15 bg-[#0b2136] px-2 py-1 text-sm text-[#eef2f7] outline-none focus:border-[#c99a5b]";
const btnCls =
  "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";

const UNIT_HINT: Record<string, string> = {
  rate: "比率（填小數：20% → 0.2）",
  money: "金額（新台幣元）",
  x: "倍數",
};

function display(v: number, unit: string) {
  if (unit === "rate") return `${+(v * 100).toFixed(4)}%`;
  if (unit === "x") return `${v} 倍`;
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
    <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-5 mt-6">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2">企業稅務法規常數</h2>
        <span className="text-xs text-[#6f869c]">目前對外顯示的資料基準：{basis}</span>
      </div>
      <p className="text-xs text-[#6f869c] mb-4 leading-relaxed">
        企業主模組（報酬結構試算、股權估值、合規閘、作業手冊）吃的就是這些數字。
        改完全平台即時生效。<b className="text-[#a9bccf]">比率一律填小數</b>——20% 填 0.2，填 20 會被擋下來。
        每一列的「資料基準」是這個數字自己的有效期，畫面上會取最新的一個對外顯示。
      </p>

      {(msg || err) && (
        <p className={`text-sm mb-3 ${err ? "text-[#ff9b9b]" : "text-[#8fc0a3]"}`}>{err ?? msg}</p>
      )}

      {groups.map((g) => (
        <div key={g} className="mb-5">
          <h3 className="text-xs text-[#a9bccf] mb-2">{g}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[820px]">
              <thead>
                <tr>
                  {["項目", "目前值", "新值", "資料基準", "備註 / 法源", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold text-xs text-[#a9bccf] text-left whitespace-nowrap">{h}</th>
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
                      <td className="px-3 py-2 border-t border-white/8 align-top">
                        <div className="font-semibold text-[#eef2f7]">{r.label}</div>
                        <code className="text-[11px] text-[#6f869c]">{r.key}</code>
                      </td>
                      <td className="px-3 py-2 border-t border-white/8 align-top whitespace-nowrap">
                        <span className="text-[#e0bd8b] font-bold">{display(r.value, r.unit)}</span>
                        <div className="text-[11px] text-[#6f869c]">{UNIT_HINT[r.unit]}</div>
                      </td>
                      <td className="px-3 py-2 border-t border-white/8 align-top w-[130px]">
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
                      <td className="px-3 py-2 border-t border-white/8 align-top w-[110px]">
                        <input className={inputCls} value={d.basis} placeholder="2026-08"
                          onChange={(e) => set({ basis: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 border-t border-white/8 align-top">
                        <input className={inputCls} value={d.note}
                          onChange={(e) => set({ note: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 border-t border-white/8 align-top whitespace-nowrap">
                        <button disabled={pending} className={btnCls}
                          onClick={() => run(() => saveBizTaxAction({ key: r.key, value: d.value, basis: d.basis, note: d.note }), `已更新「${r.label}」`)}>
                          儲存
                        </button>
                        <button disabled={pending} className={`${btnCls} ml-2`}
                          onClick={() => {
                            if (!confirm(`「${r.label}」回復程式內建值？`)) return;
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

      <p className="text-xs text-[#6f869c] leading-relaxed">
        條號、刑度那些<b className="text-[#a9bccf]">文字敘述</b>不在這裡——它們一改通常是整段語意都變了，
        不是換個數字就好，維護在 <code>src/lib/bizTax.ts</code> 並隨改版上線。
      </p>
    </div>
  );
}
