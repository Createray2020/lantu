// 客戶分析頁模組「全平台預設順序」的伺服器端讀寫。
// 與 financeCategories / eduCosts / bizTaxParams 同一個模式：unstable_cache + tag，
// 後台一存 updateTag，iframe app（public/lantu-app.html）下次載入就吃到新順序。
//
// ⚠️ 合併語意（跟 bizTaxParams 同一套，理由也一樣）：
//    payload 不是「DB 有幾列就給幾列」，而是「以 AN_MODULES 為骨幹，DB 有的覆蓋順序與隱藏」。
//    否則之後新增一個模組，後台沒重存過就會整個從畫面消失——而那是預設要看得到的東西。
//    反過來，DB 裡出現不認得的 key（模組被刪掉了）一律忽略，不讓死資料排進畫面。
import { unstable_cache, updateTag } from "next/cache";
import { asc, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { anModuleDefaults } from "@/Shared/db/schema";
import { AN_MODULES, AN_MODULE_KEYS } from "./analysisModules";

export const AN_DEFAULTS_TAG = "an-defaults";

export type AnDefaultRow = { key: string; sortOrder: number; hidden: boolean };
/** 給 iframe app 的形狀：order＝完整的模組順序、hidden＝預設收起來不顯示的鍵 */
export type AnDefaultPayload = { order: string[]; hidden: string[] };

export async function listAnDefaults(): Promise<AnDefaultRow[]> {
  const rows = await db.select().from(anModuleDefaults).orderBy(asc(anModuleDefaults.sortOrder));
  return rows.map((r) => ({ key: r.key, sortOrder: r.sortOrder, hidden: r.hidden }));
}

/**
 * 把 DB 列合併成完整順序。
 * 認得的 key 依 sortOrder 排在前面，沒被設定過的模組照 AN_MODULES 的內建順序接在後面。
 */
export function mergeAnDefaults(rows: AnDefaultRow[]): AnDefaultPayload {
  const known = new Set<string>(AN_MODULE_KEYS);
  const seen = new Set<string>();
  const ordered = rows
    .filter((r) => known.has(r.key) && !seen.has(r.key) && (seen.add(r.key), true))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const order = ordered.map((r) => r.key);
  for (const k of AN_MODULE_KEYS) if (!seen.has(k)) order.push(k);

  const hidden = ordered.filter((r) => r.hidden).map((r) => r.key);
  return { order, hidden };
}

/** 系統內建（DB 完全沒設定時）的樣子：照 AN_MODULES 的順序、一個都不隱藏 */
export function builtinAnDefaults(): AnDefaultPayload {
  return { order: [...AN_MODULE_KEYS], hidden: [] };
}

export const getAnDefaultPayload = unstable_cache(
  async (): Promise<AnDefaultPayload> => {
    let rows: AnDefaultRow[] = [];
    try { rows = await listAnDefaults(); } catch { rows = []; }
    return mergeAnDefaults(rows);
  },
  ["lantu-an-defaults"],
  { tags: [AN_DEFAULTS_TAG] },
);

export type AnDefaultInput = { order: string[]; hidden: string[] };

/**
 * 整份覆寫。後台那一頁本來就是「排好整串再存」，逐列存反而會出現排到一半的中間狀態。
 * ⚠️ neon-http 沒有交易 → 全部寫進**單一 insert…on conflict do update** 語句，
 *    這是這個驅動下唯一真正原子的寫法（跟編號配號的 code_counters 同一個理由）。
 */
export async function saveAnDefaults(input: AnDefaultInput): Promise<void> {
  const known = new Set<string>(AN_MODULE_KEYS);
  const seen = new Set<string>();
  const order = input.order.filter((k) => known.has(k) && !seen.has(k) && (seen.add(k), true));
  if (order.length !== AN_MODULE_KEYS.length) throw new Error("module-list-mismatch");

  const hidden = new Set(input.hidden.filter((k) => known.has(k)));
  const now = new Date();
  const values = order.map((key, i) => ({ key, sortOrder: i, hidden: hidden.has(key), updatedAt: now }));
  await db.insert(anModuleDefaults).values(values).onConflictDoUpdate({
    target: anModuleDefaults.key,
    set: {
      sortOrder: sql`excluded.sort_order`,
      hidden: sql`excluded.hidden`,
      updatedAt: sql`excluded.updated_at`,
    },
  });
  updateTag(AN_DEFAULTS_TAG);
}

/** 清空＝回到程式內建順序（跟 bizTaxParams 的「回復內建值」同一個手勢） */
export async function resetAnDefaults(): Promise<void> {
  await db.delete(anModuleDefaults);
  updateTag(AN_DEFAULTS_TAG);
}

/** 後台頁用：合併後的完整清單，附標題與是否隱藏 */
export function anBoardRows(payload: AnDefaultPayload): { k: string; t: string; cond?: string; hidden: boolean }[] {
  const hidden = new Set(payload.hidden);
  const byK = new Map(AN_MODULES.map((m) => [m.k, m]));
  return payload.order
    .map((k) => byK.get(k))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({ k: m.k, t: m.t, cond: m.cond, hidden: hidden.has(m.k) }));
}
