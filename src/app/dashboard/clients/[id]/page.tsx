import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getClientDetail } from "@/lib/clients";
import { comparePlans } from "@/lib/plans";
import DashboardHeader from "../../DashboardHeader";
import ClientDetail from "./ClientDetail";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await ensureCoach();
  if (!coach) redirect("/sign-in");
  if (coach.status !== "active") redirect("/dashboard");

  const detail = await getClientDetail(coach.id, id);
  if (!detail) notFound();
  const compare = await comparePlans(coach.id, id);

  // 只傳前端需要的欄位（不把整份 plan.data jsonb 送到瀏覽器）。
  const client = {
    id: detail.client.id,
    name: detail.client.name,
    contact: detail.client.contact ?? {},
    source: detail.client.source,
    tags: detail.client.tags ?? [],
    lifeStage: detail.client.lifeStage,
    status: detail.client.status,
    birthDate: detail.client.birthDate,
  };
  const plans = detail.plans.map((p) => ({
    id: p.id,
    year: p.year,
    label: p.label,
    status: p.status,
    healthGrade: p.healthGrade,
    netWorth: p.netWorth,
    basedOnDate: p.basedOnDate,
    updatedAt: p.updatedAt ? p.updatedAt.toISOString().slice(0, 10) : null,
  }));
  const reviews = detail.reviews.map((r) => ({
    id: r.id,
    date: r.date,
    type: r.type,
    planId: r.planId,
    attendees: r.attendees,
    summary: r.summary,
    nextAppt: r.nextAppt,
  }));
  const actionItems = detail.actionItems.map((i) => ({
    id: i.id,
    title: i.title,
    owner: i.owner,
    dueDate: i.dueDate,
    done: i.done,
    reviewId: i.reviewId,
  }));

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader isAdmin={coach.role === "admin"} />
      <ClientDetail client={client} plans={plans} reviews={reviews} actionItems={actionItems} compare={compare} />
    </div>
  );
}
