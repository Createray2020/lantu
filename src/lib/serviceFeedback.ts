// 服務回饋問卷（2026/10/28 案件進度 ⑧）。
//   發送：結案（服務完成）時自動發；教練也可在案件頁手動發。發＝長一列 service_feedback（sent_at）＋站內通知客戶。
//   填寫：客戶在 /portal/feedback/[id] 評分（每題 1–5）＋留言。
//   分流：平均低於門檻（預設 3）→ 案件標 lowscore → 通知客戶關係（沒有客戶關係角色就通知管理員）。
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, serviceFeedback, siteSettings } from "@/Shared/db/schema";
import { getCase, setFlag, SYSTEM } from "./caseStore";
import { notify, notifyMany } from "./notify";
import { listActiveCoaches } from "./org";
import { clientRelationsIds } from "./caseScope";

export type Feedback = typeof serviceFeedback.$inferSelect;
export const FEEDBACK_KEY = "service_feedback";
export type FeedbackSettings = { questions: string[]; threshold: number };
export const DEFAULT_FEEDBACK: FeedbackSettings = {
  questions: ["整體而言，這次服務讓我安心", "教練有聽懂我的需求，不需要重複說明", "我清楚知道接下來要做什麼、誰負責", "我會推薦嵐途給朋友"],
  threshold: 3,
};
export function sanitizeFeedbackSettings(v: unknown): FeedbackSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const qs = Array.isArray(o.questions) ? o.questions.map((x) => String(x ?? "").trim().slice(0, 120)).filter(Boolean).slice(0, 10) : [];
  const th = Number(o.threshold);
  return { questions: qs.length ? qs : DEFAULT_FEEDBACK.questions, threshold: th >= 1 && th <= 5 ? th : DEFAULT_FEEDBACK.threshold };
}
export async function getFeedbackSettings(): Promise<FeedbackSettings> {
  try {
    const rows = await db.select().from(siteSettings).where(sql`${siteSettings.key} = ${FEEDBACK_KEY}`).limit(1);
    return rows[0] ? sanitizeFeedbackSettings(rows[0].value) : DEFAULT_FEEDBACK;
  } catch { return DEFAULT_FEEDBACK; }
}
export async function saveFeedbackSettings(input: unknown, updatedBy: string | null): Promise<FeedbackSettings> {
  const v = sanitizeFeedbackSettings(input);
  await db.insert(siteSettings).values({ key: FEEDBACK_KEY, value: v, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at`, updatedBy: sql`excluded.updated_by` } });
  return v;
}

/** 發問卷（冪等：同案同期已有一份就回它）。客戶沒綁帳號就不發（回 null）。 */
export async function sendFeedback(caseId: string, termId: string | null = null): Promise<Feedback | null> {
  const c = await getCase(caseId);
  if (!c) return null;
  const [cl] = await db.select({ cu: clients.clientUserId, name: clients.name }).from(clients).where(eq(clients.id, c.clientId)).limit(1);
  if (!cl?.cu) return null;
  const had = await db.select().from(serviceFeedback).where(and(eq(serviceFeedback.caseId, caseId), termId ? eq(serviceFeedback.termId, termId) : isNull(serviceFeedback.termId))).limit(1);
  const row = had[0] ?? (await db.insert(serviceFeedback).values({ caseId, termId, clientUserId: cl.cu }).onConflictDoNothing().returning())[0];
  if (!row) return had[0] ?? null;
  await notify({ to: "client", id: cl.cu, kind: "survey", title: "想聽聽你對這次服務的感受", body: "大約一分鐘，四題評分加一句話。你的意見會直接回到嵐途。", href: `/portal/feedback/${row.id}`, caseId, dedupeKey: `feedback:${row.id}:sent` });
  return row;
}
export async function getFeedback(id: string): Promise<Feedback | null> {
  const r = await db.select().from(serviceFeedback).where(eq(serviceFeedback.id, id)).limit(1);
  return r[0] ?? null;
}
export async function listFeedbackForCase(caseId: string): Promise<Feedback[]> {
  return db.select().from(serviceFeedback).where(eq(serviceFeedback.caseId, caseId)).orderBy(desc(serviceFeedback.sentAt));
}
export async function pendingFeedbackFor(clientUserId: string): Promise<Feedback[]> {
  return db.select().from(serviceFeedback).where(and(eq(serviceFeedback.clientUserId, clientUserId), isNull(serviceFeedback.submittedAt))).orderBy(desc(serviceFeedback.sentAt));
}

/** 客戶送出：算平均、判低分、標記＋通知。重送＝更新同一份。 */
export async function submitFeedback(id: string, clientUserId: string, rawScores: unknown, comment: string): Promise<{ ok: true; low: boolean } | { ok: false; error: string }> {
  const f = await getFeedback(id);
  if (!f || f.clientUserId !== clientUserId) return { ok: false, error: "找不到這份問卷" };
  const settings = await getFeedbackSettings();
  const scores = Array.isArray(rawScores) ? rawScores.map((x) => Math.round(Number(x))) : [];
  if (scores.length !== settings.questions.length || scores.some((s) => !(s >= 1 && s <= 5))) return { ok: false, error: "每一題都要評分（1–5）" };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const low = avg < settings.threshold;
  await db.update(serviceFeedback).set({ scores, avg, comment: comment.trim().slice(0, 1000), low, submittedAt: new Date() }).where(eq(serviceFeedback.id, id));
  const c = await getCase(f.caseId);
  if (c) {
    const [cl] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, c.clientId)).limit(1);
    const name = cl?.name ?? "客戶";
    await notify({ to: "coach", id: c.coachId, kind: "survey", title: `${name} 填了服務回饋（平均 ${avg.toFixed(1)}）`, body: comment.trim().slice(0, 300), href: `/dashboard/clients/${c.clientId}`, caseId: c.id, dedupeKey: `feedback:${id}:coach` });
    if (low) {
      await setFlag(c.id, "lowscore", true, SYSTEM, `問卷平均 ${avg.toFixed(1)}，低於門檻 ${settings.threshold}`);
      const all = await listActiveCoaches();
      let ids = clientRelationsIds(all);
      if (!ids.length) ids = all.filter((x) => x.role === "admin" || x.orgRank === "owner").map((x) => x.id);
      await notifyMany(ids.filter((x) => x !== c.coachId), { to: "coach", kind: "case_flag", title: `低分回饋：${name}（平均 ${avg.toFixed(1)}）`, body: "請依異常分流機制與客戶聯繫確認。", href: `/dashboard/clients/${c.clientId}`, caseId: c.id, dedupeKey: `feedback:${id}:low` });
    }
  }
  return { ok: true, low };
}
export async function handleFeedback(id: string, by: string, note: string): Promise<void> {
  await db.update(serviceFeedback).set({ handledAt: new Date(), handledBy: by, handleNote: note.trim().slice(0, 400) }).where(eq(serviceFeedback.id, id));
}
