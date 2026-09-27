// 購車模組的伺服器端讀寫（2026/09/27）。與 houseParams 同一個模式：unstable_cache + tag，後台一存 updateTag。
//
// 兩張表：
//   car_price_params  品牌×車型×動力 的新車均價（萬／台；brand 也可以是等級名＝等級層）
//   car_params        brands（品牌表）／retention（保值曲線）／cost（持有成本參數）／pay（四種取得方式範本）
// 查價順序（前後端同一套，見 lantu-app.html 的 carPriceLookup）：品牌列 → 等級層列 × 品牌 priceFactor → 程式端 fallback。
import { unstable_cache, updateTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { carPriceParams, carParams } from "@/Shared/db/schema";
import {
  CAR_PRICE_BASIS, CAR_ORIGINS, CAR_SEGMENTS, CAR_POWERS, CAR_MODES, CAR_BRANDS_DEFAULT, CAR_ORIGIN_BASE, CAR_POWER_RATIO,
  CAR_RETENTION_DEFAULT, CAR_COST_DEFAULT, CAR_PAY_DEFAULT, CAR_LICENSE, CAR_FUEL, CAR_EV_LICENSE,
  type CarOrigin, type CarSegment, type CarPower, type CarMode, type CarBrand, type CarCostParams, type CarPayTemplate,
} from "./carParams.defaults";

export const CAR_TAG = "car-params";

export type CarPriceRow = {
  brand: string; segment: CarSegment; power: CarPower;
  price: number; source: string; basis: string;
  builtin?: boolean;   // true＝程式端起手值（DB 沒這一列）
};

export function isOrigin(s: unknown): s is CarOrigin { return (CAR_ORIGINS as readonly string[]).includes(String(s)); }
export function isSegment(s: unknown): s is CarSegment { return (CAR_SEGMENTS as readonly string[]).includes(String(s)); }
export function isPower(s: unknown): s is CarPower { return (CAR_POWERS as readonly string[]).includes(String(s)); }
export function isMode(s: unknown): s is CarMode { return (CAR_MODES as readonly string[]).includes(String(s)); }
export function normBrand(s: string): string { return String(s ?? "").trim(); }

/** 程式端起手值：3 等級 × 5 車型 × 4 動力（等級層；品牌由 priceFactor 推）。0 元的組合（國產跑車…）不列。 */
export function defaultCarPrices(): CarPriceRow[] {
  const out: CarPriceRow[] = [];
  for (const o of CAR_ORIGINS) for (const s of CAR_SEGMENTS) {
    const base = CAR_ORIGIN_BASE[o][s];
    if (!(base > 0)) continue;
    for (const p of CAR_POWERS) out.push({ brand: o, segment: s, power: p, price: Math.round(base * CAR_POWER_RATIO[p]), source: "起手值（程式內建）", basis: CAR_PRICE_BASIS, builtin: true });
  }
  return out;
}

export async function listCarPrices(): Promise<CarPriceRow[]> {
  const rows = await db.select().from(carPriceParams).orderBy(asc(carPriceParams.brand), asc(carPriceParams.segment), asc(carPriceParams.power));
  return rows.filter((r) => isSegment(r.segment) && isPower(r.power)).map((r) => ({
    brand: r.brand, segment: r.segment as CarSegment, power: r.power as CarPower, price: r.price, source: r.source ?? "", basis: r.basis ?? "",
  }));
}
/** 後台表格用：內建等級層為骨幹，DB 有的列覆蓋上去、DB 多出來的品牌列附加。 */
export async function carPriceRows(): Promise<CarPriceRow[]> {
  let rows: CarPriceRow[] = [];
  try { rows = await listCarPrices(); } catch { rows = []; }
  const key = (r: CarPriceRow) => `${r.brand}|${r.segment}|${r.power}`;
  const byKey = new Map(rows.map((r) => [key(r), r]));
  const out = defaultCarPrices().map((d) => byKey.get(key(d)) ?? d);
  const have = new Set(out.map(key));
  for (const r of rows) if (!have.has(key(r))) out.push(r);
  return out;
}

export type CarSettings = {
  brands: Record<string, CarBrand>;
  retention: [number, number][];
  cost: CarCostParams;
  pay: Record<CarMode, CarPayTemplate>;
};
export function defaultCarSettings(): CarSettings {
  return {
    brands: JSON.parse(JSON.stringify(CAR_BRANDS_DEFAULT)),
    retention: CAR_RETENTION_DEFAULT.map((x) => [x[0], x[1]] as [number, number]),
    cost: JSON.parse(JSON.stringify(CAR_COST_DEFAULT)),
    pay: JSON.parse(JSON.stringify(CAR_PAY_DEFAULT)),
  };
}
const SETTING_KEYS = ["brands", "retention", "cost", "pay"] as const;
export type CarSettingKey = (typeof SETTING_KEYS)[number];

const inf = (v: unknown) => (v == null ? Infinity : Number(v));
export async function carSettings(): Promise<CarSettings> {
  const s = defaultCarSettings();
  let rows: { key: string; value: unknown }[] = [];
  try { rows = await db.select({ key: carParams.key, value: carParams.value }).from(carParams); } catch { rows = []; }
  for (const r of rows) {
    if (r.key === "brands" && r.value && typeof r.value === "object") {
      // 後台存的是整張品牌表（含新增的品牌）；DB 有＝以 DB 為準
      s.brands = {};
      for (const [b, v] of Object.entries(r.value as Record<string, Partial<CarBrand>>)) {
        if (!v || !isOrigin(v.origin)) continue;
        s.brands[b] = { origin: v.origin, priceFactor: Number(v.priceFactor ?? 1), retention: Number(v.retention ?? 1), maint: Number(v.maint ?? 1) };
      }
    }
    if (r.key === "retention" && Array.isArray(r.value)) s.retention = (r.value as [number | null, number][]).map((x) => [inf(x[0]), Number(x[1])]);
    if (r.key === "cost" && r.value && typeof r.value === "object") {
      const v = r.value as Partial<CarCostParams> & { bodyRate?: [number | null, number][]; maintAgeRatio?: [number | null, number][] };
      s.cost = { ...s.cost, ...v,
        kmPerL: { ...s.cost.kmPerL, ...(v.kmPerL ?? {}) }, maintBase: { ...s.cost.maintBase, ...(v.maintBase ?? {}) }, rule: { ...s.cost.rule, ...(v.rule ?? {}) },
        bodyRate: v.bodyRate ? v.bodyRate.map((x) => [inf(x[0]), Number(x[1])] as [number, number]) : s.cost.bodyRate,
        maintAgeRatio: v.maintAgeRatio ? v.maintAgeRatio.map((x) => [inf(x[0]), Number(x[1])] as [number, number]) : s.cost.maintAgeRatio,
      };
    }
    if (r.key === "pay" && r.value && typeof r.value === "object") {
      const v = r.value as Partial<Record<CarMode, Partial<CarPayTemplate>>>;
      for (const m of CAR_MODES) if (v[m]) s.pay[m] = { ...s.pay[m], ...v[m] };
    }
  }
  return s;
}

const nullInf = (x: [number, number]): [number | null, number] => [Number.isFinite(x[0]) ? x[0] : null, x[1]];
export type CarPayload = {
  prices: CarPriceRow[];
  settings: { brands: Record<string, CarBrand>; retention: [number | null, number][]; cost: Omit<CarCostParams, "bodyRate" | "maintAgeRatio"> & { bodyRate: [number | null, number][]; maintAgeRatio: [number | null, number][] }; pay: CarSettings["pay"] };
  basis: string;
};
/** 給 iframe app 的 payload（搭 /api/finance-categories 同一班車）。JSON 存不了 Infinity：曲線最後一段的上限存成 null。 */
export const getCarPayload = unstable_cache(
  async (): Promise<CarPayload> => {
    const [prices, settings] = await Promise.all([carPriceRows(), carSettings()]);
    let basis = CAR_PRICE_BASIS;
    for (const r of prices) if (r.basis && r.basis > basis) basis = r.basis;
    return {
      prices: prices.map((r) => ({ brand: r.brand, segment: r.segment, power: r.power, price: r.price, source: r.source, basis: r.basis, builtin: !!r.builtin })),
      settings: {
        brands: settings.brands, retention: settings.retention.map(nullInf),
        cost: { ...settings.cost, bodyRate: settings.cost.bodyRate.map(nullInf), maintAgeRatio: settings.cost.maintAgeRatio.map(nullInf) },
        pay: settings.pay,
      },
      basis,
    };
  },
  ["lantu-car-params"],
  { tags: [CAR_TAG] },
);

// ---------- 寫入 ----------
const num = (v: unknown, field: string): number => {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(x) || x < 0) throw new Error(`invalid-${field}`);
  return x;
};
export type CarPriceInput = { brand: string; segment: string; power: string; price: number | string; source?: string; basis?: string };
function validPrice(input: CarPriceInput, brands: Record<string, CarBrand>) {
  const brand = normBrand(input.brand);
  if (!brand) throw new Error("unknown-brand");
  if (!isOrigin(brand) && !brands[brand]) throw new Error("unknown-brand");
  if (!isSegment(input.segment)) throw new Error("invalid-segment");
  if (!isPower(input.power)) throw new Error("invalid-power");
  return { brand, segment: input.segment, power: input.power, price: num(input.price, "price"), source: (input.source ?? "").trim() || null, basis: (input.basis ?? "").trim() || null };
}
async function upsertOne(v: ReturnType<typeof validPrice>) {
  await db.insert(carPriceParams).values({ ...v, updatedAt: new Date() }).onConflictDoUpdate({
    target: [carPriceParams.brand, carPriceParams.segment, carPriceParams.power],
    set: { price: v.price, source: v.source, basis: v.basis, updatedAt: new Date() },
  });
}
export async function saveCarPrice(input: CarPriceInput): Promise<void> {
  const s = await carSettings();
  await upsertOne(validPrice(input, s.brands));
  updateTag(CAR_TAG);
}
/** 批次 upsert（給 Ray 之後的爬蟲）：同鍵覆蓋；回傳寫入筆數與被擋掉的列（品牌不在品牌表、車型／動力錯）。 */
export async function upsertCarPrices(inputs: CarPriceInput[]): Promise<{ written: number; rejected: { input: CarPriceInput; reason: string }[] }> {
  const s = await carSettings();
  const rejected: { input: CarPriceInput; reason: string }[] = [];
  const ok: ReturnType<typeof validPrice>[] = [];
  for (const i of inputs) {
    try { ok.push(validPrice(i, s.brands)); } catch (e) { rejected.push({ input: i, reason: e instanceof Error ? e.message : String(e) }); }
  }
  for (const v of ok) await upsertOne(v);
  if (ok.length) updateTag(CAR_TAG);
  return { written: ok.length, rejected };
}
export async function resetCarPrice(brand: string, segment: string, power: string): Promise<void> {
  await db.delete(carPriceParams).where(and(eq(carPriceParams.brand, normBrand(brand)), eq(carPriceParams.segment, segment), eq(carPriceParams.power, power)));
  updateTag(CAR_TAG);
}

const curve = (value: unknown, field: string) => {
  if (!Array.isArray(value) || !value.length) throw new Error("invalid-value");
  return value.map((x) => [x[0] == null || x[0] === "" ? null : num(x[0], field), num(x[1], "ratio")]);
};
export async function saveCarSetting(key: CarSettingKey, value: unknown): Promise<void> {
  if (!SETTING_KEYS.includes(key)) throw new Error("unknown-key");
  let v: unknown = value;
  if (key === "brands") {
    const out: Record<string, CarBrand> = {};
    for (const [b, x] of Object.entries((value ?? {}) as Record<string, Partial<CarBrand>>)) {
      const name = normBrand(b); if (!name || !x) continue;
      if (!isOrigin(x.origin)) throw new Error("invalid-origin");
      out[name] = { origin: x.origin, priceFactor: num(x.priceFactor, "ratio"), retention: num(x.retention, "ratio"), maint: num(x.maint, "ratio") };
    }
    if (!Object.keys(out).length) throw new Error("invalid-value");
    v = out;
  } else if (key === "retention") {
    v = curve(value, "age");
  } else if (key === "cost") {
    const src = (value ?? {}) as Record<string, unknown>;
    const d = CAR_COST_DEFAULT;
    const o: Record<string, unknown> = {};
    for (const k of ["evTaxFreeUntil", "fuelPrice", "dieselPrice", "elecPrice", "kmPerYear", "dieselKmRatio", "hybridKmRatio", "evKwhPerKm", "insBase", "parkingMonthly", "misc", "noCarPerKm"] as const) {
      if (src[k] != null && src[k] !== "") o[k] = num(src[k], k);
    }
    if (src.kmPerL && typeof src.kmPerL === "object") { const m: Record<string, number> = {}; for (const [s, x] of Object.entries(src.kmPerL as Record<string, unknown>)) if (isSegment(s) && x !== "" && x != null) m[s] = num(x, "kmPerL"); o.kmPerL = { ...d.kmPerL, ...m }; }
    if (src.maintBase && typeof src.maintBase === "object") { const m: Record<string, number> = {}; for (const [s, x] of Object.entries(src.maintBase as Record<string, unknown>)) if (isOrigin(s) && x !== "" && x != null) m[s] = num(x, "maint"); o.maintBase = { ...d.maintBase, ...m }; }
    if (src.rule && typeof src.rule === "object") { const r = src.rule as Record<string, unknown>; o.rule = { downPct: r.downPct != null && r.downPct !== "" ? num(r.downPct, "rule") : d.rule.downPct, loanYearsMax: r.loanYearsMax != null && r.loanYearsMax !== "" ? num(r.loanYearsMax, "rule") : d.rule.loanYearsMax, monthlyPct: r.monthlyPct != null && r.monthlyPct !== "" ? num(r.monthlyPct, "rule") : d.rule.monthlyPct }; }
    if (src.bodyRate) o.bodyRate = curve(src.bodyRate, "age");
    if (src.maintAgeRatio) o.maintAgeRatio = curve(src.maintAgeRatio, "age");
    v = o;
  } else if (key === "pay") {
    const out: Partial<Record<CarMode, CarPayTemplate>> = {};
    for (const m of CAR_MODES) {
      const src = ((value ?? {}) as Record<string, Partial<CarPayTemplate>>)[m];
      if (!src) continue;
      const t = { ...CAR_PAY_DEFAULT[m] };
      for (const f of Object.keys(t) as (keyof CarPayTemplate)[]) if (src[f] != null && src[f] !== ("" as unknown)) t[f] = num(src[f], f);
      out[m] = t;
    }
    v = out;
  }
  await db.insert(carParams).values({ key, value: v as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: carParams.key, set: { value: v as object, updatedAt: new Date() } });
  updateTag(CAR_TAG);
}
export async function resetCarSetting(key: CarSettingKey): Promise<void> {
  await db.delete(carParams).where(eq(carParams.key, key));
  updateTag(CAR_TAG);
}

// ---------- 純函式：估值與持有成本（前後端同一套；lantu-app.html 逐字對拍） ----------
export type CarSpec = { brand?: string; segment: string; power: string; condition?: string; cc?: number; hp?: number; age?: number; km?: number; seats?: number; ownParking?: boolean; kmPerYear?: number };
export function carBrandOf(brands: Record<string, CarBrand>, brand: string): CarBrand | null {
  if (brands[brand]) return brands[brand];
  if (isOrigin(brand)) return { origin: brand, priceFactor: 1, retention: 1, maint: 1 };
  return null;
}
export function carPriceLookup(prices: CarPriceRow[], brands: Record<string, CarBrand>, brand: string, segment: string, power: string): { price: number; level: "brand" | "origin" | "none" } {
  const b = carBrandOf(brands, brand);
  let originRow: CarPriceRow | null = null;
  for (const r of prices) {
    if (r.segment !== segment || r.power !== power) continue;
    if (r.brand === brand && brand && r.price > 0) return { price: r.price, level: "brand" };
    if (b && r.brand === b.origin && r.price > 0) originRow = r;
  }
  return originRow && b ? { price: originRow.price * b.priceFactor, level: "origin" } : { price: 0, level: "none" };
}
export function curveAt(curve: [number, number][], x: number): number {
  for (const [cap, r] of curve) if (x <= cap) return r;
  return curve.length ? curve[curve.length - 1][1] : 1;
}
/** 車齡 y 年的保值率（相對新車價）＝曲線 × 品牌係數，封頂 0.95；車齡 0＝新車＝1。 */
export function carRetention(settings: CarSettings, brand: string, years: number): number {
  if (!(years > 0)) return 1;
  const b = carBrandOf(settings.brands, brand);
  return Math.min(0.95, curveAt(settings.retention, years) * (b ? b.retention : 1));
}
/** 估值（元）：新車＝品牌×車型×動力均價；中古＝新車價 × 保值率(車齡)。均價單位是萬。 */
export function carEstimate(prices: CarPriceRow[], settings: CarSettings, spec: CarSpec): { total: number; newPrice: number; level: string; retention: number } {
  const lk = carPriceLookup(prices, settings.brands, spec.brand ?? "", spec.segment, spec.power);
  if (!(lk.price > 0)) return { total: 0, newPrice: 0, level: lk.level, retention: 1 };
  const newPrice = Math.round(lk.price * 10000);
  const ret = spec.condition === "中古" ? carRetention(settings, spec.brand ?? "", Number(spec.age ?? 0)) : 1;
  return { total: Math.round(newPrice * ret), newPrice, level: lk.level, retention: Math.round(ret * 1000) / 1000 };
}
export function carLicenseTax(cc: number, biz?: boolean): number { for (const r of CAR_LICENSE) if (cc <= r[0]) return r[biz ? 2 : 1]; return CAR_LICENSE[CAR_LICENSE.length - 1][biz ? 2 : 1]; }
export function carFuelTax(cc: number, diesel?: boolean): number { for (const r of CAR_FUEL) if (cc <= r[0]) return r[diesel ? 2 : 1]; return CAR_FUEL[CAR_FUEL.length - 1][diesel ? 2 : 1]; }
export function carEvLicenseTax(hp: number): number { for (const r of CAR_EV_LICENSE) if (hp <= r[0]) return r[1]; return CAR_EV_LICENSE[CAR_EV_LICENSE.length - 1][1]; }
/** 一年的養車成本（元／年，今天的價格），依規格推：稅／油電／保險／保養／停車／雜支。year＝持有第幾年（1 起）、calYear＝該年西元（電動車免稅落日用）。 */
export function carRunningCost(settings: CarSettings, spec: CarSpec, price: number, year: number, calYear: number): { total: number; tax: number; energy: number; ins: number; maint: number; parking: number; misc: number } {
  const p = settings.cost, b = carBrandOf(settings.brands, spec.brand ?? "");
  const age = Math.max(1, Math.round(Number(year) || 1));
  let tax = 0;
  if (spec.power === "純電") { if (calYear > p.evTaxFreeUntil) tax = carEvLicenseTax(Number(spec.hp ?? 0)); }
  else { const cc = Number(spec.cc ?? 0); tax = cc > 0 ? carLicenseTax(cc) + carFuelTax(cc, spec.power === "柴油") : 0; }
  const km = Number(spec.kmPerYear ?? 0) > 0 ? Number(spec.kmPerYear) : p.kmPerYear;
  let energy = 0;
  if (spec.power === "純電") energy = km * p.evKwhPerKm * p.elecPrice;
  else {
    const seg = (isSegment(spec.segment) ? spec.segment : "轎車") as CarSegment;
    let kpl = p.kmPerL[seg] ?? 12;
    if (spec.power === "柴油") kpl *= p.dieselKmRatio; else if (spec.power === "油電") kpl *= p.hybridKmRatio;
    energy = km / kpl * (spec.power === "柴油" ? p.dieselPrice : p.fuelPrice);
  }
  const ins = p.insBase + price * curveAt(p.bodyRate, age) / 100;
  const maint = (p.maintBase[b ? b.origin : "國產"] ?? 15000) * (b ? b.maint : 1) * curveAt(p.maintAgeRatio, age);
  const parking = spec.ownParking ? 0 : p.parkingMonthly * 12;
  const misc = p.misc;
  const r = (x: number) => Math.round(x);
  return { total: r(tax + energy + ins + maint + parking + misc), tax: r(tax), energy: r(energy), ins: r(ins), maint: r(maint), parking: r(parking), misc: r(misc) };
}
