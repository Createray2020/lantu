// 收支資債細類字典（伺服器端讀寫）。
// 讀取被 /api/finance-categories 每次載入 iframe app 時打，所以走 unstable_cache + tag；
// 後台一寫入就 updateTag，教練重新整理立刻看到新選項。
import { unstable_cache, updateTag } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { financeCategories } from "@/Shared/db/schema";
import {
  CAT_PARENTS,
  DEFAULT_FINANCE_CATEGORIES,
  type CatKind,
} from "./financeCategories.defaults";

export const FIN_CAT_TAG = "finance-categories";

export type FinCatRow = {
  id: string;
  kind: CatKind;
  parent: string;
  label: string;
  riskAsset: boolean;
  liquidity: string | null;
  consumer: boolean;
  needsNote: boolean;
  sortOrder: number;
  active: boolean;
  isSystem: boolean;
};

// 給 iframe app 吃的精簡格式（欄位縮短：這份 JSON 每次開分頁都會傳）
export type FinCatPayload = Record<
  CatKind,
  Array<{ label: string; parent: string; risk?: boolean; liq?: string; consumer?: boolean; note?: boolean }>
>;

export const isCatKind = (v: string): v is CatKind =>
  v === "income" || v === "expense" || v === "asset" || v === "liability";

export async function listCategories(): Promise<FinCatRow[]> {
  const rows = await db
    .select()
    .from(financeCategories)
    .orderBy(asc(financeCategories.kind), asc(financeCategories.sortOrder), asc(financeCategories.label));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as CatKind,
    parent: r.parent,
    label: r.label,
    riskAsset: r.riskAsset,
    liquidity: r.liquidity,
    consumer: r.consumer,
    needsNote: r.needsNote,
    sortOrder: r.sortOrder,
    active: r.active,
    isSystem: r.isSystem,
  }));
}

// 把資料列摺成前端用的 payload；停用的不給出去。
export function toPayload(rows: FinCatRow[]): FinCatPayload {
  const out: FinCatPayload = { income: [], expense: [], asset: [], liability: [] };
  for (const r of rows) {
    if (!r.active) continue;
    if (!out[r.kind]) continue;
    out[r.kind].push({
      label: r.label,
      parent: r.parent,
      ...(r.riskAsset ? { risk: true } : {}),
      ...(r.liquidity ? { liq: r.liquidity } : {}),
      ...(r.consumer ? { consumer: true } : {}),
      ...(r.needsNote ? { note: true } : {}),
    });
  }
  return out;
}

// 表還沒 seed（或連不上）時，回預設清單 —— 前端也有同一份 fallback，
// 但這裡先擋一層，避免後台開起來是空白畫面。
export function defaultPayload(): FinCatPayload {
  const out: FinCatPayload = { income: [], expense: [], asset: [], liability: [] };
  for (const s of DEFAULT_FINANCE_CATEGORIES) {
    out[s.kind].push({
      label: s.label,
      parent: s.parent,
      ...(s.risk ? { risk: true } : {}),
      ...(s.liq ? { liq: s.liq } : {}),
      ...(s.consumer ? { consumer: true } : {}),
      ...(s.note ? { note: true } : {}),
    });
  }
  return out;
}

export const getCategoryPayload = unstable_cache(
  async (): Promise<FinCatPayload> => {
    const rows = await listCategories();
    const p = toPayload(rows);
    const empty = (["income", "expense", "asset", "liability"] as CatKind[]).every((k) => p[k].length === 0);
    return empty ? defaultPayload() : p;
  },
  ["lantu-finance-categories"],
  { tags: [FIN_CAT_TAG] },
);

// ── 寫入（只由 /admin/categories 的 server action 呼叫，那裡已擋 isAdmin）──

export type CatInput = {
  kind: string;
  parent: string;
  label: string;
  riskAsset?: boolean;
  liquidity?: string | null;
  consumer?: boolean;
  needsNote?: boolean;
  sortOrder?: number;
  active?: boolean;
};

// 驗證：kind 合法、parent 必須是該 kind 允許的大類、label 非空。
// parent 亂填會讓引擎的大類比對整個失效，所以這裡是硬擋不是修正。
export function normalizeCatInput(input: CatInput): Omit<FinCatRow, "id" | "isSystem"> {
  const kind = input.kind?.trim();
  if (!isCatKind(kind)) throw new Error("invalid-kind");
  const label = (input.label ?? "").trim();
  if (!label) throw new Error("empty-label");
  if (label.length > 30) throw new Error("label-too-long");
  const parent = (input.parent ?? "").trim();
  if (!CAT_PARENTS[kind].includes(parent)) throw new Error("invalid-parent");
  const liq = (input.liquidity ?? "").trim();
  if (kind === "asset" && liq && liq !== "流動" && liq !== "固定") throw new Error("invalid-liquidity");
  return {
    kind,
    parent,
    label,
    riskAsset: kind === "asset" ? !!input.riskAsset : false,
    liquidity: kind === "asset" ? (liq || null) : null,
    consumer: kind === "liability" ? !!input.consumer : false,
    needsNote: !!input.needsNote,
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 999,
    active: input.active !== false,
  };
}

export async function createCategory(input: CatInput): Promise<void> {
  const v = normalizeCatInput(input);
  await db.insert(financeCategories).values({ ...v, isSystem: false });
  updateTag(FIN_CAT_TAG);
}

export async function updateCategory(id: string, input: CatInput): Promise<void> {
  const v = normalizeCatInput(input);
  await db
    .update(financeCategories)
    .set({ ...v, updatedAt: new Date() })
    .where(eq(financeCategories.id, id));
  updateTag(FIN_CAT_TAG);
}

// 系統預設列不可刪（舊 plan.data 還指著這些字串，刪掉會讓既有資料的類別變孤兒）；
// 要「拿掉」請改成停用 active=false，選單就不再出現，但舊資料照樣顯示得出來。
export async function deleteCategory(id: string): Promise<void> {
  const rows = await db.select().from(financeCategories).where(eq(financeCategories.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("not-found");
  if (row.isSystem) throw new Error("system-category");
  await db.delete(financeCategories).where(eq(financeCategories.id, id));
  updateTag(FIN_CAT_TAG);
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  await db
    .update(financeCategories)
    .set({ active, updatedAt: new Date() })
    .where(eq(financeCategories.id, id));
  updateTag(FIN_CAT_TAG);
}

// 後台「載入官方預設類別」：把 defaults 補進表裡（已存在的同名細類跳過，不覆蓋後台改過的設定）。
// migration 已經 seed 過一次，這顆按鈕是給「後來又加了新預設」或「表被清空」時用的。
export async function seedDefaultCategories(): Promise<number> {
  const existing = await listCategories();
  const have = new Set(existing.map((r) => `${r.kind}|${r.label}`));
  const per: Record<string, number> = {};
  const rows = DEFAULT_FINANCE_CATEGORIES.map((s) => {
    per[s.kind] = (per[s.kind] ?? 0) + 10;
    return {
      kind: s.kind,
      parent: s.parent,
      label: s.label,
      riskAsset: !!s.risk,
      liquidity: s.liq ?? null,
      consumer: !!s.consumer,
      needsNote: !!s.note,
      sortOrder: per[s.kind],
      active: true,
      isSystem: true,
    };
  }).filter((r) => !have.has(`${r.kind}|${r.label}`));
  if (!rows.length) return 0;
  await db.insert(financeCategories).values(rows);
  updateTag(FIN_CAT_TAG);
  return rows.length;
}
