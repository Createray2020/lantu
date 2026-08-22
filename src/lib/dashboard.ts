// 教練儀表板彙總（教練隔離）。
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clients, plans, reviews } from "@/Shared/db/schema";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function ts(d: Date | null): number {
  return d ? d.getTime() : 0;
}

export type ApptItem = { clientId: string; clientName: string; date: string; type: string };
export type OverdueItem = { clientId: string; clientName: string; date: string; type: string };
export type OpenActionItem = { id: string; clientId: string; clientName: string; title: string; owner: string | null; dueDate: string | null; overdue: boolean };

export type CoachDashboard = {
  counts: { total: number; active: number; upcomingWeek: number; openItems: number };
  thisWeek: ApptItem[];
  thisMonth: ApptItem[];
  overdue: OverdueItem[];
  openItems: OpenActionItem[];
  byStatus: Record<string, number>;
  byGrade: Record<string, number>;
};

function inc(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export async function getCoachDashboard(coachId: string): Promise<CoachDashboard> {
  const clientRows = await db.select().from(clients).where(eq(clients.coachId, coachId));
  const ids = clientRows.map((c) => c.id);
  const nameOf = new Map(clientRows.map((c) => [c.id, c.name] as const));

  let reviewRows: (typeof reviews.$inferSelect)[] = [];
  let itemRows: (typeof actionItems.$inferSelect)[] = [];
  // 儀表板只用得到 healthGrade 做階段分佈；明列欄位，不要把整份 plans.data jsonb 撈回來。
  let planRows: { clientId: string; year: number; createdAt: Date; healthGrade: string | null }[] = [];
  if (ids.length) {
    [reviewRows, itemRows, planRows] = await Promise.all([
      db.select().from(reviews).where(inArray(reviews.clientId, ids)),
      db.select().from(actionItems).where(inArray(actionItems.clientId, ids)),
      // 只算教練那一軌：客戶自己的人生護照 healthGrade 是護照骨架算出來的，
      // 混進來會頂掉教練版，讓首頁的階段分佈失準。
      db.select({ clientId: plans.clientId, year: plans.year, createdAt: plans.createdAt, healthGrade: plans.healthGrade })
        .from(plans).where(and(inArray(plans.clientId, ids), eq(plans.track, "coach"))),
    ]);
  }

  const today = todayISO();
  const in7 = addDaysISO(today, 7);
  const in30 = addDaysISO(today, 30);

  const upcoming = reviewRows
    .filter((r) => r.nextAppt && r.nextAppt >= today)
    .map((r) => ({ clientId: r.clientId, clientName: nameOf.get(r.clientId) ?? "", date: r.nextAppt as string, type: r.type }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const thisWeek = upcoming.filter((a) => a.date <= in7);
  const thisMonth = upcoming.filter((a) => a.date <= in30);

  // 逾期未檢視：已排的下次預約日已過（每位客戶取最近一筆）。
  const overdueMap = new Map<string, OverdueItem>();
  for (const r of reviewRows) {
    if (r.nextAppt && r.nextAppt < today) {
      const prev = overdueMap.get(r.clientId);
      if (!prev || r.nextAppt > prev.date) {
        overdueMap.set(r.clientId, { clientId: r.clientId, clientName: nameOf.get(r.clientId) ?? "", date: r.nextAppt, type: r.type });
      }
    }
  }
  const overdue = [...overdueMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  const openItems: OpenActionItem[] = itemRows
    .filter((i) => !i.done)
    .map((i) => ({
      id: i.id,
      clientId: i.clientId,
      clientName: nameOf.get(i.clientId) ?? "",
      title: i.title,
      owner: i.owner,
      dueDate: i.dueDate,
      overdue: !!i.dueDate && i.dueDate < today,
    }))
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });

  // 分佈
  const byStatus: Record<string, number> = {};
  for (const c of clientRows) {
    inc(byStatus, c.status);
  }
  // 等級分佈：取每位客戶最新版本的等級。
  const latestPlanByClient = new Map<string, (typeof planRows)[number]>();
  for (const p of planRows) {
    const prev = latestPlanByClient.get(p.clientId);
    if (!prev || p.year > prev.year || (p.year === prev.year && ts(p.createdAt) > ts(prev.createdAt))) {
      latestPlanByClient.set(p.clientId, p);
    }
  }
  const byGrade: Record<string, number> = {};
  for (const c of clientRows) {
    const lp = latestPlanByClient.get(c.id);
    inc(byGrade, lp?.healthGrade || "未評");
  }

  return {
    counts: {
      total: clientRows.length,
      active: clientRows.filter((c) => c.status === "active").length,
      upcomingWeek: thisWeek.length,
      openItems: openItems.length,
    },
    thisWeek,
    thisMonth,
    overdue,
    openItems,
    byStatus,
    byGrade,
  };
}
