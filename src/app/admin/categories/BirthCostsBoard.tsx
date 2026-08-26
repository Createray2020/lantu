"use client";

import { useState, useTransition } from "react";
import { saveBirthCostAction, resetBirthCostAction, type ActionResult } from "./actions";
import type { BirthCostRow } from "@/lib/birthCosts";
import { fmtMoney } from "@/lib/money";
import MoneyInput from "@/components/MoneyInput";

// 生育費用參數的後台面板。
//
// 為什麼要有這一頁：教育費用參數最早的一段是「幼兒園（3 歲起）」，
// 所以懷孕、生產、月子、0–2 歲這一整段原本沒有任何數字——
// 客戶說「我打算 3 年後生」，系統從那一年到上幼兒園之間是一片空白。
//
// 與企業稅務常數同一套規則：只能改內建清單裡的 key、不能新增；
// 「回復內建」＝把 DB 那一列刪掉，回到程式裡的 seed。

const inputCls =
  "w-full rounded border border-white/15 bg-[#0b2136] px-2 py-1 text-sm text-[#eef2f7] outline-none focus:border-[#c99a5b]";
const btnCls =
  "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";

const UNIT_HINT: Record<string, string> = {
  次: "一次性（整段孕期／整次生產）",
  月: "每月（會乘上月子月數）",
  年: "每年（0–2 歲共 3 年）",
};

export default function BirthCostsBoard({ rows, basis }: { rows: BirthCostRow[]; basis: string }) {
  const [draft, setDraft] = useState<Record<string, { amount: string; basis: string; note: string }>>({});
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
        <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2">生育費用參數</h2>
        <span className="text-xs text-[#6f869c]">目前對外顯示的資料基準：{basis}</span>
      </div>
      <p className="text-xs text-[#6f869c] mb-4 leading-relaxed">
        客戶端「子女教育 → 生育規劃」按下產生時，會用這些數字帶出每一胎的
        <b className="text-[#a9bccf]">生產與月子一次性支出</b>（進「目標／置產」）與
        <b className="text-[#a9bccf]">0–2 歲育兒費用</b>（進「支出」），教練仍可逐筆覆寫。
        金額一律<b className="text-[#e0bd8b]">今日現值</b>，通膨由引擎另外套，這裡不要先加。
        <br />
        政策前提：公費產檢 14 次＋3 次超音波（111/7 起），這裡填的是<b>公費之外的自費加購</b>；
        0–2 歲的金額是<b>已扣掉托育補助／育兒津貼後的自付額</b>，不要再扣一次。
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
                  {["項目", "目前值", "新值", "資料基準", "備註 / 來源", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold text-xs text-[#a9bccf] text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.grp === g).map((r) => {
                  const d = draft[r.key] ?? { amount: String(r.amount), basis: r.basis, note: r.note };
                  const set = (patch: Partial<typeof d>) =>
                    setDraft((prev) => ({ ...prev, [r.key]: { ...d, ...patch } }));
                  return (
                    <tr key={r.key}>
                      <td className="px-3 py-2 border-t border-white/8 align-top">
                        <div className="font-semibold text-[#eef2f7]">{r.label}</div>
                        <code className="text-[11px] text-[#6f869c]">{r.key}</code>
                      </td>
                      <td className="px-3 py-2 border-t border-white/8 align-top whitespace-nowrap">
                        <span className="text-[#e0bd8b] font-bold">{fmtMoney(r.amount)}</span>
                        <div className="text-[11px] text-[#6f869c]">{UNIT_HINT[r.unit] ?? r.unit}</div>
                      </td>
                      <td className="px-3 py-2 border-t border-white/8 align-top w-[130px]">
                        <MoneyInput className={inputCls} allowEmpty
                          value={d.amount === "" ? null : Number(d.amount)}
                          onChange={(v) => set({ amount: v === null ? "" : String(v) })} />
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
                          onClick={() => run(() => saveBirthCostAction({ key: r.key, amount: d.amount, basis: d.basis, note: d.note }), `已更新「${r.label}」`)}>
                          儲存
                        </button>
                        <button disabled={pending} className={`${btnCls} ml-2`}
                          onClick={() => {
                            if (!confirm(`「${r.label}」回復程式內建值？`)) return;
                            setDraft((prev) => { const n = { ...prev }; delete n[r.key]; return n; });
                            run(() => resetBirthCostAction(r.key), `已回復「${r.label}」的內建值`);
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
        月子中心與月嫂<b className="text-[#a9bccf]">擇一</b>：客戶端在生育規劃選了哪一種、住幾個月，就用對應的單價乘上月數。
      </p>
    </div>
  );
}
