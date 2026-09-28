// 帳務後台（組織營業損益）的伺服器端讀寫（2026/09/29）。與 carParams 同一模式：兩張表、後台一存 updateTag。
//
//   acct_params   key/value：items（營業項目＋拆分）／params（vatRate）／goal（netTarget）
//   acct_months   ym 主鍵：qty（各項目本月筆數）／fixed（本月固定支出列）
// 計算全在 acctEngine.ts（純函式），這裡只管進出 DB 與正規化。
import { unstable_cache, updateTag } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { acctParams, acctMonths } from "@/Shared/db/schema";
import {
  ACCT_DEFAULT_GOAL, ACCT_DEFAULT_PARAMS, isYm, normGoal, normItems, normMonth, normParams, prevYm, ymOf,
  type AcctGoal, type AcctItem, type AcctMonth, type AcctParams, type AcctState,
} from "./acctEngine";

export const ACCT_TAG = "acct-params";

async function loadState(): Promise<AcctState> {
  let items: AcctItem[] = [];
  let params: AcctParams = { ...ACCT_DEFAULT_PARAMS };
  let goal: AcctGoal = { ...ACCT_DEFAULT_GOAL };
  const months: Record<string, AcctMonth> = {};
  try {
    const rows = await db.select({ key: acctParams.key, value: acctParams.value }).from(acctParams);
    for (const r of rows) {
      if (r.key === "items") items = normItems(r.value);
      if (r.key === "params") params = normParams(r.value);
      if (r.key === "goal") goal = normGoal(r.value);
    }
    const ms = await db.select().from(acctMonths).orderBy(asc(acctMonths.ym));
    for (const m of ms) if (isYm(m.ym)) months[m.ym] = normMonth({ qty: m.qty, fixed: m.fixed });
  } catch { /* 表還沒建：空狀態 */ }
  return { items, months, params, goal };
}
export const getAcctState = unstable_cache(loadState, ["lantu-acct-state"], { tags: [ACCT_TAG] });

// ---------- 寫入 ----------
async function putParam(key: string, value: unknown) {
  await db.insert(acctParams).values({ key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: acctParams.key, set: { value: value as object, updatedAt: new Date() } });
}
export async function saveAcctItems(value: unknown): Promise<void> {
  const items = normItems(value);
  for (const it of items) if (!it.name) throw new Error("invalid-name");
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) throw new Error("invalid-id");
  await putParam("items", items);
  updateTag(ACCT_TAG);
}
export async function saveAcctParams(value: unknown): Promise<void> {
  await putParam("params", normParams(value));
  updateTag(ACCT_TAG);
}
export async function saveAcctGoal(value: unknown): Promise<void> {
  await putParam("goal", normGoal(value));
  updateTag(ACCT_TAG);
}
export async function saveAcctMonth(ym: string, value: unknown): Promise<void> {
  if (!isYm(ym)) throw new Error("invalid-ym");
  const m = normMonth(value);
  await db.insert(acctMonths).values({ ym, qty: m.qty, fixed: m.fixed, updatedAt: new Date() })
    .onConflictDoUpdate({ target: acctMonths.ym, set: { qty: m.qty, fixed: m.fixed, updatedAt: new Date() } });
  updateTag(ACCT_TAG);
}
/** 開新月份：固定支出從最近一個有資料的月份複製（Ray：固定支出不用每月重填），數量歸零。已存在就不動。 */
export async function ensureAcctMonth(ym: string): Promise<void> {
  if (!isYm(ym)) throw new Error("invalid-ym");
  const S = await loadState();
  if (S.months[ym]) return;
  let src: AcctMonth | null = null;
  let k = prevYm(ym);
  for (let i = 0; i < 24 && !src; i++, k = prevYm(k)) if (S.months[k]) src = S.months[k];
  if (!src) { const keys = Object.keys(S.months).sort(); src = keys.length ? S.months[keys[keys.length - 1]] : null; }
  await db.insert(acctMonths).values({ ym, qty: {}, fixed: src ? src.fixed : [], updatedAt: new Date() }).onConflictDoNothing();
  updateTag(ACCT_TAG);
}
export async function deleteAcctMonth(ym: string): Promise<void> {
  if (!isYm(ym)) throw new Error("invalid-ym");
  await db.delete(acctMonths).where(eq(acctMonths.ym, ym));
  updateTag(ACCT_TAG);
}
export const currentYm = () => ymOf(new Date());
