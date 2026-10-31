// 收件匣（2026/11/01 介面整理第一波）的計數。
// 收件匣本身不開新表：它只是把「待確認／通知／待簽文件／待我處理」這幾個既有來源集中顯示。
import { count, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";

/** 待審核的報聘（coaches.status='pending'）。後台「待我處理」的主體，頂欄徽章用。 */
export async function countPendingApplications(): Promise<number> {
  const rows = await db.select({ n: count() }).from(coaches).where(eq(coaches.status, "pending"));
  return Number(rows[0]?.n ?? 0);
}
