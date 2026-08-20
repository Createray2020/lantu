// 客戶資料層（教練隔離）。所有查詢都以 coachId 為租戶維度。
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clients, plans, reviews } from "@/Shared/db/schema";
import { newCaseData, planSnapshot } from "./snapshot";

export type Client = typeof clients.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type ActionItem = typeof actionItems.$inferSelect;

export type LatestPlan = {
  id: string;
  year: number;
  label: string | null;
  status: string;
  healthGrade: string | null;
  netWorth: number | null;
};

export type ClientListItem = Client & {
  latestPlan: LatestPlan | null;
  planCount: number;
  lastReviewDate: string | null;
  nextAppt: string | null;
};

export type ClientContact = { phone?: string; email?: string; line?: string };
export type ClientInput = {
  name: string;
  source?: string | null;
  lifeStage?: string | null;
  tags?: string[];
  contact?: ClientContact;
  birthDate?: string | null;
  status?: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function ts(d: Date | null): number {
  return d ? d.getTime() : 0;
}

// 客戶列表：帶最新版本、上次諮詢、下次預約。
export async function listClientsForCoach(coachId: string): Promise<ClientListItem[]> {
  const rows = await db.select().from(clients).where(eq(clients.coachId, coachId)).orderBy(desc(clients.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  // ⚠️ 明列欄位，不要 select() 整列 —— plans.data 是整份 case（約 20KB/份）。
  // 200 位客戶 × 2 份 plan ＝ 8MB 以 JSON 文字傳回 Node，再被 filter 丟掉 99.9%。
  const planRows = await db.select({
    id: plans.id, clientId: plans.clientId, year: plans.year, label: plans.label,
    status: plans.status, healthGrade: plans.healthGrade, netWorth: plans.netWorth, createdAt: plans.createdAt,
  }).from(plans).where(inArray(plans.clientId, ids));
  const reviewRows = await db.select({
    clientId: reviews.clientId, date: reviews.date, nextAppt: reviews.nextAppt,
  }).from(reviews).where(inArray(reviews.clientId, ids));
  const today = todayISO();

  return rows.map((c) => {
    const cp = planRows
      .filter((p) => p.clientId === c.id)
      .sort((a, b) => b.year - a.year || ts(b.createdAt) - ts(a.createdAt));
    const latest = cp[0] ?? null;
    const cr = reviewRows.filter((r) => r.clientId === c.id);
    const past = cr.map((r) => r.date).filter((d) => d <= today).sort();
    const upcoming = cr
      .map((r) => r.nextAppt)
      .filter((d): d is string => !!d && d >= today)
      .sort();
    return {
      ...c,
      latestPlan: latest
        ? { id: latest.id, year: latest.year, label: latest.label, status: latest.status, healthGrade: latest.healthGrade, netWorth: latest.netWorth }
        : null,
      planCount: cp.length,
      lastReviewDate: past.length ? past[past.length - 1] : null,
      nextAppt: upcoming.length ? upcoming[0] : null,
    };
  });
}

// 新客戶：建立客戶身份 + 自動建第一份年度版本（草稿）。
export async function createClient(coachId: string, input: ClientInput): Promise<string> {
  const [row] = await db
    .insert(clients)
    .values({
      coachId,
      name: input.name,
      source: input.source ?? null,
      lifeStage: input.lifeStage ?? null,
      tags: input.tags ?? [],
      contact: input.contact ?? {},
      birthDate: input.birthDate ?? null,
      status: input.status ?? "active",
    })
    .returning({ id: clients.id });

  const year = new Date().getFullYear();
  const data = newCaseData(input.name);
  const snap = planSnapshot(data);
  await db.insert(plans).values({
    clientId: row.id,
    year,
    label: `${year} 初版`,
    status: "draft",
    basedOnDate: todayISO(),
    data,
    healthGrade: snap.healthGrade,
    netWorth: snap.netWorth,
  });
  return row.id;
}

export async function getClient(coachId: string, clientId: string): Promise<Client | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.coachId, coachId)))
    .limit(1);
  return row ?? null;
}

// plans 不含 data jsonb（詳情頁只顯示中繼資料；要算指標請用 comparePlans）。
export type PlanMeta = Omit<Plan, "data">;

export type ClientDetail = {
  client: Client;
  plans: PlanMeta[];
  reviews: Review[];
  actionItems: ActionItem[];
};

export async function getClientDetail(coachId: string, clientId: string): Promise<ClientDetail | null> {
  const client = await getClient(coachId, clientId);
  if (!client) return null;
  // 同上：客戶詳情頁只顯示各版本的中繼資料，不需要整份 data
  //（版本比較的 planMetrics 由 comparePlans 另外撈，避免同一批 jsonb 被完整拉兩次）。
  const [planRows, reviewRows, itemRows] = await Promise.all([
    db.select({
      id: plans.id, clientId: plans.clientId, year: plans.year, track: plans.track, label: plans.label, status: plans.status,
      basedOnDate: plans.basedOnDate, healthGrade: plans.healthGrade, netWorth: plans.netWorth,
      createdAt: plans.createdAt, updatedAt: plans.updatedAt,
    }).from(plans).where(eq(plans.clientId, clientId)).orderBy(desc(plans.year), desc(plans.createdAt)),
    db.select().from(reviews).where(eq(reviews.clientId, clientId)).orderBy(desc(reviews.date)),
    db.select().from(actionItems).where(eq(actionItems.clientId, clientId)).orderBy(asc(actionItems.done), asc(actionItems.dueDate)),
  ]);
  return { client, plans: planRows, reviews: reviewRows, actionItems: itemRows };
}

export async function updateClient(coachId: string, clientId: string, patch: Partial<ClientInput>): Promise<void> {
  const owned = await getClient(coachId, clientId);
  if (!owned) throw new Error("forbidden");
  await db
    .update(clients)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.lifeStage !== undefined ? { lifeStage: patch.lifeStage } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.contact !== undefined ? { contact: patch.contact } : {}),
      ...(patch.birthDate !== undefined ? { birthDate: patch.birthDate } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));
}

export async function setClientStatus(coachId: string, clientId: string, status: string): Promise<void> {
  await updateClient(coachId, clientId, { status });
}
