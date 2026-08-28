// 客戶資料層（教練隔離）。所有查詢都以 coachId 為租戶維度。
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clientCollaborators, clients, coachDisplayName, coaches, plans, reviews } from "@/Shared/db/schema";
import { newCaseData, planSnapshot } from "./snapshot";
import { allocCode } from "./codeAlloc";
import { COLLAB_ACCEPTED, ownedClient, readableClient } from "./clientScope";

const COACH_TRACK = "coach";
const CLIENT_TRACK = "client";

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

/** 共同執案（唯讀）看到的別人的客戶：多帶一個主責教練姓名，清單上要分得出來這不是自己的案子。 */
export type SharedClientItem = ClientListItem & { ownerName: string | null };

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
  const rows = await db.select().from(clients).where(ownedClient(coachId)).orderBy(desc(clients.updatedAt));
  return decorateClients(rows);
}

/**
 * 共同執案（唯讀）：別人邀我一起看的客戶。
 *
 * 刻意跟 listClientsForCoach 分兩支回、畫面上也分兩區：混在同一份清單裡，
 * 教練會以為那是自己的案子（而所有寫入其實都會被擋），也會讓「額度 x/y」的分母說謊——
 * 客戶數上限只算 clients.coach_id（見 lib/quota.ts），協作案件本來就不佔額度。
 */
export async function listSharedClientsForCoach(coachId: string): Promise<SharedClientItem[]> {
  const rows = await db
    .select({ client: clients, ownerName: coachDisplayName })
    .from(clientCollaborators)
    .innerJoin(clients, eq(clients.id, clientCollaborators.clientId))
    .leftJoin(coaches, eq(coaches.id, clients.coachId))
    .where(and(eq(clientCollaborators.coachId, coachId), eq(clientCollaborators.status, COLLAB_ACCEPTED)))
    .orderBy(desc(clients.updatedAt));
  const decorated = await decorateClients(rows.map((r) => r.client));
  const ownerById = new Map(rows.map((r) => [r.client.id, r.ownerName]));
  return decorated.map((c) => ({ ...c, ownerName: ownerById.get(c.id) ?? null }));
}

async function decorateClients(rows: Client[]): Promise<ClientListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  // ⚠️ 明列欄位，不要 select() 整列 —— plans.data 是整份 case（約 20KB/份）。
  // 200 位客戶 × 2 份 plan ＝ 8MB 以 JSON 文字傳回 Node，再被 filter 丟掉 99.9%。
  const planRows = await db.select({
    id: plans.id, clientId: plans.clientId, year: plans.year, label: plans.label,
    status: plans.status, healthGrade: plans.healthGrade, netWorth: plans.netWorth, createdAt: plans.createdAt,
    // 只取教練那一軌：客戶的人生護照份也掛在同一個 clientId 底下，
    // 混進來會頂掉 latestPlan，讓列表的財務階段／淨值顯示護照骨架的數字（量級差很多），
    // 依 net／stage 的排序也會整欄錯位。
  }).from(plans).where(and(inArray(plans.clientId, ids), eq(plans.track, COACH_TRACK)));
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
      // 客戶編號在「建立那一刻」發，之後不再變動（規則見 lib/codes.ts）。
      code: await allocCode("client"),
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

/**
 * 主責才拿得到（寫入路徑一律用這支）。
 * ⚠️ 不要為了讓協作教練看得到就把這裡改成 readableClient() —— 每一支寫入
 * （updateClient / createPlan / createReview…）都是靠它擋人的。要讀請用 getClientForRead()。
 */
export async function getClient(coachId: string, clientId: string): Promise<Client | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), ownedClient(coachId)))
    .limit(1);
  return row ?? null;
}

/** 讀取用：主責或已接受的協作教練都拿得到。 */
export async function getClientForRead(coachId: string, clientId: string): Promise<Client | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), readableClient(coachId)))
    .limit(1);
  return row ?? null;
}

// plans 不含 data jsonb（詳情頁只顯示中繼資料；要算指標請用 comparePlans）。
export type PlanMeta = Omit<Plan, "data">;

export type ClientDetail = {
  client: Client;
  plans: PlanMeta[];            // 只有教練那一軌（track='coach'）
  passportPlan: PlanMeta | null; // 客戶自己的人生護照（track='client'）；教練唯讀
  reviews: Review[];
  actionItems: ActionItem[];
};

export async function getClientDetail(coachId: string, clientId: string): Promise<ClientDetail | null> {
  // 讀取範圍：協作教練也看得到整份（唯讀）。寫入仍然只認主責。
  const client = await getClientForRead(coachId, clientId);
  if (!client) return null;
  // 同上：客戶詳情頁只顯示各版本的中繼資料，不需要整份 data
  //（版本比較的 planMetrics 由 comparePlans 另外撈，避免同一批 jsonb 被完整拉兩次）。
  const [planRows, reviewRows, itemRows] = await Promise.all([
    db.select({
      id: plans.id, clientId: plans.clientId, year: plans.year, track: plans.track, label: plans.label, status: plans.status,
      basedOnDate: plans.basedOnDate, healthGrade: plans.healthGrade, netWorth: plans.netWorth,
      createdAt: plans.createdAt, updatedAt: plans.updatedAt,
    }).from(plans).where(eq(plans.clientId, clientId)).orderBy(desc(plans.year), desc(plans.createdAt)),

    // ⚠️ 依「日期」排不是建立時間——教練會補記過去的諮詢，要落回它自己的日期。
    // 建立時間只當同一天兩場時的次要鍵（少了它，同日兩筆的先後每次查都可能不一樣）。
    db.select().from(reviews).where(eq(reviews.clientId, clientId)).orderBy(desc(reviews.date), desc(reviews.createdAt)),
    db.select().from(actionItems).where(eq(actionItems.clientId, clientId)).orderBy(asc(actionItems.done), asc(actionItems.dueDate)),
  ]);
  // 兩軌分開回：`plans` 只給教練的年度版（UI 上帶著編輯／複製／刪除／改狀態等操作），
  // 客戶的人生護照另外單獨回一筆。混在同一份清單裡的話，那些操作鈕就等於架在客戶的資料上——
  // 刪除會連 plan_revisions 一起 CASCADE，客戶整條版本歷史永久消失。
  const coachPlans = planRows.filter((p) => p.track === COACH_TRACK);
  const passportPlan = planRows.find((p) => p.track === CLIENT_TRACK) ?? null;
  return { client, plans: coachPlans, passportPlan, reviews: reviewRows, actionItems: itemRows };
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
