// 官網首頁的信任數字。
//
// 刻意全部取自實際資料、並在畫面上標「截至 YYYY/MM」：
// 同業普遍寫「服務超過 1,200 位客戶」卻找不到任何一筆佐證，那種數字只在自己人眼裡有用。
// 數字小的時候不要放大，放大會在第一個認真看的人面前破功。
import { sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { plans } from "@/Shared/db/schema";
import { listPublicCoaches } from "./coachProfile";

export type LandingStats = {
  coaches: number;
  plans: number;
  specialties: number;
  asOf: string; // 例 2026/08
};

export async function getLandingStats(now = new Date()): Promise<LandingStats> {
  const [coachRows, planCount] = await Promise.all([
    listPublicCoaches(),
    db.select({ n: sql<number>`count(*)::int` }).from(plans),
  ]);
  const specialties = new Set(coachRows.flatMap((c) => c.specialties));
  return {
    coaches: coachRows.length,
    plans: planCount[0]?.n ?? 0,
    specialties: specialties.size,
    asOf: `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`,
  };
}
