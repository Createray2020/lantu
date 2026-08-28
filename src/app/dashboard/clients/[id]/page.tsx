import { notFound, redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { getClientDetail } from "@/lib/clients";
import { comparePlans } from "@/lib/plans";
import { clientAccess } from "@/lib/clientScope";
import { listCollaborators } from "@/lib/clientCollab";
import { pendingDraft } from "@/lib/consultSession";
import DashboardHeader from "../../DashboardHeader";
import { headerProps } from "../../headerProps";
import ReadOnlyBanner from "../../ReadOnlyBanner";
import CollabBanner from "./CollabBanner";
import ClientDetail from "./ClientDetail";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (coach.status !== "active") redirect("/dashboard");

  // getClientDetail 已改成不撈 plans.data（只有 comparePlans 需要整份 jsonb），
  // 兩支可以並行，不必序列等待。
  // access：owner＝主責（可寫）／viewer＝被邀來共同執案（唯讀）／null＝看不到。
  // 三支都吃「可讀範圍」，所以協作教練拿得到同一份資料；能不能改由 readOnly 決定。
  const [detail, compare, access] = await Promise.all([
    getClientDetail(coach.id, id),
    comparePlans(coach.id, id).catch(() => []),
    clientAccess(coach.id, id),
  ]);
  if (!detail || !access) notFound();
  const isOwner = access === "owner";
  const collaborators = isOwner ? await listCollaborators(id) : [];
  // 「按了結束但沒存」的草稿。只有主責看得到（協作教練不能開場也不能結束）。
  const draft = isOwner ? await pendingDraft(id) : null;

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
  // 唯讀有兩種來源：期限到期（紅）與共同執案（藍）。兩條橫幅分開，
  // 協作教練不該看到「請聯繫管理員延長期限」那句與他無關的話。
  const readOnly = hp.license.expired || !isOwner;

  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      {!isOwner && <CollabBanner />}
      <ClientDetail
        client={client}
        plans={plans}
        passportPlan={passportPlan}
        reviews={reviews}
        actionItems={actionItems}
        draft={draft ? { sessionId: draft.sessionId, planId: draft.planId, endedAt: draft.endedAt ? draft.endedAt.toISOString().slice(0, 10) : null, draft: draft.draft, todos: draft.todos } : null}
        compare={compare}
        readOnly={readOnly}
        isOwner={isOwner}
        collaborators={collaborators.map((c) => ({
          id: c.id,
          coachName: c.coachName,
          coachCode: c.coachCode,
          status: c.status,
          createdAt: c.createdAt.toISOString().slice(0, 10),
        }))}
      />
    </div>
  );
}
