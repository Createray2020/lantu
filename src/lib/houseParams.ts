// 購屋模組的伺服器端讀寫（2026/09/27）。與 birthCosts 同一個模式：unstable_cache + tag，後台一存 updateTag。
//
// 兩張表：
//   house_price_params  縣市×行政區×屋況 的每坪均價／車位單價（Ray 之後用爬蟲 upsert）
//   house_params        屋型倍率／屋齡倍率／付款範本（key/value JSON）
// 查價順序（前後端同一套，見 lantu-app.html 的 housePriceLookup）：行政區列 → 縣市列 → 程式端 fallback。
import { unstable_cache, updateTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { housePriceParams, houseParams } from "@/Shared/db/schema";
import { TW_DISTRICTS, TW_CITIES } from "./twDistricts";
import {
  HOUSE_CITY_BASE, HOUSE_COND_RATIO, HOUSE_CONDITIONS, HOUSE_PRICE_BASIS,
  HOUSE_TYPE_RATIO_DEFAULT, HOUSE_AGE_RATIO_DEFAULT, HOUSE_PAY_DEFAULT,
  type HouseCondition, type HousePayTemplate,
} from "./houseParams.defaults";

export const HOUSE_TAG = "house-params";

export type HousePriceRow = {
  city: string; district: string; condition: HouseCondition;
  unitPrice: number; parkingPrice: number; source: string; basis: string;
  builtin?: boolean;   // true＝程式端起手值（DB 沒這一列）
};

/** 「臺」→「台」、去空白；爬蟲餵進來的名稱先過這裡。 */
export function normCity(s: string): string {
  return String(s ?? "").trim().replace(/臺/g, "台");
}
export function isCondition(s: unknown): s is HouseCondition {
  return (HOUSE_CONDITIONS as readonly string[]).includes(String(s));
}

/** 程式端起手值：22 縣市 × 3 屋況（行政區留空，fallback 到縣市）。 */
export function defaultHousePrices(): HousePriceRow[] {
  const out: HousePriceRow[] = [];
  for (const city of TW_CITIES) {
    const [base, parking] = HOUSE_CITY_BASE[city] ?? [20, 80];
    for (const cond of HOUSE_CONDITIONS) {
      out.push({
        city, district: "", condition: cond,
        unitPrice: Math.round(base * HOUSE_COND_RATIO[cond] * 10) / 10,
        parkingPrice: parking, source: "起手值（程式內建）", basis: HOUSE_PRICE_BASIS, builtin: true,
      });
    }
  }
  return out;
}

export async function listHousePrices(): Promise<HousePriceRow[]> {
  const rows = await db.select().from(housePriceParams)
    .orderBy(asc(housePriceParams.city), asc(housePriceParams.district), asc(housePriceParams.condition));
  return rows.filter((r) => isCondition(r.condition)).map((r) => ({
    city: r.city, district: r.district, condition: r.condition as HouseCondition,
    unitPrice: r.unitPrice, parkingPrice: r.parkingPrice, source: r.source ?? "", basis: r.basis ?? "",
  }));
}

/** 後台表格用：內建縣市層為骨幹，DB 有的列覆蓋上去、DB 多出來的行政區列附加。 */
export async function housePriceRows(): Promise<HousePriceRow[]> {
  let rows: HousePriceRow[] = [];
  try { rows = await listHousePrices(); } catch { rows = []; }
  const key = (r: HousePriceRow) => `${r.city}|${r.district}|${r.condition}`;
  const byKey = new Map(rows.map((r) => [key(r), r]));
  const out = defaultHousePrices().map((d) => byKey.get(key(d)) ?? d);
  const have = new Set(out.map(key));
  for (const r of rows) if (!have.has(key(r))) out.push(r);
  return out;
}

export type HouseSettings = {
  typeRatio: Record<string, number>;
  ageRatio: [number, number][];
  pay: Record<HouseCondition, HousePayTemplate>;
};
export function defaultHouseSettings(): HouseSettings {
  return {
    typeRatio: { ...HOUSE_TYPE_RATIO_DEFAULT },
    ageRatio: HOUSE_AGE_RATIO_DEFAULT.map((x) => [x[0], x[1]] as [number, number]),
    pay: JSON.parse(JSON.stringify(HOUSE_PAY_DEFAULT)),
  };
}
const SETTING_KEYS = ["typeRatio", "ageRatio", "pay"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

export async function houseSettings(): Promise<HouseSettings> {
  const s = defaultHouseSettings();
  let rows: { key: string; value: unknown }[] = [];
  try { rows = await db.select({ key: houseParams.key, value: houseParams.value }).from(houseParams); } catch { rows = []; }
  for (const r of rows) {
    if (r.key === "typeRatio" && r.value && typeof r.value === "object") s.typeRatio = { ...s.typeRatio, ...(r.value as Record<string, number>) };
    if (r.key === "ageRatio" && Array.isArray(r.value)) {
      // JSON 存不了 Infinity：最後一段的上限存成 null，讀回來再換成 Infinity。
      s.ageRatio = (r.value as [number | null, number][]).map((x) => [x[0] == null ? Infinity : Number(x[0]), Number(x[1])]);
    }
    if (r.key === "pay" && r.value && typeof r.value === "object") {
      const v = r.value as Partial<Record<HouseCondition, Partial<HousePayTemplate>>>;
      for (const c of HOUSE_CONDITIONS) if (v[c]) s.pay[c] = { ...s.pay[c], ...v[c] };
    }
  }
  return s;
}

/** 給 iframe app 的 payload（搭 /api/finance-categories 同一班車）。 */
export const getHousePayload = unstable_cache(
  async (): Promise<{ prices: HousePriceRow[]; settings: { typeRatio: Record<string, number>; ageRatio: [number | null, number][]; pay: HouseSettings["pay"] }; basis: string }> => {
    const [prices, settings] = await Promise.all([housePriceRows(), houseSettings()]);
    let basis = HOUSE_PRICE_BASIS;
    for (const r of prices) if (r.basis && r.basis > basis) basis = r.basis;
    return {
      prices: prices.map((r) => ({ city: r.city, district: r.district, condition: r.condition, unitPrice: r.unitPrice, parkingPrice: r.parkingPrice, source: r.source, basis: r.basis, builtin: !!r.builtin })),
      settings: { typeRatio: settings.typeRatio, ageRatio: settings.ageRatio.map((x) => [Number.isFinite(x[0]) ? x[0] : null, x[1]]), pay: settings.pay },
      basis,
    };
  },
  ["lantu-house-params"],
  { tags: [HOUSE_TAG] },
);

// ---------- 寫入 ----------
const num = (v: unknown, field: string): number => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(x) || x < 0) throw new Error(`invalid-${field}`);
  return x;
};

export type HousePriceInput = {
  city: string; district?: string; condition: string;
  unitPrice: number | string; parkingPrice?: number | string; source?: string; basis?: string;
};
function validPrice(input: HousePriceInput) {
  const city = normCity(input.city);
  if (!TW_DISTRICTS[city]) throw new Error("unknown-city");
  const district = normCity(input.district ?? "");
  if (district && !TW_DISTRICTS[city].includes(district)) throw new Error("unknown-district");
  if (!isCondition(input.condition)) throw new Error("invalid-condition");
  return {
    city, district, condition: input.condition,
    unitPrice: num(input.unitPrice, "unit-price"),
    parkingPrice: input.parkingPrice == null || input.parkingPrice === "" ? 0 : num(input.parkingPrice, "parking-price"),
    source: (input.source ?? "").trim() || null,
    basis: (input.basis ?? "").trim() || null,
  };
}

/** 單筆存（後台）。 */
export async function saveHousePrice(input: HousePriceInput): Promise<void> {
  const v = validPrice(input);
  await db.insert(housePriceParams).values({ ...v, updatedAt: new Date() }).onConflictDoUpdate({
    target: [housePriceParams.city, housePriceParams.district, housePriceParams.condition],
    set: { unitPrice: v.unitPrice, parkingPrice: v.parkingPrice, source: v.source, basis: v.basis, updatedAt: new Date() },
  });
  updateTag(HOUSE_TAG);
}

/** 批次 upsert（給 Ray 之後的爬蟲）：同鍵覆蓋；回傳寫入筆數與被擋掉的列（不認得的縣市／行政區、屋況錯）。 */
export async function upsertHousePrices(inputs: HousePriceInput[]): Promise<{ written: number; rejected: { input: HousePriceInput; reason: string }[] }> {
  const rejected: { input: HousePriceInput; reason: string }[] = [];
  const ok: ReturnType<typeof validPrice>[] = [];
  for (const i of inputs) {
    try { ok.push(validPrice(i)); } catch (e) { rejected.push({ input: i, reason: e instanceof Error ? e.message : String(e) }); }
  }
  for (const v of ok) {
    await db.insert(housePriceParams).values({ ...v, updatedAt: new Date() }).onConflictDoUpdate({
      target: [housePriceParams.city, housePriceParams.district, housePriceParams.condition],
      set: { unitPrice: v.unitPrice, parkingPrice: v.parkingPrice, source: v.source, basis: v.basis, updatedAt: new Date() },
    });
  }
  if (ok.length) updateTag(HOUSE_TAG);
  return { written: ok.length, rejected };
}

/** 刪掉 DB 那一列＝回到起手值（縣市層）或消失（行政區層）。 */
export async function resetHousePrice(city: string, district: string, condition: string): Promise<void> {
  if (!isCondition(condition)) throw new Error("invalid-condition");
  await db.delete(housePriceParams).where(and(
    eq(housePriceParams.city, normCity(city)), eq(housePriceParams.district, normCity(district)), eq(housePriceParams.condition, condition),
  ));
  updateTag(HOUSE_TAG);
}

export async function saveHouseSetting(key: SettingKey, value: unknown): Promise<void> {
  if (!SETTING_KEYS.includes(key)) throw new Error("unknown-key");
  let v: unknown = value;
  if (key === "typeRatio") {
    const o: Record<string, number> = {};
    for (const [k, x] of Object.entries((value ?? {}) as Record<string, unknown>)) o[k] = num(x, "ratio");
    v = o;
  } else if (key === "ageRatio") {
    if (!Array.isArray(value) || !value.length) throw new Error("invalid-value");
    v = value.map((x) => [x[0] == null || x[0] === "" ? null : num(x[0], "age"), num(x[1], "ratio")]);
  } else if (key === "pay") {
    const out: Partial<Record<HouseCondition, HousePayTemplate>> = {};
    for (const c of HOUSE_CONDITIONS) {
      const src = ((value ?? {}) as Record<string, Partial<HousePayTemplate>>)[c];
      if (!src) continue;
      const t = { ...HOUSE_PAY_DEFAULT[c] };
      for (const f of Object.keys(t) as (keyof HousePayTemplate)[]) if (src[f] != null && src[f] !== ("" as unknown)) t[f] = num(src[f], f);
      out[c] = t;
    }
    v = out;
  }
  await db.insert(houseParams).values({ key, value: v as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: houseParams.key, set: { value: v as object, updatedAt: new Date() } });
  updateTag(HOUSE_TAG);
}
export async function resetHouseSetting(key: SettingKey): Promise<void> {
  await db.delete(houseParams).where(eq(houseParams.key, key));
  updateTag(HOUSE_TAG);
}

// ---------- 純函式：估值（前後端同一套；lantu-app.html 逐字對拍） ----------
export type HouseSpec = { city: string; district?: string; condition: string; type?: string; rooms?: number; ping: number; parking?: number; age?: number };
export function housePriceLookup(prices: HousePriceRow[], city: string, district: string, condition: string): { row: HousePriceRow | null; level: "district" | "city" | "none" } {
  let cityRow: HousePriceRow | null = null;
  for (const r of prices) {
    if (r.city !== city || r.condition !== condition) continue;
    if (r.district === district && district) return { row: r, level: "district" };
    if (r.district === "") cityRow = r;
  }
  return cityRow ? { row: cityRow, level: "city" } : { row: null, level: "none" };
}
export function houseAgeRatio(ageRatio: [number, number][], age: number, condition: string): number {
  if (condition !== "中古") return 1;
  for (const [cap, r] of ageRatio) if (age <= cap) return r;
  return ageRatio.length ? ageRatio[ageRatio.length - 1][1] : 1;
}
/** 估值（元）＝均價×屋型倍率×屋齡倍率×坪數＋車位單價×車位數；均價單位是萬。 */
export function houseEstimate(prices: HousePriceRow[], settings: HouseSettings, spec: HouseSpec): { total: number; unit: number; level: string; parts: { price: number; parking: number } } {
  const { row, level } = housePriceLookup(prices, spec.city, spec.district ?? "", spec.condition);
  if (!row) return { total: 0, unit: 0, level, parts: { price: 0, parking: 0 } };
  const unit = row.unitPrice * (settings.typeRatio[spec.type ?? "電梯大樓"] ?? 1) * houseAgeRatio(settings.ageRatio, Number(spec.age ?? 0), spec.condition);
  const price = Math.round(unit * Number(spec.ping ?? 0) * 10000);
  // 行政區列沒填車位價時沿用縣市層
  let parkUnit = row.parkingPrice;
  if (!(parkUnit > 0)) { const c = housePriceLookup(prices, spec.city, "", spec.condition).row; parkUnit = c ? c.parkingPrice : 0; }
  const parking = Math.round(parkUnit * Number(spec.parking ?? 0) * 10000);
  return { total: price + parking, unit: Math.round(unit * 10) / 10, level, parts: { price, parking } };
}
