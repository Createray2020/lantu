// 編號配號的 DB 層（純函式在 codes.ts，這裡只負責跟 code_counters 要下一個號）。
// 分兩支的理由同 license.ts / quota.ts：格式規則要能不碰 DB 就測。

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { codeCounters } from "@/Shared/db/schema";
import { formatCode, ymTaipei, type CodeKind } from "./codes";

/**
 * 配一個新編號給 kind 這條線。
 *
 * ⚠️ 這裡刻意是**單一 SQL 語句**：`insert … on conflict do update … returning`。
 *    neon-http 不支援互動式交易，「先 select max 再 insert」在同一秒的兩個請求下
 *    會發出兩個一樣的號；交給 Postgres 對同一列的鎖來排隊才是對的。
 *    改這支之前先確認新寫法仍然是一個語句。
 */
export async function allocCode(kind: CodeKind, now: Date = new Date()): Promise<string> {
  const ym = ymTaipei(now);
  const rows = await db
    .insert(codeCounters)
    .values({ kind, ym, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [codeCounters.kind, codeCounters.ym],
      set: { lastSeq: sql`${codeCounters.lastSeq} + 1` },
    })
    .returning({ seq: codeCounters.lastSeq });
  const seq = rows[0]?.seq ?? 1;
  return formatCode(kind, ym, seq);
}

/** 目前這個月已經發到第幾號（後台顯示用；沒發過回 0）。 */
export async function currentSeq(kind: CodeKind, now: Date = new Date()): Promise<number> {
  const ym = ymTaipei(now);
  const rows = await db
    .select({ seq: codeCounters.lastSeq })
    .from(codeCounters)
    .where(and(eq(codeCounters.kind, kind), eq(codeCounters.ym, ym)))
    .limit(1);
  return rows[0]?.seq ?? 0;
}
