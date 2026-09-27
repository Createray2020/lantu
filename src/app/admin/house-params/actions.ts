"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  saveHousePrice, resetHousePrice, upsertHousePrices, saveHouseSetting, resetHouseSetting,
  type HousePriceInput,
} from "@/lib/houseParams";

export type ActionResult = { ok: true; info?: string } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "unknown-city": "不認得這個縣市（要用「台」不用「臺」）",
  "unknown-district": "這個行政區不在該縣市底下",
  "invalid-condition": "屋況只能是 預售／新成屋／中古",
  "invalid-unit-price": "每坪均價要是 0 以上的數字",
  "invalid-parking-price": "車位單價要是 0 以上的數字",
  "invalid-ratio": "倍率要是 0 以上的數字",
  "invalid-age": "屋齡上限要是 0 以上的數字",
  "invalid-value": "數值格式不對",
  "unknown-key": "不認得這個參數",
};
function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}
async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
}
const refresh = () => revalidatePath("/admin/house-params");

export async function saveHousePriceAction(input: HousePriceInput): Promise<ActionResult> {
  try { await guard(); await saveHousePrice(input); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function resetHousePriceAction(city: string, district: string, condition: string): Promise<ActionResult> {
  try { await guard(); await resetHousePrice(city, district, condition); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
/** 貼 CSV 批次匯入：city,district,condition,unitPrice,parkingPrice,source,basis（第一列可為表頭）。爬蟲也走同一支。 */
export async function importHousePricesCSVAction(csv: string): Promise<ActionResult> {
  try {
    await guard();
    const lines = String(csv ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows: HousePriceInput[] = [];
    for (const l of lines) {
      const c = l.split(/,|\t/).map((x) => x.trim());
      if (/^city$/i.test(c[0] ?? "") || c[0] === "縣市") continue;
      if (c.length < 4) continue;
      rows.push({ city: c[0], district: c[1] ?? "", condition: c[2] ?? "", unitPrice: c[3] ?? "", parkingPrice: c[4] ?? "", source: c[5] ?? "", basis: c[6] ?? "" });
    }
    const r = await upsertHousePrices(rows);
    refresh();
    const bad = r.rejected.slice(0, 5).map((x) => `${x.input.city}${x.input.district ?? ""}/${x.input.condition}（${MSG[x.reason] ?? x.reason}）`).join("；");
    return { ok: true, info: `寫入 ${r.written} 筆` + (r.rejected.length ? `，擋掉 ${r.rejected.length} 筆：${bad}` : "") };
  } catch (e) { return fail(e); }
}
export async function saveHouseSettingAction(key: "typeRatio" | "ageRatio" | "pay", value: unknown): Promise<ActionResult> {
  try { await guard(); await saveHouseSetting(key, value); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function resetHouseSettingAction(key: "typeRatio" | "ageRatio" | "pay"): Promise<ActionResult> {
  try { await guard(); await resetHouseSetting(key); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
