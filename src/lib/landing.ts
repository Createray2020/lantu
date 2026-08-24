// 官網首頁的信任數字。
//
// 刻意全部取自實際資料、並在畫面上標「截至 YYYY/MM」：
// 同業普遍寫「服務超過 1,200 位客戶」卻找不到任何一筆佐證，那種數字只在自己人眼裡有用。
// 數字小的時候不要放大，放大會在第一個認真看的人面前破功。
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { plans } from "@/Shared/db/schema";
import { countPublicCoaches, listPublicCoaches } from "./coachProfile";

export type LandingStats = {
  coaches: number;
  plans: number;
  specialties: number;
  asOf: string; // 例 2026/08
};

export async function getLandingStats(now = new Date()): Promise<LandingStats> {
  // 教練數與專長數刻意取自**不同**的來源：
  //   · 人數＝countPublicCoaches()，把「自己選擇隱藏」的教練算回來（公司規模）
  //   · 專長＝看得到的那幾張卡（listPublicCoaches），因為專長是拿來篩選教練頁的；
  //     首頁說有某個專長、列表卻一個人都篩不到，比數字小更傷。
  const [coachCount, coachRows, planCount] = await Promise.all([
    countPublicCoaches(),
    listPublicCoaches(),
    // 只算「教練做的、已經交付出去的」規劃：
    // 客戶自己的人生護照（track='client'）與建檔時自動產生的空白初版（status='draft'）
    // 都不算數——把它們算進去，這個數字就變成「我們開過幾個檔案」而不是「我們做完幾份規劃」。
    db.select({ n: sql<number>`count(*)::int` }).from(plans)
      .where(and(eq(plans.track, "coach"), ne(plans.status, "draft"))),
  ]);
  const specialties = new Set(coachRows.flatMap((c) => c.specialties));
  return {
    coaches: coachCount,
    plans: planCount[0]?.n ?? 0,
    specialties: specialties.size,
    asOf: `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`,
  };
}
