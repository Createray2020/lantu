// 客戶財務儀表板顯示開關的伺服器端讀寫（全平台設定，後台維護）。
// 與 anDefaults / financeCategories / eduCosts 同一個模式：unstable_cache + tag，
// 後台一存 updateTag，iframe app（public/lantu-app.html）下次載入就吃到新設定。
//
// ⚠️ 合併語意：**沒有列＝顯示**。只有 DB 裡明確 hidden=true 的模組才會被關掉，
//    所以之後新增模組不會因為後台從沒設定過就整塊從客戶端消失。
// ⚠️ DB 裡不認得的 key（模組被刪掉了）一律忽略，不讓死資料變成一個看不見的開關。
import { unstable_cache, updateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientDashDefaults } from "@/Shared/db/schema";
import { CLIENT_DASH_KEYS, type ClientDashPrefs } from "./clientDashModules";

export const CLIENT_DASH_TAG = "client-dash-defaults";

/** 給 iframe app 與後台的形狀：hidden＝被關掉的模組鍵。 */
export type ClientDashPayload = { hidden: string[] };

export async function listClientDashRows(): Promise<{ key: string; hidden: boolean }[]> {
  const rows = await db.select().from(clientDashDefaults);
  return rows.map((r) => ({ key: r.key, hidden: r.hidden }));
}

export function mergeClientDash(rows: { key: string; hidden: boolean }[]): ClientDashPayload {
  const known = new Set<string>(CLIENT_DASH_KEYS);
  const hidden = rows.filter((r) => known.has(r.key) && r.hidden).map((r) => r.key);
  return { hidden };
}

/** 系統內建（DB 完全沒設定時）：全部顯示。 */
export function builtinClientDash(): ClientDashPayload {
  return { hidden: [] };
}

export const getClientDashPayload = unstable_cache(
  async (): Promise<ClientDashPayload> => {
    let rows: { key: string; hidden: boolean }[] = [];
    try { rows = await listClientDashRows(); } catch { rows = []; }
    return mergeClientDash(rows);
  },
  ["lantu-client-dash-defaults"],
  { tags: [CLIENT_DASH_TAG] },
);

/**
 * 整份覆寫（後台按存檔時送全部模組的狀態）。
 * ⚠️ neon-http 沒有交易 → 全部寫進**單一 insert…on conflict do update** 語句，
 *    不要「先刪再插」：中間失敗就等於全公司的客戶儀表板整個回到預設。
 */
export async function saveClientDashPrefs(hiddenKeys: string[]): Promise<void> {
  const known = new Set<string>(CLIENT_DASH_KEYS);
  const hidden = new Set(hiddenKeys.filter((k) => known.has(k)));
  const now = new Date();
  const values = CLIENT_DASH_KEYS.map((key) => ({ key, hidden: hidden.has(key), updatedAt: now }));
  await db.insert(clientDashDefaults).values(values).onConflictDoUpdate({
    target: clientDashDefaults.key,
    set: { hidden: sql`excluded.hidden`, updatedAt: sql`excluded.updated_at` },
  });
  updateTag(CLIENT_DASH_TAG);
}

/** 清空＝回到「全部顯示」。 */
export async function resetClientDashPrefs(): Promise<void> {
  await db.delete(clientDashDefaults);
  updateTag(CLIENT_DASH_TAG);
}

/** 把 payload 轉成 html 端好用的 { key: true } 形狀。 */
export function prefsFromPayload(p: ClientDashPayload): ClientDashPrefs {
  const out: ClientDashPrefs = {};
  for (const k of p.hidden) out[k] = true;
  return out;
}
