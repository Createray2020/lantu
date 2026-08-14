import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import LandingView from "@/components/LandingView";

export const dynamic = "force-dynamic";

// 嵐途官網首頁（對外門面）。
// - 未登入：完整行銷 landing，並排「教練／客戶」兩個獨立入口。
// - 已登入：有教練身分→/dashboard（教練的家），否則→/portal（客戶介面）。
//   教練↔客戶不互斥，同一帳號兩邊都能進；要看官網 landing 走常駐公開路由 /home。
export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    const asCoach = await db
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.id, userId))
      .limit(1);
    redirect(asCoach[0] ? "/dashboard" : "/portal");
  }
  return <LandingView />;
}
