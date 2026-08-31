// 年度版本資料層。所有存取都驗證該版本屬於當前教練（plans → clients.coachId）。
//
// ⚠️ 這支檔案只處理「教練那一軌」（track='coach'）。客戶自己的人生護照（track='client'）
// 一律走 lib/clientPlan.ts，教練不得經由這裡讀寫。
// track 條件寫在 ownedPlan / ownedPlanLite / ownedTrackedRows 裡面而不是交給呼叫端加，
// 因為「忘記加 where」正是這個模型出過事的地方——邊界要守在資料層，不是守在每個呼叫點。
const COACH_TRACK = "coach";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, plans } from "@/Shared/db/schema";
import { newCaseData, planMetrics, planSnapshot, type PlanMetrics } from "./snapshot";
import { ownedClient, readableClient } from "./clientScope";
import { caseBirthDate } from "./birthSync";

export type Plan = typeof plans.$inferSelect;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// 完整列（含 data jsonb）：只有真的要用 data 的路徑才呼叫（getPlan / clonePlan）。
async function ownedPlan(coachId: string, planId: string): Promise<Plan | null> {
  const [row] = await db
    .select({ plan: plans })
    .from(plans)
    .innerJoin(clients, eq(plans.clientId, clients.id))
    .where(and(eq(plans.id, planId), ownedClient(coachId), eq(plans.track, COACH_TRACK)))
    .limit(1);
  return row?.plan ?? null;
}

// 讀取版（含 data）：主責 **或** 已接受的協作教練。只給「開報告書來看」與版本紀錄用，
// 任何寫入請走 ownedPlan/ownedPlanLite —— 它們認的是主責，不是可見範圍。
async function readablePlan(coachId: string, planId: string): Promise<Plan | null> {
  const [row] = await db
    .select({ plan: plans })
    .from(plans)
    .innerJoin(clients, eq(plans.clientId, clients.id))
    .where(and(eq(plans.id, planId), readableClient(coachId), eq(plans.track, COACH_TRACK)))
    .limit(1);
  return row?.plan ?? null;
}

// 輕量版：只做「這份 plan 是不是我的」驗證，不撈 data。
// PlanEditor 是 700ms debounce 自動存檔，一小時編輯約 100 次；
// 每次都因為權限檢查回讀 20KB 的 jsonb 是純浪費。
type PlanLite = { id: string; clientId: string; year: number; label: string | null; status: string; track: string };
async function ownedPlanLite(coachId: string, planId: string): Promise<PlanLite | null> {
  const [row] = await db
    .select({ id: plans.id, clientId: plans.clientId, year: plans.year, label: plans.label, status: plans.status, track: plans.track })
    .from(plans)
    .innerJoin(clients, eq(plans.clientId, clients.id))
    .where(and(eq(plans.id, planId), ownedClient(coachId), eq(plans.track, COACH_TRACK)))
    .limit(1);
  return row ?? null;
}

async function ownedClientId(coachId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), ownedClient(coachId)))
    .limit(1);
  return !!row;
}

async function readableClientId(coachId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), readableClient(coachId)))
    .limit(1);
  return !!row;
}

/** 主責才拿得到。⚠️ 寫入路徑（回復版本等）一律用這支，不要換成 getPlanForRead()。 */
export async function getPlan(coachId: string, planId: string): Promise<Plan | null> {
  return ownedPlan(coachId, planId);
}

/** 讀取用：協作教練也拿得到（畫面端必須連帶把 readOnly 打開）。 */
export async function getPlanForRead(coachId: string, planId: string): Promise<Plan | null> {
  return readablePlan(coachId, planId);
}

// 存回 iframe 編輯的整份案件，同時用引擎重算快照。
export async function updatePlanData(coachId: string, planId: string, data: unknown): Promise<{ netWorth: number | null; healthGrade: string | null }> {
  // ⚠️ 形狀先擋，不能讓 undefined 走進去。
  // Drizzle 對 `data: undefined` 的處理是「這一欄不要寫」，但同一句裡的
  // healthGrade / netWorth 是照算照寫的 —— 於是 data 保持原樣、快照被 planSnapshot(undefined)
  // 算成 null，列表上這位客戶的財務階段與淨值當場整欄清空，而畫面沒有任何錯誤。
  // 後面 logRevision(..., undefined) 撞 plan_revisions.data 的 notNull，
  // 又被 lib/revisions.ts 的 try/catch 靜默吞掉，連版本歷史都不會留下線索。
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad-plan-data");
  const plan = await ownedPlanLite(coachId, planId);
  if (!plan) throw new Error("forbidden");
  const snap = planSnapshot(data);
  const write = db
    .update(plans)
    .set({ data, healthGrade: snap.healthGrade, netWorth: snap.netWorth, updatedAt: new Date() })
    .where(eq(plans.id, planId));
  // 生日有兩個家：clients.birth_date（客戶主檔）與 plans.data.profile.birth（規劃內容）。
  // 教練在規劃器的家庭成員改了生日，主檔要跟上——否則下一份年度版本又是空的、又要重打一次。
  // ⚠️ 只在「主檔還沒有」或「跟規劃不一樣」時才寫，避免每次存檔都多打一次 DB。
  // ⚠️ neon-http 沒有交易，用 db.batch() 讓兩句一起送。
  const birth = caseBirthDate(data);
  if (birth) {
    const syncBirth = db
      .update(clients)
      .set({ birthDate: birth })
      .where(and(eq(clients.id, plan.clientId), or(isNull(clients.birthDate), ne(clients.birthDate, birth))));
    await db.batch([write, syncBirth]);
  } else {
    await write;
  }
  return snap;
}


export type PlanMetaPatch = {
  label?: string | null;
  status?: string;
  basedOnDate?: string | null;
  year?: number;
};

export async function updatePlanMeta(coachId: string, planId: string, patch: PlanMetaPatch): Promise<void> {
  const plan = await ownedPlanLite(coachId, planId);
  if (!plan) throw new Error("forbidden");
  await db
    .update(plans)
    .set({
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.basedOnDate !== undefined ? { basedOnDate: patch.basedOnDate } : {}),
      ...(patch.year !== undefined ? { year: patch.year } : {}),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));
}

// 年度重製：以來源版複製成新的一年（year 取客戶現有最大年 +1），狀態草稿。
export async function clonePlan(coachId: string, planId: string): Promise<string> {
  const src = await ownedPlan(coachId, planId);
  if (!src) throw new Error("forbidden");
  // 只算教練那一軌：客戶的人生護照份也掛在同一個 clientId 底下，
  // 把它算進 max(year) 會讓「重製」憑空跳過一個年度。
  const yearsRows = await db
    .select({ year: plans.year })
    .from(plans)
    .where(and(eq(plans.clientId, src.clientId), eq(plans.track, COACH_TRACK)));
  const maxYear = yearsRows.reduce((m, r) => Math.max(m, r.year), src.year);
  const newYear = maxYear + 1;
  const snap = planSnapshot(src.data);
  const [row] = await db
    .insert(plans)
    .values({
      clientId: src.clientId,
      year: newYear,
      label: `${newYear} 重製版`,
      status: "draft",
      basedOnDate: todayISO(),
      data: src.data,
      healthGrade: snap.healthGrade,
      netWorth: snap.netWorth,
    })
    .returning({ id: plans.id });
  return row.id;
}

/**
 * 「已經有這一年的版本了」是使用者做得完的事（改年份、或改去編輯既有那一份），
 * 所以它是回傳值不是例外 —— unique violation 往上丟只會變成 Next 的 digest 亂碼。
 * 權限不足仍然 throw("forbidden")：那是資料層的邊界，跟其他寫入路徑一致。
 */
export type CreatePlanOutcome = { ok: true; planId: string } | { ok: false; error: string };

/** Postgres 23505＝unique_violation。neon-http 把原始錯誤包了一層，兩層都看。 */
function isUniqueViolation(e: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as { code?: unknown; cause?: unknown };
    if (o.code === "23505") return true;
    cur = o.cause;
  }
  return /duplicate key value|plans_client_id_year_track_uidx/.test(
    e instanceof Error ? e.message : String(e),
  );
}

// 手動新增一份空白年度版本。
export async function createPlan(coachId: string, clientId: string, name: string, year?: number): Promise<CreatePlanOutcome> {
  if (!(await ownedClientId(coachId, clientId))) throw new Error("forbidden");
  // ⚠️ 預設年份是「教練軌現有最大年 +1」，不是今年。
  // createClient() 已經替每位新客戶建好一份「今年 + coach 軌」的初版，
  // 所以舊的 `new Date().getFullYear()` 在最常見的情境（剛建的客戶按一下「新增版本」）
  // 是**必定**撞上 plans_client_id_year_track_uidx 的。
  // 這裡與 clonePlan 用同一條規則（同樣只算 coach 軌：客戶的人生護照也掛在同一個
  // clientId 底下，算進去會讓年度憑空跳一格）。
  let y = year;
  if (y === undefined) {
    const yearsRows = await db
      .select({ year: plans.year })
      .from(plans)
      .where(and(eq(plans.clientId, clientId), eq(plans.track, COACH_TRACK)));
    y = yearsRows.length
      ? yearsRows.reduce((m, r) => Math.max(m, r.year), yearsRows[0].year) + 1
      : new Date().getFullYear();
  }
  const data = newCaseData(name);
  const snap = planSnapshot(data);
  try {
    const [row] = await db
      .insert(plans)
      .values({
        clientId,
        year: y,
        label: `${y} 新版`,
        status: "draft",
        basedOnDate: todayISO(),
        data,
        healthGrade: snap.healthGrade,
        netWorth: snap.netWorth,
      })
      .returning({ id: plans.id });
    return { ok: true, planId: row.id };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false, error: `${y} 年已經有一份版本了，請改用年度重製，或先修改既有那一份的年份。` };
    }
    throw e;
  }
}

export async function deletePlan(coachId: string, planId: string): Promise<void> {
  const plan = await ownedPlanLite(coachId, planId);
  if (!plan) throw new Error("forbidden");
  await db.delete(plans).where(eq(plans.id, planId));
}

export type PlanComparison = {
  id: string;
  year: number;
  label: string | null;
  status: string;
} & PlanMetrics;

// 版本比較：用引擎從各版 data 算跨年對照。
export async function comparePlans(coachId: string, clientId: string): Promise<PlanComparison[]> {
  // 純讀（跨年對照圖），協作教練也看得到。
  if (!(await readableClientId(coachId, clientId))) throw new Error("forbidden");
  // 只比教練那一軌。客戶的護照份是同一年的另一筆，混進來會變成兩欄一樣的年份，
  // 而且它只有五面向推估、沒有完整現況，跨年趨勢會直接失真。
  const rows = await db
    .select({ id: plans.id, year: plans.year, label: plans.label, status: plans.status, data: plans.data })
    .from(plans)
    .where(and(eq(plans.clientId, clientId), eq(plans.track, COACH_TRACK)))
    .orderBy(asc(plans.year), asc(plans.createdAt));
  return rows.map((p) => ({
    id: p.id,
    year: p.year,
    label: p.label,
    status: p.status,
    ...planMetrics(p.data),
  }));
}
