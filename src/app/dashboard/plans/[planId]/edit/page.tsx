import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getPlanForRead } from "@/lib/plans";
import { getClientForRead } from "@/lib/clients";
import { clientAccess } from "@/lib/clientScope";
import { licenseState } from "@/lib/license";
import { DEFAULT_UI_SCALE } from "@/lib/uiScale";
import PlanEditor from "./PlanEditor";

export const dynamic = "force-dynamic";

// 單一年度版本編輯器：全螢幕載入 v12 App（embed 模式），灌入此版 data、存回 DB。
export default async function EditPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (coach.status !== "active") redirect("/dashboard");

  // 讀取範圍含「共同執案」的協作教練；能不能存回由下面的 readOnly 決定
  //（server action savePlanDataAction 仍然只認主責，這裡只是不要讓對方白按）。
  const plan = await getPlanForRead(coach.id, planId);
  if (!plan) notFound();
  // 客戶編號：三份可交付文件的表頭要印它，隨 lantu:init 一起送進 iframe。
  // 生日同車：規劃裡還空著時由 iframe 帶入 profile.birth，教練不必再打一次（反向回寫在 updatePlanData）。
  const [client, access] = await Promise.all([
    getClientForRead(coach.id, plan.clientId),
    clientAccess(coach.id, plan.clientId),
  ]);
  const isOwner = access === "owner";

  return (
    <PlanEditor
      planId={plan.id}
      clientId={plan.clientId}
      year={plan.year}
      label={plan.label}
      data={plan.data}
      uiScale={coach.uiScale ?? DEFAULT_UI_SCALE}
      readOnly={licenseState(coach).expired || !isOwner}
      readOnlyReason={!isOwner ? "collab" : "license"}
      clientCode={client?.code ?? null}
      birthDate={client?.birthDate ?? null}
    />
  );
}
