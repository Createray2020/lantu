"use client";

import { useMemo, useState, useTransition } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD, SELECT_SM } from "@/components/ui/Field";
import { saveHousePriceAction, resetHousePriceAction, importHousePricesCSVAction, type ActionResult } from "./actions";
import type { HousePriceRow } from "@/lib/houseParams";
import { TW_DISTRICTS, TW_CITIES } from "@/lib/twDistricts";
import { HOUSE_CONDITIONS } from "@/lib/houseParams.defaults";

// 房價參數的後台面板（2026/09/27）。
// 縣市→行政區篩選；每一列可就地改、可回復（縣市層回程式內建、行政區層直接消失）；
// 底下有 CSV 批次匯入——Ray 之後的爬蟲走同一支 upsert，這裡只是給人手貼的入口。

const inputCls = FIELD;
const btnCls = "rounded-lg border border-line2 px-3 py-1.5 text-sm text-tx2 hover:bg-panel3 disabled:opacity-40";
type Draft = { unitPrice: string; parkingPrice: string; source: string; basis: string };
const key = (r: { city: string; district: string; condition: string }) => `${r.city}|${r.district}|${r.condition}`;

export default function HousePricesBoard({ rows, basis }: { rows: HousePriceRow[]; basis: string }) {
  const [city, setCity] = useState<string>(TW_CITIES[0]);
  const [district, setDistrict] = useState<string>("");
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

  // 這個縣市底下：縣市層三列一定在（內建骨幹）；行政區列只列有資料的，加上正在挑的那個行政區（沒資料就給空列可填）。
  const shown = useMemo(() => {
    const mine = rows.filter((r) => r.city === city);
    const have = new Set(mine.map(key));
    const out = [...mine];
    if (district) for (const c of HOUSE_CONDITIONS) {
      const k = key({ city, district, condition: c });
      if (!have.has(k)) out.push({ city, district, condition: c, unitPrice: 0, parkingPrice: 0, source: "", basis: "", builtin: true });
    }
    return out.filter((r) => !district || r.district === "" || r.district === district)
      .sort((a, b) => (a.district === b.district ? HOUSE_CONDITIONS.indexOf(a.condition) - HOUSE_CONDITIONS.indexOf(b.condition) : a.district === "" ? -1 : b.district === "" ? 1 : a.district.localeCompare(b.district)));
  }, [rows, city, district]);

  const districtsWithData = useMemo(() => Array.from(new Set(rows.filter((r) => r.city === city && r.district).map((r) => r.district))), [rows, city]);

  return (
    <div className="rounded-xl border border-line bg-panel p-5 shadow-e1">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold border-l-[3px] border-brand2 pl-2">每坪均價・車位單價</h2>
        <span className="text-xs text-tx3">目前對外顯示的資料基準：{basis}</span>
      </div>
      <p className="text-xs text-tx3 mb-4 leading-relaxed">
        標「內建」的列是程式起手值（沒存進資料庫）；行政區列有資料才會出現在清單，選了行政區就能新增那一區的三種屋況。
        目前有行政區資料的：{districtsWithData.length ? districtsWithData.join("、") : "（還沒有，全部沿用縣市層）"}
      </p>
      {(msg || err) && <p className={`text-sm mb-3 ${err ? "text-danger" : "text-ok"}`}>{err ?? msg}</p>}

      <div className="flex gap-2 flex-wrap items-center mb-3">
        <select className={SELECT_SM} value={city} onChange={(e) => { setCity(e.target.value); setDistrict(""); }}>
          {TW_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={SELECT_SM} value={district} onChange={(e) => setDistrict(e.target.value)}>
          <option value="">（縣市層＋全部有資料的行政區）</option>
          {(TW_DISTRICTS[city] ?? []).map((d) => <option key={d} value={d}>{d}{districtsWithData.includes(d) ? " ●" : ""}</option>)}
        </select>
      </div>

      <div className="tbl-wrap">
        <table className="w-full text-sm border-collapse min-w-[880px] tbl-sticky">
          <thead>
            <tr>{["地區", "屋況", "目前 萬/坪", "新值 萬/坪", "車位 萬/位", "資料基準", "來源", ""].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold text-xs text-tx2 text-left whitespace-nowrap">{h}</th>))}</tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const k = key(r);
              const d = draft[k] ?? { unitPrice: String(r.unitPrice || ""), parkingPrice: String(r.parkingPrice || ""), source: r.source, basis: r.basis };
              const set = (patch: Partial<Draft>) => setDraft((p) => ({ ...p, [k]: { ...d, ...patch } }));
              const label = r.district ? `${r.city} ${r.district}` : `${r.city}（縣市層）`;
              return (
                <tr key={k}>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">
                    <div className="font-semibold text-tx">{label}</div>
                    {r.builtin && <span className="text-11 text-tx3">內建</span>}
                  </td>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">{r.condition}</td>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">
                    <span className="text-brand2 font-bold">{r.unitPrice ? r.unitPrice : "—"}</span>
                  </td>
                  <td className="px-3 py-2 border-t border-line align-top w-[110px]">
                    <input className={inputCls} inputMode="decimal" value={d.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 border-t border-line align-top w-[110px]">
                    <input className={inputCls} inputMode="decimal" value={d.parkingPrice} placeholder={r.district ? "空＝沿用縣市" : ""} onChange={(e) => set({ parkingPrice: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 border-t border-line align-top w-[110px]">
                    <input className={inputCls} value={d.basis} placeholder="2026-09" onChange={(e) => set({ basis: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 border-t border-line align-top">
                    <input className={inputCls} value={d.source} placeholder="實價登錄／房仲月報…" onChange={(e) => set({ source: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 border-t border-line align-top whitespace-nowrap">
                    <button disabled={pending} className={btnCls}
                      onClick={() => run(() => saveHousePriceAction({ city: r.city, district: r.district, condition: r.condition, unitPrice: d.unitPrice, parkingPrice: d.parkingPrice, source: d.source, basis: d.basis }), `已更新 ${label}・${r.condition}`)}>
                      儲存
                    </button>
                    {!r.builtin && (
                      <button disabled={pending} className={`${btnCls} ml-2`}
                        onClick={async () => {
                          if (!await confirmDialog(`${label}・${r.condition} ${r.district ? "刪掉這一列（回到沿用縣市層）" : "回復程式內建值"}？`)) return;
                          setDraft((p) => { const n = { ...p }; delete n[k]; return n; });
                          run(() => resetHousePriceAction(r.city, r.district, r.condition), `已回復 ${label}・${r.condition}`);
                        }}>
                        {r.district ? "刪除" : "回復內建"}
                      </button>
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
          每列：<code>縣市,行政區,屋況,每坪均價(萬),車位(萬),來源,基準年月</code>。行政區留空＝縣市層；同鍵覆蓋、不重複。「臺」會自動轉「台」。
        </p>
        <textarea className={`${inputCls} mt-2 min-h-[120px] font-mono text-xs`} value={csv} onChange={(e) => setCsv(e.target.value)}
          placeholder={"新北市,板橋區,新成屋,68,220,實價登錄,2026-09\n新北市,板橋區,預售,75,220,實價登錄,2026-09"} />
        <button disabled={pending || !csv.trim()} className={`${btnCls} mt-2`} onClick={() => run(() => importHousePricesCSVAction(csv), "匯入完成")}>匯入</button>
      </details>
    </div>
  );
}
