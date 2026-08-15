import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientPlanCase } from "@/lib/clientPlan";
import ClientPlanFrame from "./ClientPlanFrame";

export const dynamic = "force-dynamic";

// 客戶端「我的完整財務藍圖」：財務儀表／規劃報告（唯讀，沿用 lantu-app.html 引擎）。
export default async function ClientPlanPage() {
  const user = await ensureClientUser();
  if (!user) redirect("/client/sign-in");
  const plan = await getClientPlanCase(user.id);
  if (!plan) redirect("/portal/passport");
  return <ClientPlanFrame data={plan.data} />;
}
