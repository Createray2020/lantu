import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getPlan } from "@/lib/plans";
import PlanEditor from "./PlanEditor";

export const dynamic = "force-dynamic";

// 單一年度版本編輯器：全螢幕載入 v12 App（embed 模式），灌入此版 data、存回 DB。
export default async function EditPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const coach = await ensureCoach();
  if (!coach) redirect("/sign-in");
  if (coach.status !== "active") redirect("/dashboard");

  const plan = await getPlan(coach.id, planId);
  if (!plan) notFound();

  return (
    <PlanEditor
      planId={plan.id}
      clientId={plan.clientId}
      year={plan.year}
      label={plan.label}
      data={plan.data}
    />
  );
}
