// 教練使用權益的資料層：客戶數上限查表 ＋ 目前用量。
// 純計算在 lib/license.ts（可測試、無 DB），這裡只負責把 DB 的列餵進去。

import { and, eq, ne, count } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, compRanks, compVersions } from "@/Shared/db/schema";
import { clientCapOf, quotaState, type QuotaState } from "./license";

/**
 * 生效版本的預設職級表（module_code=''）裡各級的客戶上限。
 * 只讀預設表：模塊自訂職級表是拿來調分潤率的，跟「這個人能建幾位客戶」無關。
 * 查不到生效版本 → 回空表，clientCapOf 會落回內建級距。
 */
export async function rankCaps(): Promise<Record<string, number | null>> {
  const active = await db
    .select({ id: compVersions.id })
    .from(compVersions)
    .where(eq(compVersions.status, "active"))
    .limit(1);
  const versionId = active[0]?.id;
  if (!versionId) return {};

  const rows = await db
    .select({ code: compRanks.code, cap: compRanks.clientCap })
    .from(compRanks)
    .where(and(eq(compRanks.versionId, versionId), eq(compRanks.moduleCode, "")));

  const out: Record<string, number | null> = {};
  for (const r of rows) out[r.code] = r.cap;
  return out;
}

/**
 * 目前佔用的客戶數：**不含已封存、不含共用示範範本**。
 *
 * 封存＝不再服務，若也計入上限，教練就永遠沒辦法靠整理舊資料騰出空間，
 * 只能刪資料 —— 那正是我們不希望發生的事。
 *
 * ⚠️ `is_template = false` 是明確排除，不是備援（同 lib/clientScope.ts）。
 * 範本的 coach_id 本來就是 null，照理說這個 count 選不到它；但只要有一列範本
 * 的 coach_id 被誤設成某位教練，他的額度就會憑空少一格，而他的客戶列表上
 * 看不到任何多出來的人——這種帳對不起來的問題幾乎不可能從畫面查出原因。
 */
export async function usedClientCount(coachId: string): Promise<number> {
  const r = await db
    .select({ n: count() })
    .from(clients)
    .where(and(
      eq(clients.coachId, coachId),
      ne(clients.status, "archived"),
      eq(clients.isTemplate, false),
    ));
  return Number(r[0]?.n ?? 0);
}

export async function clientQuota(
  coach: { id: string; rankCode?: string | null; clientCapOverride?: number | null },
): Promise<QuotaState> {
  const [caps, used] = await Promise.all([rankCaps(), usedClientCount(coach.id)]);
  return quotaState(clientCapOf(coach, caps), used);
}
