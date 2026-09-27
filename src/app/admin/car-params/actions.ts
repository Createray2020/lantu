"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  saveCarPrice, resetCarPrice, upsertCarPrices, saveCarSetting, resetCarSetting,
  type CarPriceInput, type CarSettingKey,
} from "@/lib/carParams";

export type ActionResult = { ok: true; info?: string } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "unknown-brand": "這個品牌不在品牌表裡（先到下面「品牌表」新增）；等級層請填 國產／進口／豪華",
  "invalid-segment": "車型只能是 轎車／休旅SUV／七人座MPV／商用/貨車／跑車",
  "invalid-power": "動力只能是 汽油／柴油／油電／純電",
  "invalid-origin": "品牌等級只能是 國產／進口／豪華",
  "invalid-price": "均價要是 0 以上的數字",
  "invalid-ratio": "係數要是 0 以上的數字",
  "invalid-age": "車齡上限要是 0 以上的數字",
  "invalid-value": "數值格式不對",
  "unknown-key": "不認得這個參數",
};
function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? (raw.startsWith("invalid-") ? `數值格式不對（${raw.slice(8)}）` : raw) };
}
async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
}
const refresh = () => revalidatePath("/admin/car-params");

export async function saveCarPriceAction(input: CarPriceInput): Promise<ActionResult> {
  try { await guard(); await saveCarPrice(input); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function resetCarPriceAction(brand: string, segment: string, power: string): Promise<ActionResult> {
  try { await guard(); await resetCarPrice(brand, segment, power); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
/** 貼 CSV 批次匯入：brand,segment,power,price,source,basis（第一列可為表頭）。爬蟲也走同一支。 */
export async function importCarPricesCSVAction(csv: string): Promise<ActionResult> {
  try {
    await guard();
    const lines = String(csv ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows: CarPriceInput[] = [];
    for (const l of lines) {
      const c = l.split(/,|\t/).map((x) => x.trim());
      if (/^brand$/i.test(c[0] ?? "") || c[0] === "品牌") continue;
      if (c.length < 4) continue;
      rows.push({ brand: c[0], segment: c[1] ?? "", power: c[2] ?? "", price: c[3] ?? "", source: c[4] ?? "", basis: c[5] ?? "" });
    }
    const r = await upsertCarPrices(rows);
    refresh();
    const bad = r.rejected.slice(0, 5).map((x) => `${x.input.brand}/${x.input.segment}/${x.input.power}（${MSG[x.reason] ?? x.reason}）`).join("；");
    return { ok: true, info: `寫入 ${r.written} 筆` + (r.rejected.length ? `，擋掉 ${r.rejected.length} 筆：${bad}` : "") };
  } catch (e) { return fail(e); }
}
export async function saveCarSettingAction(key: CarSettingKey, value: unknown): Promise<ActionResult> {
  try { await guard(); await saveCarSetting(key, value); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function resetCarSettingAction(key: CarSettingKey): Promise<ActionResult> {
  try { await guard(); await resetCarSetting(key); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
