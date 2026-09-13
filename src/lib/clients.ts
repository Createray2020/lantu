// 客戶資料層（教練隔離）。所有查詢都以 coachId 為租戶維度。
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clientCollaborators, clients, coachDisplayName, coaches, compCases, plans, reviews } from "@/Shared/db/schema";
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

/**
 * 新客戶：建立客戶身份 + 自動建第一份年度版本（草稿）。
 *
 * ⚠️ 兩句寫入必須是原子的。舊版是「insert clients → insert plans」兩趟往返，
 * 中間斷掉就留下一位**一份規劃都沒有**的客戶：詳情頁空白、沒有東西可編輯，
 * 而「新增版本」在修好之前又預設今年、正好撞上這位客戶不存在的那份初版的唯一鍵，
 * 等於救不回來，只能刪掉重建（連客戶編號都白發一組）。
 *
 * neon-http 驅動沒有互動式交易（db.transaction() 會直接丟錯），但 db.batch() 是單一交易。
 * batch 裡拿不到前一句的 returning 值來當後一句的參數，所以 client id 自己先產：
 * uuid v4 由 Node 產跟由 Postgres 的 gen_random_uuid() 產，對這張表沒有任何差別。
 */
export async function createClient(coachId: string, input: ClientInput): Promise<string> {
  const clientId = randomUUID();
  const year = new Date().getFullYear();
  const data = newCaseData(input.name);
  const snap = planSnapshot(data);
  // 發號本身會寫 code_counters，不能放進 batch（放進去等於同一筆號碼在交易外先被消耗）。
  const code = await allocCode("client");

  await db.batch([
    db.insert(clients).values({
      id: clientId,
      coachId,
      name: input.name,
      source: input.source ?? null,
      lifeStage: input.lifeStage ?? null,
      tags: input.tags ?? [],
      contact: input.contact ?? {},
      birthDate: input.birthDate ?? null,
      status: input.status ?? "active",
      // 客戶編號在「建立那一刻」發，之後不再變動（規則見 lib/codes.ts）。
      code,
    }),
    db.insert(plans).values({
      clientId,
      year,
      label: `${year} 初版`,
      status: "draft",
      basedOnDate: todayISO(),
      data,
      healthGrade: snap.healthGrade,
      netWorth: snap.netWorth,
    }),
  ]);
  return clientId;
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

/* ───────── 永久刪除一位客戶 ─────────
 *
 * ⚠️⚠️ 封存與刪除是兩件不同的事，不要把這一支當成「比較徹底的封存」：
 *   封存＝`status='archived'`，資料一個字都沒動，換到的只有額度（usedClientCount()
 *         排除 archived），列表用篩選照樣找得到。
 *   刪除＝整列消失，plans / reviews / action_items / client_notes / consult_sessions /
 *         client_risk_quiz / coach_link_requests / client_collaborators 全部 CASCADE
 *         跟著走。救不回來。
 *
 * 三道門檻是刻意的，比照 lib/templates.ts 的 purgeTemplate()：
 *   1. 只准刪**已封存**的 —— 要刪得先經過「封存 → 確認真的不再服務 → 再刪」的順序，
 *      而不是在清單上一鍵消失。
 *   2. 要打對客戶姓名 —— 而且**這道驗證在 server 端也做**。只擋在 UI 的話，
 *      門檻等於沒有：任何人繞過畫面直接呼叫 action 就刪掉了。
 *   3. 有分潤案件（comp_cases）的一律不准刪 —— 那是財務紀錄。comp_cases.client_id
 *      是 `set null`，刪掉客戶案件會留著卻從此指不到人，稽核時對不出那筆是誰的。
 *
 * ⚠️ 自助客戶（人生護照）要知道的事：clients.client_user_id 的 cascade 是**反向**的
 *    （刪帳號會連帶刪客戶列，刪客戶列不會動帳號），而 clientPlan.ts 的
 *    ensure 邏輯是「這個帳號找不到客戶列就當場建一筆新的」。所以刪掉這種客戶之後，
 *    他下次登入會安靜地變成一位全新的空白客戶、拿到新的客戶編號，舊的人生護照資料
 *    救不回來。這裡刻意**不擋**（擋掉的話最常見的清理對象——自助註冊的測試帳號——
 *    就永遠刪不掉），由畫面在確認框把這句話講明白。
 */
export type DeleteBlock =
  | "not-found"      // 不是你的客戶，或根本不存在
  | "template"       // 範本走後台的 purgeTemplate()，不走這條
  | "not-archived"   // 還沒封存
  | "name-mismatch"  // 姓名打錯
  | "has-comp";      // 有分潤案件

export const DELETE_BLOCK_MESSAGE: Record<DeleteBlock, string> = {
  "not-found": "找不到這位客戶，或你不是他的主責教練。",
  template: "示範範本不從這裡刪除。",
  "not-archived": "只能刪除已封存的客戶。請先封存，確認真的不再服務他，再回來刪除。",
  "name-mismatch": "客戶姓名沒有打對，沒有刪除任何東西。",
  "has-comp": "這位客戶有分潤案件，不能刪除——那是財務紀錄，案件會留著卻指不到人。只能封存。",
};

export type Deletable =
  | { ok: true; name: string; hasLogin: boolean }
  | { ok: false; reason: DeleteBlock; compCases?: number };

/** 預檢：畫面在按下去之前就能說出「為什麼不能刪」，而不是按了才吐錯。 */
export async function clientDeletable(coachId: string, clientId: string): Promise<Deletable> {
  const c = await getClient(coachId, clientId);
  if (!c) return { ok: false, reason: "not-found" };
  if (c.isTemplate) return { ok: false, reason: "template" };
  if (c.status !== "archived") return { ok: false, reason: "not-archived" };
  const n = await compCaseCount(clientId);
  if (n > 0) return { ok: false, reason: "has-comp", compCases: n };
  return { ok: true, name: c.name, hasLogin: !!c.clientUserId };
}

async function compCaseCount(clientId: string): Promise<number> {
  const r = await db.select({ n: count() }).from(compCases).where(eq(compCases.clientId, clientId));
  return Number(r[0]?.n ?? 0);
}

export type DeleteOutcome = { ok: true } | { ok: false; reason: DeleteBlock };

export async function deleteClient(coachId: string, clientId: string, confirmName: string): Promise<DeleteOutcome> {
  const pre = await clientDeletable(coachId, clientId);
  if (!pre.ok) return { ok: false, reason: pre.reason };
  // ⚠️ 姓名比對在 server 端也做一次（見檔頭第 2 點）。正規化只做前後空白：
  //    大小寫與全半形刻意不放寬——這一步的用途就是逼人慢下來看清楚刪的是誰。
  if (confirmName.trim() !== pre.name.trim()) return { ok: false, reason: "name-mismatch" };
  // ⚠️ WHERE 重帶 status/is_template，不是只靠上面的預檢：兩次查詢之間狀態被改掉
  //    （另一個分頁解除了封存）時，這一句什麼都不會刪，而不是刪掉一位活著的客戶。
  await db
    .delete(clients)
    .where(and(eq(clients.id, clientId), ownedClient(coachId), eq(clients.status, "archived"), eq(clients.isTemplate, false)));
  return { ok: true };
}
