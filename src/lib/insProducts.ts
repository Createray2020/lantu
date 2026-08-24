// 保險商品輕量主檔（伺服器端讀寫）。與 financeCategories / bizTaxParams 同一套模式：
// unstable_cache + tag，後台一存 updateTag，iframe app 下次載入就吃到新清單。
//
// ⚠️ 定位：這張表只當「既有保單登錄」的輸入輔助。
// 不存給付公式／費率／各年保障——那會讓它變成比價工具，而嵐途不做商品推薦、不碰佣金。
// 方案配置表（planProtect）的商品名稱仍然刻意留空，那一欄指向未來的購買決定，不是事實登錄。
import { unstable_cache, updateTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { insProducts } from "@/Shared/db/schema";
import { defaultInsProductRows, type InsProductRow } from "./insProducts.defaults";

export const INS_PRODUCT_TAG = "ins-products";

/** 給 iframe app 的精簡 payload：公司清單 ＋ 公司→商品建議清單。 */
export type InsProductPayload = {
  companies: Array<{ name: string; cat: string }>;
  products: Record<string, Array<{ code: string; name: string; kind: string; mr: string; onSale: boolean }>>;
};

export async function listInsProducts(): Promise<InsProductRow[]> {
  const rows = await db
    .select()
    .from(insProducts)
    .orderBy(asc(insProducts.sortOrder), asc(insProducts.company), asc(insProducts.code));
  return rows.map((r) => ({
    id: r.id, company: r.company, code: r.code, name: r.name, kind: r.kind,
    mainRider: r.mainRider, onSale: r.onSale, bigCat: r.bigCat, sortOrder: r.sortOrder,
  }));
}

export function toInsPayload(rows: InsProductRow[]): InsProductPayload {
  const companies: InsProductPayload["companies"] = [];
  const seen = new Set<string>();
  const products: InsProductPayload["products"] = {};
  for (const r of rows) {
    if (!seen.has(r.company)) { seen.add(r.company); companies.push({ name: r.company, cat: r.bigCat }); }
    if (!r.code && !r.name) continue;                 // 公司層的列不是商品
    (products[r.company] ||= []).push({
      code: r.code, name: r.name, kind: r.kind, mr: r.mainRider, onSale: r.onSale,
    });
  }
  return { companies, products };
}

/**
 * ⚠️ 與 bizTaxParams 一樣做「DB 有就用、完全空的才退回內建」的合併，
 * 但這裡是整份退回而不是逐列合併——公司清單被後台刻意刪掉一家是合法操作（例如公司退出台灣市場），
 * 逐列補回去會讓「刪不掉」變成 bug。只有整張表空的時候才給 seed。
 */
export const getInsProductPayload = unstable_cache(
  async (): Promise<InsProductPayload> => {
    let rows: InsProductRow[] = [];
    try { rows = await listInsProducts(); } catch { rows = []; }
    if (!rows.length) rows = defaultInsProductRows();
    return toInsPayload(rows);
  },
  ["lantu-ins-products"],
  { tags: [INS_PRODUCT_TAG] },
);

const str = (v: unknown, max = 120): string => String(v ?? "").trim().slice(0, max);

export type InsProductInput = {
  id?: string;
  company: string;
  code?: string;
  name?: string;
  kind?: string;
  mainRider?: string;
  onSale?: boolean;
  bigCat?: string;
  sortOrder?: number;
};

export async function saveInsProduct(input: InsProductInput): Promise<void> {
  const company = str(input.company, 60);
  if (!company) throw new Error("company-required");
  const row = {
    company,
    code: str(input.code, 40),
    name: str(input.name, 160),
    kind: str(input.kind, 40),
    mainRider: str(input.mainRider, 8),
    onSale: input.onSale !== false,
    bigCat: str(input.bigCat, 8) || "人身",
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 999,
    updatedAt: new Date(),
  };
  if (input.id) {
    await db.update(insProducts).set(row).where(eq(insProducts.id, input.id));
  } else {
    await db.insert(insProducts).values(row).onConflictDoUpdate({
      target: [insProducts.company, insProducts.code],
      set: { name: row.name, kind: row.kind, mainRider: row.mainRider, onSale: row.onSale, bigCat: row.bigCat, updatedAt: row.updatedAt },
    });
  }
  updateTag(INS_PRODUCT_TAG);
}

export async function deleteInsProduct(id: string): Promise<void> {
  await db.delete(insProducts).where(eq(insProducts.id, id));
  updateTag(INS_PRODUCT_TAG);
}

/**
 * CSV 批次匯入。沒有這一支，這張表永遠只會有 38 家公司、一個商品都沒有——
 * 商品是幾千筆，不可能一列一列在後台敲。
 * 格式：company,code,name,kind,mainRider,onSale,bigCat（第一列可以是表頭，會被跳過）。
 */
export async function importInsProductsCSV(csv: string): Promise<{ inserted: number; skipped: number }> {
  const lines = String(csv || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let inserted = 0, skipped = 0;
  const batch: Array<typeof insProducts.$inferInsert> = [];
  for (const [i, line] of lines.entries()) {
    const cells = line.split(",").map((x) => x.trim());
    if (i === 0 && /company|公司/i.test(cells[0])) continue;      // 表頭
    const company = str(cells[0], 60);
    if (!company) { skipped++; continue; }
    batch.push({
      company,
      code: str(cells[1], 40),
      name: str(cells[2], 160),
      kind: str(cells[3], 40),
      mainRider: str(cells[4], 8),
      onSale: !/^(0|false|停售)$/i.test(cells[5] ?? ""),
      bigCat: str(cells[6], 8) || "人身",
      sortOrder: 999,
    });
  }
  // neon-http 沒有互動式交易；一次 insert 多列本來就是單一語句，衝突走 DO NOTHING。
  const CHUNK = 200;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const part = batch.slice(i, i + CHUNK);
    if (!part.length) continue;
    await db.insert(insProducts).values(part).onConflictDoNothing({
      target: [insProducts.company, insProducts.code],
    });
    inserted += part.length;
  }
  if (inserted) updateTag(INS_PRODUCT_TAG);
  return { inserted, skipped };
}

/** 後台列表用：只取某一家的商品。 */
export async function listByCompany(company: string): Promise<InsProductRow[]> {
  const rows = await db.select().from(insProducts)
    .where(and(eq(insProducts.company, company), eq(insProducts.active, true)))
    .orderBy(asc(insProducts.code));
  return rows.map((r) => ({
    id: r.id, company: r.company, code: r.code, name: r.name, kind: r.kind,
    mainRider: r.mainRider, onSale: r.onSale, bigCat: r.bigCat, sortOrder: r.sortOrder,
  }));
}
