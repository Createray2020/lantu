"use client";

import { useMemo, useState, useTransition } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD, SELECT_SM } from "@/components/ui/Field";
import { saveCarPriceAction, resetCarPriceAction, importCarPricesCSVAction, type ActionResult } from "./actions";
import type { CarPriceRow } from "@/lib/carParams";
import { CAR_ORIGINS, CAR_SEGMENTS, CAR_POWERS, type CarBrand } from "@/lib/carParams.defaults";

// 車價參數的後台面板（2026/09/27）。
// 挑「等級層」或某個品牌；等級層 3×5×4 內建骨幹一定在，品牌列有資料才出現、沒資料就給空列可填（留空＝沿用等級層 × 品牌係數）。
// 底下有 CSV 批次匯入——Ray 之後的爬蟲走同一支 upsert。

const inputCls = FIELD;
const btnCls = "rounded-lg border border-line2 px-3 py-1.5 text-sm text-tx2 hover:bg-panel3 disabled:opacity-40";
type Draft = { price: string; source: string; basis: string };
const key = (r: { brand: string; segment: string; power: string }) => `${r.brand}|${r.segment}|${r.power}`;

export default function CarPricesBoard({ rows, basis, brands }: { rows: CarPriceRow[]; basis: string; brands: Record<string, CarBrand> }) {
  const brandNames = useMemo(() => Object.keys(brands).sort((a, b) => (brands[a].origin === brands[b].origin ? a.localeCompare(b) : CAR_ORIGINS.indexOf(brands[a].origin) - CAR_ORIGINS.indexOf(brands[b].origin))), [brands]);
  const [pick, setPick] = useState<string>(CAR_ORIGINS[0]);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setMsg(r.info ? `${okMsg}：${r.info}` : okMsg); setErr(null); }
      else { setErr(r.error); setMsg(null); }
    });

  const isOrigin = (CAR_ORIGINS as readonly string[]).includes(pick);
  const shown = useMemo(() => {
    const mine = rows.filter((r) => r.brand === pick);
    const have = new Set(mine.map(key));
    const out = [...mine];
    const origin = isOrigin ? pick : brands[pick]?.origin;
    for (const s of CAR_SEGMENTS) for (const p of CAR_POWERS) {
      const k = key({ brand: pick, segment: s, power: p });
      if (have.has(k)) continue;
      if (isOrigin) continue;   // 等級層的 0 元組合（國產跑車）刻意不列
      const base = rows.find((r) => r.brand === origin && r.segment === s && r.power === p);
      if (!base) continue;
      out.push({ brand: pick, segment: s, power: p, price: 0, source: "", basis: "", builtin: true });
    }
    return out.sort((a, b) => (a.segment === b.segment ? CAR_POWERS.indexOf(a.power) - CAR_POWERS.indexOf(b.power) : CAR_SEGMENTS.indexOf(a.segment) - CAR_SEGMENTS.indexOf(b.segment)));
  }, [rows, pick, isOrigin, brands]);
  const brandsWithData = useMemo(() => Array.from(new Set(rows.filter((r) => !(CAR_ORIGINS as readonly string[]).includes(r.brand)).map((r) => r.brand))), [rows]);
  const derived = (r: CarPriceRow) => {
    if (isOrigin) return null;
    const b = brands[pick]; if (!b) return null;
    const base = rows.find((x) => x.brand === b.origin && x.segment === r.segment && x.power === r.power);
    return base ? Math.round(base.price * b.priceFactor) : null;
  };

  return (
    <div className="rounded-xl border border-line bg-panel p-5 shadow-e1">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold border-l-[3px] border-brand2 pl-2">新車均價（萬／台）</h2>
        <span className="text-xs text-tx3">目前對外顯示的資料基準：{basis}</span>
      </div>
      <p className="text-xs text-tx3 mb-4 leading-relaxed">
        標「內建」的列是程式起手值（沒存進資料庫）。品牌列留空＝沿用「等級層均價 × 品牌價格係數」；填了就以品牌列為準。
        目前有品牌列資料的：{brandsWithData.length ? brandsWithData.join("、") : "（還沒有，全部由等級層推）"}
      </p>
      {(msg || err) && <p className={`text-sm mb-3 ${err ? "text-danger" : "text-ok"}`}>{err ?? msg}</p>}

      <div className="flex gap-2 flex-wrap items-center mb-3">
        <select className={SELECT_SM} value={pick} onChange={(e) => setPick(e.target.value)}>
          <optgroup label="等級層">{CAR_ORIGINS.map((o) => <option key={o} value={o}>{o}（等級層）</option>)}</optgroup>
          <optgroup label="品牌">{brandNames.map((b) => <option key={b} value={b}>{b}・{brands[b].origin}{brandsWithData.includes(b) ? " ●" : ""}</option>)}</optgroup>
        </select>
        {!isOrigin && brands[pick] && <span className="text-xs text-tx3">價格係數 {brands[pick].priceFactor}・保值 {brands[pick].retention}・保養 {brands[pick].maint}（在下面「品牌表」改）</span>}
      </div>

      <div className="tbl-wrap">
        <table className="w-full text-sm border-collapse min-w-[820px] tbl-sticky">
          <thead>
            <tr>{["車型", "動力", "目前 萬/台", "新值 萬/台", "資料基準", "來源", ""].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold text-xs text-tx2 text-left whitespace-nowrap">{h}</th>))}</tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const k = key(r);
              const d = draft[k] ?? { price: String(r.price || ""), source: r.source, basis: r.basis };
              const set = (patch: Partial<Draft>) => setDraft((p) => ({ ...p, [k]: { ...d, ...patch } }));
              const dv = derived(r);
              return (
                <tr key={k}>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap"><div className="font-semibold text-tx">{r.segment}</div>{r.builtin && <span className="text-11 text-tx3">內建</span>}</td>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">{r.power}</td>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">
                    <span className="text-brand2 font-bold">{r.price ? r.price : (dv != null ? `≈${dv}` : "—")}</span>
                    {!r.price && dv != null && <div className="text-11 text-tx3">由等級層推</div>}
                  </td>
                  <td className="px-3 py-2 border-t border-line align-top w-[110px]"><input className={inputCls} inputMode="decimal" value={d.price} placeholder={dv != null ? String(dv) : ""} onChange={(e) => set({ price: e.target.value })} /></td>
                  <td className="px-3 py-2 border-t border-line align-top w-[110px]"><input className={inputCls} value={d.basis} placeholder="2026-09" onChange={(e) => set({ basis: e.target.value })} /></td>
                  <td className="px-3 py-2 border-t border-line align-top"><input className={inputCls} value={d.source} placeholder="車廠牌價／中古車網…" onChange={(e) => set({ source: e.target.value })} /></td>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">
                    <button disabled={pending} className={btnCls}
                      onClick={() => run(() => saveCarPriceAction({ brand: r.brand, segment: r.segment, power: r.power, price: d.price, source: d.source, basis: d.basis }), `已更新 ${r.brand}・${r.segment}・${r.power}`)}>儲存</button>
                    {!r.builtin && (
                      <button disabled={pending} className={`${btnCls} ml-2`}
                        onClick={async () => {
                          if (!await confirmDialog(`${r.brand}・${r.segment}・${r.power} ${isOrigin ? "回復程式內建值" : "刪掉這一列（回到由等級層推）"}？`)) return;
                          setDraft((p) => { const n = { ...p }; delete n[k]; return n; });
                          run(() => resetCarPriceAction(r.brand, r.segment, r.power), `已回復 ${r.brand}・${r.segment}・${r.power}`);
                        }}>{isOrigin ? "回復內建" : "刪除"}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-5">
        <summary className="text-sm text-tx2 cursor-pointer">批次匯入（CSV／TSV，爬蟲也走同一支 upsert）</summary>
        <p className="text-xs text-tx3 mt-2 leading-relaxed">
          每列：<code>品牌,車型,動力,均價(萬),來源,基準年月</code>。品牌要先在品牌表裡；填等級名（國產／進口／豪華）＝等級層。同鍵覆蓋、不重複。
        </p>
        <textarea className={`${inputCls} mt-2 min-h-[120px] font-mono text-xs`} value={csv} onChange={(e) => setCsv(e.target.value)}
          placeholder={"Toyota,轎車,汽油,82,車廠牌價,2026-09\nToyota,休旅SUV,油電,118,車廠牌價,2026-09"} />
        <button disabled={pending || !csv.trim()} className={`${btnCls} mt-2`} onClick={() => run(() => importCarPricesCSVAction(csv), "匯入完成")}>匯入</button>
      </details>
    </div>
  );
}
