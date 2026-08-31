"use server";

// 客戶管理的伺服器動作。每個動作都在伺服器端重新驗證教練身份、狀態與使用期限。
import { revalidatePath } from "next/cache";
import { requireWritableCoach, requireClientQuota } from "@/lib/guard";
import * as Clients from "@/lib/clients";
import * as Plans from "@/lib/plans";
import * as Reviews from "@/lib/reviews";
import { logRevision, restoreRevision } from "@/lib/revisions";
import * as Notes from "@/lib/notes";
import * as Session from "@/lib/consultSession";

// 這裡是教練端「所有寫入」的唯一身分入口 —— 期限到期的唯讀鎖定就掛在 requireWritableCoach()，
// 不要繞過它直接取教練身分，否則那條路徑會變成到期後仍可寫的破口。
async function coachId(): Promise<string> {
  const me = await requireWritableCoach();
  return me.id;
}

// ── 客戶 ─────────────────────────────────────────────
// 回傳成敗而不是用 throw：額度已滿與期限到期是「使用者要看到理由」的情況，
// 而 Next 在正式環境會把 server action 丟出的錯誤訊息換成沒有意義的 digest，
// 畫面上就只剩「建立失敗，請重試」——重試一百次也不會成功。
export type ActionResult = { ok: true } | { ok: false; error: string };
export type IdResult = { ok: true; id: string } | { ok: false; error: string };
export type CreateClientResult = IdResult;

/** 未知錯誤的統一說法：不要留下「操作失敗」這種按幾次都一樣的死路。 */
const FALLBACK_ERROR = "這個動作沒有完成。請重新整理頁面再試一次；若還是失敗請聯繫管理員。";

// 少數會冒到這裡的技術性訊息，換成使用者看得懂的說法。
const MSG: Record<string, string> = {
  forbidden: "你的帳號沒有權限做這件事——請確認已登入，而且帳號已經開通。",
};

/**
 * 把 throw 出來的錯誤轉成畫面看得到的理由。
 *
 * ⚠️ 只有**具名**錯誤（LicenseLockedError、QuotaFullError…）的 message 是寫給人看的中文，
 *    才直接顯示；普通 `new Error("forbidden")` 或 DB 例外一律換成可行動的中文，
 *    否則畫面上會出現一串沒人看得懂的英文（正式環境更會被換成無意義的 digest）。
 */
function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof Error) {
    if (e.name !== "Error" && e.message) return { ok: false, error: e.message };
    const mapped = MSG[e.message];
    if (mapped) return { ok: false, error: mapped };
  }
  return { ok: false, error: FALLBACK_ERROR };
}

export async function createClientAction(input: Clients.ClientInput): Promise<CreateClientResult> {
  try {
    const me = await requireWritableCoach();
    // 客戶數上限依級別（實習與 C1–C3 為 20 位、S1–S2 為 50 位、S3 與首席為 100 位）
    await requireClientQuota(me);
    const id = await Clients.createClient(me.id, input);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/overview");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateClientAction(clientId: string, patch: Partial<Clients.ClientInput>): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Clients.updateClient(cid, clientId, patch);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveClientAction(clientId: string): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Clients.setClientStatus(cid, clientId, "archived");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── 年度版本 ─────────────────────────────────────────
export async function savePlanDataAction(planId: string, data: unknown): Promise<{ netWorth: number | null; healthGrade: string | null }> {
  const me = await requireWritableCoach();
  const snap = await Plans.updatePlanData(me.id, planId, data);
  await logRevision(planId, "coach", me.id, me.name, data); // 存版本快照＋標作者
  return snap;
}

export async function clonePlanAction(planId: string): Promise<IdResult> {
  try {
    const cid = await coachId();
    const id = await Plans.clonePlan(cid, planId);
    // 唯一沒補 revalidatePath 的教練端寫入 action：呼叫端會 router.push 到新編輯器所以看不出來，
    // 但使用者按上一頁回客戶頁時會看不到剛複製出的版本。
    revalidatePath("/dashboard/clients");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function createPlanAction(clientId: string, name: string): Promise<IdResult> {
  try {
    const cid = await coachId();
    // 資料層改回 { ok } —— 建立年度版本會被額度／重複年度擋下，理由要原文傳給畫面。
    const r = await Plans.createPlan(cid, clientId, name);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true, id: r.planId };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePlanMetaAction(clientId: string, planId: string, patch: Plans.PlanMetaPatch): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Plans.updatePlanMeta(cid, planId, patch);
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePlanAction(clientId: string, planId: string): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Plans.deletePlan(cid, planId);
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── 諮詢紀錄 ─────────────────────────────────────────
export async function createReviewAction(clientId: string, input: Reviews.ReviewInput): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Reviews.createReview(cid, clientId, input);
    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/overview");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateReviewAction(clientId: string, reviewId: string, patch: Partial<Reviews.ReviewInput>): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Reviews.updateReview(cid, reviewId, patch);
    revalidatePath(`/dashboard/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteReviewAction(clientId: string, reviewId: string): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Reviews.deleteReview(cid, reviewId);
    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/overview");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── 動作項目 ─────────────────────────────────────────
export async function createActionItemAction(clientId: string, input: Reviews.ActionItemInput): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Reviews.createActionItem(cid, clientId, input);
    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/overview");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * 把規劃器「待補齊清單」勾起來的項目一次送進客戶的待辦。
 * 客戶端 /portal 首頁讀的就是同一張 action_items，所以送出後那邊也要 revalidate。
 */
export async function createActionItemsAction(
  clientId: string,
  titles: string[],
): Promise<{ ok: true; added: number; skipped: number } | { ok: false; error: string }> {
  try {
    const cid = await coachId();
    const r = await Reviews.createActionItems(cid, clientId, titles);
    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/overview");
    revalidatePath("/portal");
    return { ok: true, ...r };
  } catch (e) {
    const f = fail(e);
    return { ok: false, error: f.ok ? "操作失敗，請重試" : f.error };
  }
}

export async function setActionItemDoneAction(clientId: string, itemId: string, done: boolean): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Reviews.setActionItemDone(cid, itemId, done);
    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/overview");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteActionItemAction(clientId: string, itemId: string): Promise<ActionResult> {
  try {
    const cid = await coachId();
    await Reviews.deleteActionItem(cid, itemId);
    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/overview");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── 區塊註記 ＋ 一場諮詢 ────────────────────────────────
// ⚠️ 這一段刻意只呼叫 lib/notes 與 lib/consultSession，不自己組查詢條件。
//    「唯讀協作教練可以寫註記」那條例外只住在 lib/notes.ts，
//    clientScope.drift.test.ts 會掃這支檔案確認它沒有漏出來。
export type NoteResult = { ok: true; note: Notes.NoteRow } | { ok: false; error: string };

export async function addNoteAction(clientId: string, input: Notes.NoteInput): Promise<NoteResult> {
  const me = await requireWritableCoach();
  const cid = me.id;
  const r = await Notes.addNote(cid, clientId, input, me.name ?? null);
  if (r.ok) revalidatePath(`/dashboard/clients/${clientId}`);
  return r;
}

export async function deleteNoteAction(clientId: string, noteId: string): Promise<boolean> {
  const cid = await coachId();
  const ok = await Notes.deleteNote(cid, clientId, noteId);
  if (ok) revalidatePath(`/dashboard/clients/${clientId}`);
  return ok;
}

export async function setNoteVisibleAction(clientId: string, noteId: string, visible: boolean): Promise<boolean> {
  const cid = await coachId();
  return Notes.setNoteVisible(cid, clientId, noteId, visible);
}

export async function listNotesAction(clientId: string): Promise<Notes.NoteRow[]> {
  const cid = await coachId();
  return Notes.listNotes(cid, clientId);
}

export type StartSessionResult =
  | { ok: true; session: Session.SessionRow; adopted: number }
  | { ok: false; error: string };

export async function startSessionAction(
  clientId: string,
  planId: string | null,
  adoptLoose: boolean,
): Promise<StartSessionResult> {
  const cid = await coachId();
  const r = await Session.startSession(cid, clientId, planId, adoptLoose);
  if (r.ok) revalidatePath(`/dashboard/clients/${clientId}`);
  return r;
}

// ⚠️ 2026/08/28：結束諮詢只產草稿、不再直接寫 review。教練在表單改完按存檔
//    （saveConsultRecordAction）才變成正式紀錄。理由見 consultSession.ts 的 endSession 註解。
export type EndSessionResult =
  | { ok: true; sessionId: string; draft: string; todos: string[] }
  | { ok: false; error: string };

export async function endSessionAction(clientId: string, sessionId: string, input: Session.EndInput): Promise<EndSessionResult> {
  const cid = await coachId();
  const r = await Session.endSession(cid, sessionId, input);
  if (!r.ok) return r;
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true, sessionId: r.session.id, draft: r.draft, todos: r.todos };
}

/** 把草稿存成正式的諮詢紀錄（可改日期、類型、全文）。 */
export async function saveConsultRecordAction(
  clientId: string,
  sessionId: string,
  input: Session.SaveRecordInput,
): Promise<Session.SaveRecordOutcome> {
  const cid = await coachId();
  const r = await Session.saveSessionRecord(cid, sessionId, input);
  if (r.ok) revalidatePath(`/dashboard/clients/${clientId}`);
  return r;
}

/** 有沒有「按了結束但沒存」的草稿——客戶詳情頁與規劃編輯器都靠這條跳提醒。 */
export async function pendingDraftAction(clientId: string): Promise<Session.PendingDraft | null> {
  const cid = await coachId();
  return Session.pendingDraft(cid, clientId);
}

/** 這一場決定不留紀錄：丟掉草稿（場次與還原點都保留）。 */
export async function discardDraftAction(clientId: string, sessionId: string): Promise<boolean> {
  const cid = await coachId();
  const ok = await Session.discardDraft(cid, sessionId);
  if (ok) revalidatePath(`/dashboard/clients/${clientId}`);
  return ok;
}

export async function openSessionAction(clientId: string): Promise<Session.SessionRow | null> {
  const cid = await coachId();
  return Session.openSession(cid, clientId);
}

export async function listSessionsAction(clientId: string): Promise<Session.SessionRow[]> {
  const cid = await coachId();
  return Session.listSessions(cid, clientId);
}

export type RestoreResult = { ok: true; planId: string } | { ok: false; error: string };

/**
 * 回到某一場諮詢開始時的狀態。
 *
 * ⚠️ 只還原「規劃資料」，**不動註記**——按下還原就把這一場談出來的東西一起抹掉，
 *    是誰都不想要的結果，而且那些正是解釋「為什麼要還原」的東西。
 *    還原本身也記一版（restoreRevision 內建），所以中間的編輯不會變成回不去的孤兒。
 */
export async function restoreToSessionAction(clientId: string, sessionId: string): Promise<RestoreResult> {
  const cid = await coachId();
  const sessions = await Session.listSessions(cid, clientId, 200);
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) return { ok: false, error: "找不到這一場諮詢" };
  if (!s.planId || !s.revisionId) return { ok: false, error: "這一場沒有可還原的版本快照" };
  const me = await requireWritableCoach();
  const owned = await Plans.getPlan(cid, s.planId);
  if (!owned) return { ok: false, error: "沒有這份規劃的權限" };
  const r = await restoreRevision(s.planId, s.revisionId, { type: "coach", id: cid, name: me.name ?? null });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true, planId: s.planId };
}
