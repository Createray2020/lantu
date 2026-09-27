"use client";

import { useState, useTransition } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD, SELECT_SM } from "@/components/ui/Field";
import { saveCarSettingAction, resetCarSettingAction, type ActionResult } from "./actions";
import type { CarPayload, CarSettingKey } from "@/lib/carParams";
import { CAR_ORIGINS, CAR_SEGMENTS, CAR_MODES, type CarPayTemplate } from "@/lib/carParams.defaults";

// 品牌表／保值曲線／持有成本參數／四種取得方式範本。範本是全平台預設；每一筆購車目標可以自己覆寫。
type Settings = CarPayload["settings"];
const inputCls = FIELD;
const btnCls = "rounded-lg border border-line2 px-3 py-1.5 text-sm text-tx2 hover:bg-panel3 disabled:opacity-40";
const PAY_FIELDS: [keyof CarPayTemplate, string, string][] = [
  ["fee", "領牌雜費 %", "規費、當年稅費按比例、代辦；占車價"],
  ["loanRatio", "貸款成數起手 %", "全款＝0"],
  ["loanYears", "貸款年期起手", ""],
  ["loanRate", "利率起手 %", "原廠零利率通常沒折扣；銀行有利率但有折扣"],
  ["balloon", "殘值型期末尾款 %", "占車價；到期一次付、再貸或還車"],
  ["rentRate", "租賃月租 %（車價／月）", "含稅、保險、保養"],
  ["rentYears", "租期（年）", ""],
  ["buyout", "期末買斷 %", "占車價；0＝歸還不買"],
];
const COST_FIELDS: [string, string, string][] = [
  ["evTaxFreeUntil", "電動車免徵到（年，含）", "牌照稅／燃料費落日；過了依馬力課牌照稅"],
  ["fuelPrice", "汽油 元/L", ""], ["dieselPrice", "柴油 元/L", ""], ["elecPrice", "電 元/度", "家用充電"],
  ["kmPerYear", "年里程起手 km", "卡上沒填年里程時用"],
  ["dieselKmRatio", "柴油油耗倍率", "相對同車型汽油 km/L"], ["hybridKmRatio", "油電油耗倍率", ""], ["evKwhPerKm", "純電 度/km", ""],
  ["insBase", "強制險＋第三人 元/年", ""], ["parkingMonthly", "停車位月租起手", "沒有自有車位時"], ["misc", "驗車/ETC/輪胎雜支 元/年", ""],
  ["noCarPerKm", "不買車對照 元/km", "共享／計程車／大眾運輸平均"],
];
type Curve = [string, string][];
const toCurve = (c: [number | null, number][]): Curve => c.map((x) => [x[0] == null ? "" : String(x[0]), String(x[1])]);
const fromCurve = (c: Curve) => c.map((x) => [x[0] === "" ? null : x[0], x[1]]);
type BrandRow = { name: string; origin: string; priceFactor: string; retention: string; maint: string };

export default function CarSettingsBoard({ settings }: { settings: Settings }) {
  const [brands, setBrands] = useState<BrandRow[]>(Object.entries(settings.brands).map(([name, b]) => ({ name, origin: b.origin, priceFactor: String(b.priceFactor), retention: String(b.retention), maint: String(b.maint) })));
  const [retention, setRetention] = useState<Curve>(toCurve(settings.retention));
  const [bodyRate, setBodyRate] = useState<Curve>(toCurve(settings.cost.bodyRate));
  const [maintAge, setMaintAge] = useState<Curve>(toCurve(settings.cost.maintAgeRatio));
  const [cost, setCost] = useState<Record<string, string>>(Object.fromEntries(COST_FIELDS.map(([k]) => [k, String((settings.cost as unknown as Record<string, unknown>)[k] ?? "")])));
  const [kmPerL, setKmPerL] = useState<Record<string, string>>(Object.fromEntries(CAR_SEGMENTS.map((s) => [s, String(settings.cost.kmPerL[s] ?? "")])));
  const [maintBase, setMaintBase] = useState<Record<string, string>>(Object.fromEntries(CAR_ORIGINS.map((o) => [o, String(settings.cost.maintBase[o] ?? "")])));
  const [rule, setRule] = useState({ downPct: String(settings.cost.rule.downPct), loanYearsMax: String(settings.cost.rule.loanYearsMax), monthlyPct: String(settings.cost.rule.monthlyPct) });
  const [pay, setPay] = useState<Record<string, Record<string, string>>>(Object.fromEntries(CAR_MODES.map((m) => [m, Object.fromEntries(PAY_FIELDS.map(([f]) => [f, String(settings.pay[m]?.[f] ?? "")]))])));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, okMsg: string) =>
    start(async () => { const r = await fn(); if (r.ok) { setMsg(okMsg); setErr(null); } else { setErr(r.error); setMsg(null); } });
  const reset = async (key: CarSettingKey, label: string) => {
    if (!await confirmDialog(`「${label}」回復程式內建值？`)) return;
    run(() => resetCarSettingAction(key), `已回復「${label}」`);
  };
  const curveRows = (c: Curve, set: (c: Curve) => void, unit: string) => (
    <>
      {c.map((x, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <span className="text-sm">≤</span>
          <input className={`${inputCls} w-20`} inputMode="decimal" value={x[0]} placeholder="以上" onChange={(e) => set(c.map((y, j) => j === i ? [e.target.value, y[1]] : y))} />
          <span className="text-sm">年 →</span>
          <input className={`${inputCls} w-20`} inputMode="decimal" value={x[1]} onChange={(e) => set(c.map((y, j) => j === i ? [y[0], e.target.value] : y))} />
          <span className="text-xs text-tx3">{unit}</span>
          <button className="text-xs text-tx3" onClick={() => set(c.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className={`${btnCls} mb-2`} onClick={() => set([...c.slice(0, -1), [c.length ? c[c.length - 1][0] : "", ""], c.length ? c[c.length - 1] : ["", "1"]])}>＋ 一段</button>
    </>
  );

  return (
    <div className="rounded-xl border border-line bg-panel p-5 mt-6 shadow-e1">
      <h2 className="text-sm font-bold border-l-[3px] border-brand2 pl-2 mb-1">品牌表・保值曲線・持有成本・取得方式範本</h2>
      <p className="text-xs text-tx3 mb-4 leading-relaxed">估值＝品牌列均價，沒有就 等級層均價 × 品牌價格係數；中古再 × 保值曲線(車齡) × 品牌保值係數（封頂 0.95）。養車成本依規格推：稅（排氣量／馬力）、油電（年里程 × 油耗 × 油價）、保險（基本 ＋ 車價 × 車體險率）、保養（等級起手 × 品牌係數 × 車齡倍率）、停車、雜支。</p>
      {(msg || err) && <p className={`text-sm mb-3 ${err ? "text-danger" : "text-ok"}`}>{err ?? msg}</p>}

      <h3 className="text-xs text-tx2 mb-2">品牌表（Ray：品牌落差很大——價格係數相對等級層、保值係數乘在曲線上、保養係數乘在等級起手上）</h3>
      <div className="tbl-wrap">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead><tr>{["品牌", "等級", "價格係數", "保值係數", "保養係數", ""].map((h) => <th key={h} className="px-3 py-2 text-xs text-tx2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {brands.map((b, i) => {
              const set = (patch: Partial<BrandRow>) => setBrands(brands.map((x, j) => j === i ? { ...x, ...patch } : x));
              return (
                <tr key={i}>
                  <td className="px-3 py-1 border-t border-line"><input className={inputCls} value={b.name} onChange={(e) => set({ name: e.target.value })} /></td>
                  <td className="px-3 py-1 border-t border-line"><select className={SELECT_SM} value={b.origin} onChange={(e) => set({ origin: e.target.value })}>{CAR_ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                  <td className="px-3 py-1 border-t border-line w-[100px]"><input className={inputCls} inputMode="decimal" value={b.priceFactor} onChange={(e) => set({ priceFactor: e.target.value })} /></td>
                  <td className="px-3 py-1 border-t border-line w-[100px]"><input className={inputCls} inputMode="decimal" value={b.retention} onChange={(e) => set({ retention: e.target.value })} /></td>
                  <td className="px-3 py-1 border-t border-line w-[100px]"><input className={inputCls} inputMode="decimal" value={b.maint} onChange={(e) => set({ maint: e.target.value })} /></td>
                  <td className="px-3 py-1 border-t border-line"><button className="text-xs text-tx3" onClick={() => setBrands(brands.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex gap-2 flex-wrap">
        <button className={btnCls} onClick={() => setBrands([...brands, { name: "", origin: "國產", priceFactor: "1", retention: "1", maint: "1" }])}>＋ 新增品牌</button>
        <button disabled={pending} className={btnCls} onClick={() => run(() => saveCarSettingAction("brands", Object.fromEntries(brands.filter((b) => b.name.trim()).map((b) => [b.name.trim(), { origin: b.origin, priceFactor: b.priceFactor, retention: b.retention, maint: b.maint }]))), "已更新品牌表")}>儲存品牌表</button>
        <button disabled={pending} className={btnCls} onClick={() => reset("brands", "品牌表")}>回復內建</button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 mt-6">
        <div>
          <h3 className="text-xs text-tx2 mb-2">車齡保值曲線（車齡 ≤ 上限 → 相對新車價；最後一段留空＝以上）</h3>
          {curveRows(retention, setRetention, "")}
          <button disabled={pending} className={btnCls} onClick={() => run(() => saveCarSettingAction("retention", fromCurve(retention)), "已更新保值曲線")}>儲存</button>
          <button disabled={pending} className={`${btnCls} ml-2`} onClick={() => reset("retention", "保值曲線")}>回復內建</button>
        </div>
        <div>
          <h3 className="text-xs text-tx2 mb-2">20-4-10 負擔性規則</h3>
          {([["downPct", "頭期至少 % 車價"], ["loanYearsMax", "貸款不超過 年"], ["monthlyPct", "月車支出不超過 % 月收入"]] as const).map(([k, lb]) => (
            <div key={k} className="flex items-center gap-2 mb-2"><span className="w-44 text-sm">{lb}</span><input className={`${inputCls} w-24`} inputMode="decimal" value={rule[k]} onChange={(e) => setRule({ ...rule, [k]: e.target.value })} /></div>
          ))}
        </div>
      </div>

      <h3 className="text-xs text-tx2 mt-6 mb-2">持有成本參數</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {COST_FIELDS.map(([k, lb, hint]) => (
          <div key={k}><div className="text-sm">{lb}</div>{hint && <div className="text-11 text-tx3">{hint}</div>}<input className={`${inputCls} mt-1`} inputMode="decimal" value={cost[k]} onChange={(e) => setCost({ ...cost, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2 mt-4">
        <div>
          <h3 className="text-xs text-tx2 mb-2">汽油車油耗起手 km/L（依車型）</h3>
          {CAR_SEGMENTS.map((s) => <div key={s} className="flex items-center gap-2 mb-2"><span className="w-28 text-sm">{s}</span><input className={`${inputCls} w-24`} inputMode="decimal" value={kmPerL[s]} onChange={(e) => setKmPerL({ ...kmPerL, [s]: e.target.value })} /></div>)}
          <h3 className="text-xs text-tx2 mb-2 mt-4">保養／維修起手 元/年（依等級）</h3>
          {CAR_ORIGINS.map((o) => <div key={o} className="flex items-center gap-2 mb-2"><span className="w-28 text-sm">{o}</span><input className={`${inputCls} w-24`} inputMode="decimal" value={maintBase[o]} onChange={(e) => setMaintBase({ ...maintBase, [o]: e.target.value })} /></div>)}
        </div>
        <div>
          <h3 className="text-xs text-tx2 mb-2">車體險率（車齡 ≤ 上限 → 車價 %／年；最後一段留空＝以上，0＝不保車體）</h3>
          {curveRows(bodyRate, setBodyRate, "%")}
          <h3 className="text-xs text-tx2 mb-2 mt-4">保養隨車齡倍率</h3>
          {curveRows(maintAge, setMaintAge, "×")}
        </div>
      </div>
      <div className="mt-3">
        <button disabled={pending} className={btnCls} onClick={() => run(() => saveCarSettingAction("cost", { ...cost, kmPerL, maintBase, rule, bodyRate: fromCurve(bodyRate), maintAgeRatio: fromCurve(maintAge) }), "已更新持有成本參數")}>儲存持有成本參數</button>
        <button disabled={pending} className={`${btnCls} ml-2`} onClick={() => reset("cost", "持有成本參數")}>回復內建</button>
      </div>

      <h3 className="text-xs text-tx2 mt-6 mb-2">四種取得方式範本（占車價 %）</h3>
      <div className="tbl-wrap">
        <table className="w-full text-sm border-collapse min-w-[860px]">
          <thead><tr><th className="px-3 py-2 text-xs text-tx2 text-left">欄位</th>{CAR_MODES.map((m) => <th key={m} className="px-3 py-2 text-xs text-tx2 text-left">{m}</th>)}</tr></thead>
          <tbody>
            {PAY_FIELDS.map(([f, lb, hint]) => (
              <tr key={f}>
                <td className="px-3 py-2 border-t border-line align-top"><div className="font-semibold">{lb}</div>{hint && <div className="text-11 text-tx3">{hint}</div>}</td>
                {CAR_MODES.map((m) => (
                  <td key={m} className="px-3 py-2 border-t border-line align-top w-[120px]"><input className={inputCls} inputMode="decimal" value={pay[m][f]} onChange={(e) => setPay({ ...pay, [m]: { ...pay[m], [f]: e.target.value } })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <button disabled={pending} className={btnCls} onClick={() => run(() => saveCarSettingAction("pay", pay), "已更新取得方式範本")}>儲存範本</button>
        <button disabled={pending} className={`${btnCls} ml-2`} onClick={() => reset("pay", "取得方式範本")}>回復內建</button>
      </div>
    </div>
  );
}
