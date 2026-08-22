import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getClientDetail } from "@/lib/clients";
import { comparePlans } from "@/lib/plans";
import DashboardHeader from "../../DashboardHeader";
import { headerProps } from "../../headerProps";
import ReadOnlyBanner from "../../ReadOnlyBanner";
import ClientDetail from "./ClientDetail";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (coach.status !== "active") redirect("/dashboard");

  // getClientDetail 已改成不撈 plans.data（只有 comparePlans 需要整份 jsonb），
  // 兩支可以並行，不必序列等待。
  const [detail, compare] = await Promise.all([
    getClientDetail(coach.id, id),
    comparePlans(coach.id, id).catch(() => []),
  ]);
  if (!detail) notFound();

  // 只傳前端需要的欄位（不把整份 plan.data jsonb 送到瀏覽器）。
  const client = {
    id: detail.client.id,
    name: detail.client.name,
    contact: detail.client.contact ?? {},
    source: detail.client.source,
    tags: detail.client.tags ?? [],
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
  // 客戶自己的人生護照：教練唯讀。刻意不放進上面的 plans 陣列——
  // 那份清單的每一列都掛著編輯／複製／刪除／改狀態，架在客戶的資料上會出事。
  const passportPlan = detail.passportPlan
    ? {
        id: detail.passportPlan.id,
        year: detail.passportPlan.year,
        healthGrade: detail.passportPlan.healthGrade,
        netWorth: detail.passportPlan.netWorth,
        updatedAt: detail.passportPlan.updatedAt ? detail.passportPlan.updatedAt.toISOString().slice(0, 10) : null,
      }
    : null;
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

  const hp = await headerProps(coach);

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      <ClientDetail client={client} plans={plans} passportPlan={passportPlan} reviews={reviews} actionItems={actionItems} compare={compare} />
    </div>
  );
}
