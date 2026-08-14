import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientUsers } from "@/Shared/db/schema";
import LandingView from "@/components/LandingView";

export const dynamic = "force-dynamic";

// 嵐途官網首頁（對外門面）。
// - 未登入：完整行銷 landing，並排「教練／客戶」兩個獨立入口。
// - 已登入：依角色導向各自的家（客戶→/portal、教練→/dashboard）。
//   （登入後若想回官網 landing，走常駐公開路由 /home，不會被導走。）
export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    const asClient = await db
      .select({ id: clientUsers.id })
      .from(clientUsers)
      .where(eq(clientUsers.id, userId))
      .limit(1);
    redirect(asClient[0] ? "/portal" : "/dashboard");
  }
  return <LandingView />;
}
