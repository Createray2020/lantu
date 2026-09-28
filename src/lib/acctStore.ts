// 帳務後台（組織營業損益）的伺服器端讀寫（2026/09/29）。與 carParams 同一模式：兩張表、後台一存 updateTag。
//
//   acct_params   key/value：items（營業項目＋拆分）／params（vatRate）／goal（netTarget）／draft（目標工作台草稿，不綁月份）
//   acct_months   ym 主鍵：qty（各項目本月筆數）／fixed（本月固定支出列）
//   acct_targets  ym 主鍵：同形狀的月目標＋net（目標淨利）——目標與實際分兩張表，不混
//   acct_entries  系統入帳事件（報聘核准／培訓帳號開通），每筆帶單價快照；測試帳號不寫、同人同事件只一次
// 計算全在 acctEngine.ts（純函式），這裡只管進出 DB 與正規化。
import { unstable_cache, updateTag } from "next/cache";
import { and, asc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { db } from "@/Shared/db";
import { acctParams, acctMonths, acctTargets, acctEntries, coaches } from "@/Shared/db/schema";
import {
  ACCT_DEFAULT_GOAL, ACCT_DEFAULT_PARAMS, isYm, normGoal, normItems, normMonth, normParams, normTarget, prevYm, ymOf,
  type AcctGoal, type AcctItem, type AcctMonth, type AcctParams, type AcctState, type AcctTarget, type AcctSource, type SysRow,
} from "./acctEngine";

export const ACCT_TAG = "acct-params";

async function loadState(): Promise<AcctState> {
  let items: AcctItem[] = [];
  let params: AcctParams = { ...ACCT_DEFAULT_PARAMS };
  let goal: AcctGoal = { ...ACCT_DEFAULT_GOAL };
  const months: Record<string, AcctMonth> = {};
  const targets: Record<string, AcctTarget> = {};
  let draft: AcctTarget | null = null;
  const sys: Record<string, SysRow[]> = {};
  try {
    const rows = await db.select({ key: acctParams.key, value: acctParams.value }).from(acctParams);
    for (const r of rows) {
      if (r.key === "items") items = normItems(r.value);
      if (r.key === "params") params = normParams(r.value);
      if (r.key === "goal") goal = normGoal(r.value);
      if (r.key === "draft" && r.value) draft = normTarget(r.value);
    }
    const ms = await db.select().from(acctMonths).orderBy(asc(acctMonths.ym));
    for (const m of ms) if (isYm(m.ym)) months[m.ym] = normMonth({ qty: m.qty, fixed: m.fixed });
    const ts = await db.select().from(acctTargets).orderBy(asc(acctTargets.ym));
    for (const t of ts) if (isYm(t.ym)) targets[t.ym] = normTarget({ qty: t.qty, fixed: t.fixed, net: t.net });
    const es = await db.select({ id: acctEntries.id, ym: acctEntries.ym, itemId: acctEntries.itemId, coachId: acctEntries.coachId, source: acctEntries.source, amount: acctEntries.amount, void: acctEntries.void, createdAt: acctEntries.createdAt, name: coaches.name, displayName: coaches.displayName })
      .from(acctEntries).leftJoin(coaches, eq(coaches.id, acctEntries.coachId)).orderBy(asc(acctEntries.createdAt));
    for (const e of es) {
      if (!isYm(e.ym) || (e.source !== "apply" && e.source !== "license")) continue;
      (sys[e.ym] ??= []).push({ id: e.id, ym: e.ym, itemId: e.itemId, coachId: e.coachId, coachName: e.displayName || e.name || e.coachId.slice(0, 8), source: e.source, amount: e.amount, void: e.void, createdAt: e.createdAt.toISOString() } as SysRow & { ym: string });
    }
  } catch { /* 表還沒建：空狀態 */ }
  return { items, months, targets, draft, sys, params, goal };
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
export async function saveAcctDraft(value: unknown): Promise<void> {
  await putParam("draft", normTarget(value));
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
export async function saveAcctTarget(ym: string, value: unknown): Promise<void> {
  if (!isYm(ym)) throw new Error("invalid-ym");
  const t = normTarget(value);
  await db.insert(acctTargets).values({ ym, qty: t.qty, fixed: t.fixed, net: t.net, updatedAt: new Date() })
    .onConflictDoUpdate({ target: acctTargets.ym, set: { qty: t.qty, fixed: t.fixed, net: t.net, updatedAt: new Date() } });
  updateTag(ACCT_TAG);
}
export async function deleteAcctTarget(ym: string): Promise<void> {
  if (!isYm(ym)) throw new Error("invalid-ym");
  await db.delete(acctTargets).where(eq(acctTargets.ym, ym));
  updateTag(ACCT_TAG);
}
// ---------- 系統入帳事件 ----------
/** 事件當下的入帳規則：找「自動來源＝source」的項目；沒有就不記（Ray 先在參數設定把項目建好）。 */
async function itemForSource(source: AcctSource): Promise<AcctItem | null> {
  const S = await loadState();
  return S.items.find((it) => it.source === source) ?? null;
}
/**
 * 記一筆系統入帳。永遠不丟錯（呼叫端是核准／開通流程，帳務不能擋住那些事）。
 * 測試帳號不記；同一個人同一種事件只記一次（唯一鍵 onConflictDoNothing）。回 true＝這次真的寫了一筆。
 */
export async function recordAcctEvent(source: AcctSource, coachId: string, at: Date = new Date()): Promise<boolean> {
  try {
    const [c] = await db.select({ isTest: coaches.isTest }).from(coaches).where(eq(coaches.id, coachId));
    if (!c || c.isTest) return false;
    const it = await itemForSource(source);
    if (!it) return false;
    const r = await db.insert(acctEntries).values({ ym: ymOf(at), itemId: it.id, coachId, source, amount: it.price, createdAt: at })
      .onConflictDoNothing({ target: [acctEntries.coachId, acctEntries.source] }).returning({ id: acctEntries.id });
    if (r.length) updateTag(ACCT_TAG);
    return r.length > 0;
  } catch { return false; }
}
export async function setAcctEntryVoid(id: string, v: boolean): Promise<void> {
  await db.update(acctEntries).set({ void: v }).where(eq(acctEntries.id, id));
  updateTag(ACCT_TAG);
}
/**
 * 回填某一個月：approved_at 落在該月的教練記 apply、license_from 落在該月的記 license；
 * 測試帳號與已記過的一律跳過。回寫入筆數。
 */
export async function backfillAcctMonth(ym: string): Promise<{ apply: number; license: number }> {
  if (!isYm(ym)) throw new Error("invalid-ym");
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(y, m - 1, 1), to = new Date(y, m, 1);
  const fromD = `${ym}-01`, toD = ymOf(to) + "-01";
  const out = { apply: 0, license: 0 };
  const approved = await db.select({ id: coaches.id, at: coaches.approvedAt }).from(coaches)
    .where(and(eq(coaches.isTest, false), isNotNull(coaches.approvedAt), gte(coaches.approvedAt, from), lt(coaches.approvedAt, to)));
  for (const c of approved) if (await recordAcctEvent("apply", c.id, c.at ?? from)) out.apply++;
  const lic = await db.select({ id: coaches.id, at: coaches.licenseFrom }).from(coaches)
    .where(and(eq(coaches.isTest, false), isNotNull(coaches.licenseFrom), gte(coaches.licenseFrom, fromD), lt(coaches.licenseFrom, toD)));
  for (const c of lic) if (await recordAcctEvent("license", c.id, c.at ? new Date(c.at) : from)) out.license++;
  return out;
}
export const currentYm = () => ymOf(new Date());
