"use client";

import { useState, useTransition } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD } from "@/components/ui/Field";
import { saveHouseSettingAction, resetHouseSettingAction, type ActionResult } from "./actions";
import { HOUSE_CONDITIONS, HOUSE_TYPES, type HousePayTemplate } from "@/lib/houseParams.defaults";

// 屋型倍率／屋齡倍率／三種屋況的付款範本。範本是全平台預設；每一筆購屋目標可以自己覆寫（Ray：每個建案不一樣）。
type Settings = { typeRatio: Record<string, number>; ageRatio: [number | null, number][]; pay: Record<string, HousePayTemplate> };
const inputCls = FIELD;
const btnCls = "rounded-lg border border-line2 px-3 py-1.5 text-sm text-tx2 hover:bg-panel3 disabled:opacity-40";
const PAY_FIELDS: [keyof HousePayTemplate, string, string][] = [
  ["deposit", "訂簽開 %", "預售：簽約當年一次付的比例"],
  ["progress", "工程期款合計 %", "預售：分年付的比例合計"],
  ["progressYears", "工程期款分幾年", "也是交屋延後的年數（交屋才起貸）"],
  ["agentFee", "仲介費 %", "中古才有"],
  ["closingFee", "雜費 %", "代書、契稅、印花、規費"],
  ["decoRatio", "裝修起手 %", "占總價"],
  ["loanRatio", "貸款成數起手 %", ""],
  ["loanYears", "貸款年期起手", ""],
  ["graceYears", "寬限期（年）", "只繳息、本金不動；之後本金攤在剩餘年期"],
];

export default function HouseSettingsBoard({ settings }: { settings: Settings }) {
  const [typeRatio, setTypeRatio] = useState<Record<string, string>>(Object.fromEntries(HOUSE_TYPES.map((t) => [t, String(settings.typeRatio[t] ?? 1)])));
  const [ageRatio, setAgeRatio] = useState<[string, string][]>(settings.ageRatio.map((x) => [x[0] == null ? "" : String(x[0]), String(x[1])]));
  const [pay, setPay] = useState<Record<string, Record<string, string>>>(
    Object.fromEntries(HOUSE_CONDITIONS.map((c) => [c, Object.fromEntries(PAY_FIELDS.map(([f]) => [f, String(settings.pay[c]?.[f] ?? "")]))])));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, okMsg: string) =>
    start(async () => { const r = await fn(); if (r.ok) { setMsg(okMsg); setErr(null); } else { setErr(r.error); setMsg(null); } });
  const reset = async (key: "typeRatio" | "ageRatio" | "pay", label: string) => {
    if (!await confirmDialog(`「${label}」回復程式內建值？`)) return;
    run(() => resetHouseSettingAction(key), `已回復「${label}」`);
  };

  return (
    <div className="rounded-xl border border-line bg-panel p-5 mt-6 shadow-e1">
      <h2 className="text-sm font-bold border-l-[3px] border-brand2 pl-2 mb-1">估值倍率・付款範本</h2>
      <p className="text-xs text-tx3 mb-4 leading-relaxed">估值＝均價 × 屋型倍率 × 屋齡倍率（中古才套）× 坪數 ＋ 車位。付款範本是預設，教練在每一筆購屋目標上可以覆寫。</p>
      {(msg || err) && <p className={`text-sm mb-3 ${err ? "text-danger" : "text-ok"}`}>{err ?? msg}</p>}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-xs text-tx2 mb-2">屋型倍率（相對電梯大樓＝1）</h3>
          {HOUSE_TYPES.map((t) => (
            <div key={t} className="flex items-center gap-2 mb-2">
              <span className="w-24 text-sm">{t}</span>
              <input className={`${inputCls} w-24`} inputMode="decimal" value={typeRatio[t]} onChange={(e) => setTypeRatio({ ...typeRatio, [t]: e.target.value })} />
            </div>
          ))}
          <button disabled={pending} className={btnCls} onClick={() => run(() => saveHouseSettingAction("typeRatio", typeRatio), "已更新屋型倍率")}>儲存</button>
          <button disabled={pending} className={`${btnCls} ml-2`} onClick={() => reset("typeRatio", "屋型倍率")}>回復內建</button>
        </div>
        <div>
          <h3 className="text-xs text-tx2 mb-2">中古屋屋齡帶倍率（屋齡 ≤ 上限 → 倍率；最後一段留空＝以上）</h3>
          {ageRatio.map((x, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <span className="text-sm">≤</span>
              <input className={`${inputCls} w-20`} inputMode="decimal" value={x[0]} placeholder="以上" onChange={(e) => setAgeRatio(ageRatio.map((y, j) => j === i ? [e.target.value, y[1]] : y))} />
              <span className="text-sm">年 →</span>
              <input className={`${inputCls} w-20`} inputMode="decimal" value={x[1]} onChange={(e) => setAgeRatio(ageRatio.map((y, j) => j === i ? [y[0], e.target.value] : y))} />
            </div>
          ))}
          <button disabled={pending} className={btnCls} onClick={() => run(() => saveHouseSettingAction("ageRatio", ageRatio.map((x) => [x[0] === "" ? null : x[0], x[1]])), "已更新屋齡倍率")}>儲存</button>
          <button disabled={pending} className={`${btnCls} ml-2`} onClick={() => reset("ageRatio", "屋齡倍率")}>回復內建</button>
        </div>
      </div>

      <h3 className="text-xs text-tx2 mt-6 mb-2">付款範本（占總價 %）</h3>
      <div className="tbl-wrap">
        <table className="w-full text-sm border-collapse min-w-[860px]">
          <thead><tr><th className="px-3 py-2 text-xs text-tx2 text-left">欄位</th>{HOUSE_CONDITIONS.map((c) => <th key={c} className="px-3 py-2 text-xs text-tx2 text-left">{c}</th>)}</tr></thead>
          <tbody>
            {PAY_FIELDS.map(([f, lb, hint]) => (
              <tr key={f}>
                <td className="px-3 py-2 border-t border-line align-top"><div className="font-semibold">{lb}</div>{hint && <div className="text-11 text-tx3">{hint}</div>}</td>
                {HOUSE_CONDITIONS.map((c) => (
                  <td key={c} className="px-3 py-2 border-t border-line align-top w-[120px]">
                    <input className={inputCls} inputMode="decimal" value={pay[c][f]} onChange={(e) => setPay({ ...pay, [c]: { ...pay[c], [f]: e.target.value } })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <button disabled={pending} className={btnCls} onClick={() => run(() => saveHouseSettingAction("pay", pay), "已更新付款範本")}>儲存範本</button>
        <button disabled={pending} className={`${btnCls} ml-2`} onClick={() => reset("pay", "付款範本")}>回復內建</button>
      </div>
    </div>
  );
}
