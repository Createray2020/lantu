// AI 助理用量（ai_usage）。記錄與月上限兩件事，純 DB 層；費用換算不在這裡（單價會變）。
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { aiUsage } from "@/Shared/db/schema";

export type UsageRow = { coachId: string; clientId: string | null; mode: string; model: string; input: number; output: number; opsProposed: number };

/** 寫一列用量。失敗不往外丟——記帳失敗不該讓教練拿不到回答。 */
export async function recordUsage(r: UsageRow): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      coachId: r.coachId,
      clientId: r.clientId,
      mode: r.mode,
      model: r.model,
      inputTokens: Math.max(0, Math.round(r.input)),
      outputTokens: Math.max(0, Math.round(r.output)),
      opsProposed: Math.max(0, Math.round(r.opsProposed)),
    });
  } catch (e) {
    console.error("[aiUsage] 記錄失敗", e);
  }
}

/** 台北時間的「這個月 1 日 00:00」。月上限以台灣月份為界，不是 UTC。 */
export function monthStartTaipei(now = new Date()): Date {
  const tpe = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = tpe.getUTCFullYear(), m = tpe.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0) - 8 * 3600 * 1000);
}

/** 這位教練本月已用 token（input＋output）。查不到當 0——寧可多放行一次，不要因為 DB 抖動把助理鎖死。 */
export async function monthTokens(coachId: string, now = new Date()): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.coachId, coachId), gte(aiUsage.createdAt, monthStartTaipei(now))));
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

/** 後台看：每位教練本月用量。 */
export async function monthTokensByCoach(now = new Date()): Promise<Array<{ coachId: string; calls: number; tokens: number; ops: number }>> {
  const rows = await db
    .select({
      coachId: aiUsage.coachId,
      calls: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)`,
      ops: sql<number>`coalesce(sum(${aiUsage.opsProposed}), 0)`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, monthStartTaipei(now)))
    .groupBy(aiUsage.coachId);
  return rows.map((r) => ({ coachId: r.coachId, calls: Number(r.calls), tokens: Number(r.tokens), ops: Number(r.ops) }));
}
