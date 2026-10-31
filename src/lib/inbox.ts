// 收件匣（2026/11/01 介面整理第一波）的計數。
// 收件匣本身不開新表：它只是把「待確認／通知／待簽文件／待我處理」這幾個既有來源集中顯示。
import { unstable_cache } from "next/cache";
import { count, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { listDocTodos } from "./docsStore";

/** 待審核的報聘（coaches.status='pending'）。後台「待我處理」的主體，頂欄徽章用。 */
export async function countPendingApplications(): Promise<number> {
  const rows = await db.select({ n: count() }).from(coaches).where(eq(coaches.status, "pending"));
  return Number(rows[0]?.n ?? 0);
}

/**
 * 全組織「需要處理的文件」（拒簽／逾期／卡太久）。後台待我處理與收件匣都列這一組，頂欄徽章也要算進去，
 * 不然紅點寫 1、點進去卻是 4（2026/11/01 上線後實測）。
 * listDocTodos 要掃全部實例，每一頁頂欄都跑太貴，所以快取 2 分鐘——徽章晚兩分鐘更新可以接受。
 */
export const countOrgDocTodos = unstable_cache(async () => (await listDocTodos()).length, ["inbox-org-doc-todos"], { revalidate: 120 });
