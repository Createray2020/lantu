// 生育費用參數的伺服器端讀寫。與 eduCosts / bizTaxParams 同一個模式：
// unstable_cache + tag，後台一存 updateTag，iframe app 下次載入就吃到新數字。
//
// 程式端的 birthCosts.defaults.ts 是 seed 與 fallback——DB 沒有這一列就用內建值，
// 所以就算這張表整個是空的，畫面也不會壞（只是永遠停在改版當時的數字）。
import { unstable_cache, updateTag } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { birthCostParams } from "@/Shared/db/schema";
import { BIRTH_COST_DEFAULTS, BIRTH_COST_BASIS, type BirthCostSeed } from "./birthCosts.defaults";

export const BIRTH_COST_TAG = "birth-costs";

export type BirthCostRow = BirthCostSeed & { basis: string; sortOrder: number };

export function defaultBirthCosts(): BirthCostRow[] {
  return BIRTH_COST_DEFAULTS.map((s, i) => ({ ...s, basis: BIRTH_COST_BASIS, sortOrder: i }));
}

export async function listBirthCosts(): Promise<BirthCostRow[]> {
  const rows = await db.select().from(birthCostParams).orderBy(asc(birthCostParams.sortOrder));
  return rows.map((r) => ({
    key: r.key, label: r.label, grp: r.grp, unit: r.unit,
    amount: r.amount, basis: r.basis ?? "", note: r.note ?? "", sortOrder: r.sortOrder,
  }));
}

/**
 * 後台表格用：內建清單為骨幹，DB 有的那幾列覆蓋上去。
 * ⚠️ 跟 bizTaxParams 同一套合併語意——不是「DB 有幾列就顯示幾列」。
 *    否則有人誤刪一列，前端拿到 undefined，試算會靜靜地算出 NaN。
 */
export async function birthCostRows(): Promise<BirthCostRow[]> {
  let rows: BirthCostRow[] = [];
  try { rows = await listBirthCosts(); } catch { rows = []; }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return defaultBirthCosts().map((d) => {
    const r = byKey.get(d.key);
    return r && Number.isFinite(r.amount)
      ? { ...d, amount: r.amount, basis: r.basis || d.basis, note: r.note || d.note }
      : d;
  });
}

/** 給 iframe app 的 payload：{ 參數 key → 金額 }，外加對外顯示的基準日。 */
export const getBirthCostPayload = unstable_cache(
  async (): Promise<{ values: Record<string, number>; basis: string }> => {
    const rows = await birthCostRows();
    const values: Record<string, number> = {};
    let basis = BIRTH_COST_BASIS;
    for (const r of rows) {
      values[r.key] = r.amount;
      if (r.basis && r.basis > basis) basis = r.basis;
    }
    return { values, basis };
  },
  ["lantu-birth-costs"],
  { tags: [BIRTH_COST_TAG] },
);

const int = (v: unknown, field: string): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid-${field}`);
  return n;
};

export type BirthCostInput = { key: string; amount: number | string; basis?: string; note?: string };

export async function saveBirthCost(input: BirthCostInput): Promise<void> {
  const d = defaultBirthCosts().find((x) => x.key === input.key);
  if (!d) throw new Error("unknown-key");   // 只認得內建清單裡的 key，不開放新增
  const amount = int(input.amount, "amount");
  await db.insert(birthCostParams).values({
    key: d.key, label: d.label, grp: d.grp, unit: d.unit, amount,
    basis: (input.basis ?? d.basis) || null, note: (input.note ?? d.note) || null,
    sortOrder: d.sortOrder, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: birthCostParams.key,
    set: { amount, basis: (input.basis ?? d.basis) || null, note: (input.note ?? d.note) || null, updatedAt: new Date() },
  });
  updateTag(BIRTH_COST_TAG);
}

export async function resetBirthCost(key: string): Promise<void> {
  await db.delete(birthCostParams).where(eq(birthCostParams.key, key));   // 刪掉＝回到程式內建值
  updateTag(BIRTH_COST_TAG);
}
