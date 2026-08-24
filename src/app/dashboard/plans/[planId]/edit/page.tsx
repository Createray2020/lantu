import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getPlan } from "@/lib/plans";
import { getClient } from "@/lib/clients";
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

  const plan = await getPlan(coach.id, planId);
  if (!plan) notFound();
  // 客戶編號：三份可交付文件的表頭要印它，隨 lantu:init 一起送進 iframe。
  const client = await getClient(coach.id, plan.clientId);

  return (
    <PlanEditor
      planId={plan.id}
      clientId={plan.clientId}
      year={plan.year}
      label={plan.label}
      data={plan.data}
      uiScale={coach.uiScale ?? DEFAULT_UI_SCALE}
      readOnly={licenseState(coach).expired}
      clientCode={client?.code ?? null}
    />
  );
}
