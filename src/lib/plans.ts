// 年度版本資料層。所有存取都驗證該版本屬於當前教練（plans → clients.coachId）。
//
// ⚠️ 這支檔案只處理「教練那一軌」（track='coach'）。客戶自己的人生護照（track='client'）
// 一律走 lib/clientPlan.ts，教練不得經由這裡讀寫。
// track 條件寫在 ownedPlan / ownedPlanLite / ownedTrackedRows 裡面而不是交給呼叫端加，
// 因為「忘記加 where」正是這個模型出過事的地方——邊界要守在資料層，不是守在每個呼叫點。
const COACH_TRACK = "coach";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, plans } from "@/Shared/db/schema";
import { newCaseData, planMetrics, planSnapshot, type PlanMetrics } from "./snapshot";

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
    .where(and(eq(plans.id, planId), eq(clients.coachId, coachId), eq(plans.track, COACH_TRACK)))
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
    .where(and(eq(plans.id, planId), eq(clients.coachId, coachId), eq(plans.track, COACH_TRACK)))
    .limit(1);
  return row ?? null;
}

async function ownedClientId(coachId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.coachId, coachId)))
    .limit(1);
  return !!row;
}

export async function getPlan(coachId: string, planId: string): Promise<Plan | null> {
  return ownedPlan(coachId, planId);
}

// 存回 iframe 編輯的整份案件，同時用引擎重算快照。
export async function updatePlanData(coachId: string, planId: string, data: unknown): Promise<{ netWorth: number | null; healthGrade: string | null }> {
  const plan = await ownedPlanLite(coachId, planId);
  if (!plan) throw new Error("forbidden");
  const snap = planSnapshot(data);
  await db
    .update(plans)
    .set({ data, healthGrade: snap.healthGrade, netWorth: snap.netWorth, updatedAt: new Date() })
    .where(eq(plans.id, planId));
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

// 手動新增一份空白年度版本。
export async function createPlan(coachId: string, clientId: string, name: string, year?: number): Promise<string> {
  if (!(await ownedClientId(coachId, clientId))) throw new Error("forbidden");
  const y = year ?? new Date().getFullYear();
  const data = newCaseData(name);
  const snap = planSnapshot(data);
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
  return row.id;
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
  if (!(await ownedClientId(coachId, clientId))) throw new Error("forbidden");
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
