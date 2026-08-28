import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientPlanCase } from "@/lib/clientPlan";
import ClientPlanFrame from "./ClientPlanFrame";

export const dynamic = "force-dynamic";

/**
 * 讀出「這份藍圖是哪一軌的」。
 *
 * ⚠️ 防呆讀取：資料層（getClientPlanCase）正在補上 track／coachName／year 三個欄位，
 *    還沒補上的期間這裡讀到 undefined，畫面就退回不標示 —— 不會壞、也不會亂標。
 */
function trackOf(plan: object): { track?: "coach" | "client"; coachName?: string | null; year?: number } {
  const o = plan as Record<string, unknown>;
  return {
    track: o.track === "coach" || o.track === "client" ? o.track : undefined,
    coachName: typeof o.coachName === "string" && o.coachName.trim() ? o.coachName : null,
    year: typeof o.year === "number" ? o.year : undefined,
  };
}

// 客戶端「我的完整財務藍圖」：財務儀表／規劃報告（唯讀，沿用 lantu-app.html 引擎）。
export default async function ClientPlanPage() {
  const user = await ensureClientUser();
  if (!user) redirect("/client/sign-in");
  const plan = await getClientPlanCase(user.id);
  if (!plan) redirect("/portal/passport");
  const meta = trackOf(plan);
  return (
    <ClientPlanFrame
      data={plan.data}
      clientCode={plan.code}
      track={meta.track}
      coachName={meta.coachName}
      year={meta.year}
    />
  );
}
