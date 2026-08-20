// 教育費用參數表（伺服器端讀寫）。與 financeCategories 同一個模式：
// unstable_cache + tag，後台一存 updateTag，iframe app 下次載入就吃到新數字。
import { unstable_cache, updateTag } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { eduCostParams } from "@/Shared/db/schema";
import { EDU_COST_DEFAULTS, type EduCostSeed } from "./eduCosts.defaults";

export const EDU_COST_TAG = "edu-costs";

export type EduCostRow = EduCostSeed & { sortOrder: number };

export async function listEduCosts(): Promise<EduCostRow[]> {
  const rows = await db.select().from(eduCostParams).orderBy(asc(eduCostParams.sortOrder));
  return rows.map((r) => ({
    stage: r.stage,
    startAge: r.startAge,
    years: r.years,
    publicTuition: r.publicTuition,
    privateTuition: r.privateTuition,
    overseasTuition: r.overseasTuition,
    extraFee: r.extraFee,
    careFee: r.careFee,
    source: r.source ?? "",
    sortOrder: r.sortOrder,
  }));
}

export function defaultEduCosts(): EduCostRow[] {
  return EDU_COST_DEFAULTS.map((s, i) => ({ ...s, sortOrder: i }));
}

export const getEduCosts = unstable_cache(
  async (): Promise<EduCostRow[]> => {
    const rows = await listEduCosts();
    return rows.length ? rows : defaultEduCosts();
  },
  ["lantu-edu-costs"],
  { tags: [EDU_COST_TAG] },
);

export type EduCostInput = {
  stage: string;
  startAge: number;
  years: number;
  publicTuition: number;
  privateTuition: number;
  overseasTuition: number;
  extraFee: number;
  careFee: number;
  source?: string;
};

const int = (v: unknown, field: string): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid-${field}`);
  return n;
};

export function normalizeEduCost(input: EduCostInput) {
  const stage = (input.stage ?? "").trim();
  if (!stage) throw new Error("empty-stage");
  const years = int(input.years, "years");
  if (years < 1 || years > 12) throw new Error("invalid-years");
  const startAge = int(input.startAge, "startAge");
  if (startAge > 40) throw new Error("invalid-startAge");
  return {
    stage,
    startAge,
    years,
    publicTuition: int(input.publicTuition, "publicTuition"),
    privateTuition: int(input.privateTuition, "privateTuition"),
    overseasTuition: int(input.overseasTuition, "overseasTuition"),
    extraFee: int(input.extraFee, "extraFee"),
    careFee: int(input.careFee, "careFee"),
    source: (input.source ?? "").trim() || null,
  };
}

export async function saveEduCost(input: EduCostInput): Promise<void> {
  const v = normalizeEduCost(input);
  await db
    .insert(eduCostParams)
    .values({ ...v, sortOrder: v.startAge })
    .onConflictDoUpdate({
      target: eduCostParams.stage,
      set: { ...v, sortOrder: v.startAge, updatedAt: new Date() },
    });
  updateTag(EDU_COST_TAG);
}

export async function deleteEduCost(stage: string): Promise<void> {
  await db.delete(eduCostParams).where(eq(eduCostParams.stage, stage));
  updateTag(EDU_COST_TAG);
}

// 後台「回復官方預設值」：把 seed 整份覆蓋回去（會蓋掉手改的數字，按鈕要有二次確認）。
export async function resetEduCosts(): Promise<void> {
  for (const [i, s] of EDU_COST_DEFAULTS.entries()) {
    await db
      .insert(eduCostParams)
      .values({ ...s, sortOrder: i })
      .onConflictDoUpdate({
        target: eduCostParams.stage,
        set: { ...s, sortOrder: i, updatedAt: new Date() },
      });
  }
  updateTag(EDU_COST_TAG);
}
