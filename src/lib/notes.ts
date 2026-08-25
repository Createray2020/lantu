// 區塊註記：「這個數字為什麼是這樣」的說明，掛在客戶身上（不掛年度版本）。
//
// 這支檔案是全庫唯一准許使用 annotatableClient()（＝讀範圍）當寫入條件的地方。
// 理由與三道配套寫在 clientScope.ts 的那支函式上，動這裡之前先讀它。
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientNotes, clients } from "@/Shared/db/schema";
import { annotatableClient, clientAccess, type ClientAccess } from "./clientScope";

export const NOTE_KINDS = ["basis", "decision", "todo"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export type NoteRow = {
  id: string;
  sessionId: string | null;
  blockKey: string;
  kind: string;
  body: string;
  visible: boolean;
  authorType: string;
  authorId: string | null;
  authorName: string | null;
  authorAccess: string;
  createdAt: Date;
};

export type NoteInput = {
  blockKey: string;
  kind: string;
  body: string;
  visible?: boolean;
  sessionId?: string | null;
};

const MAX_BODY = 4000;

function normKind(k: string): NoteKind {
  return (NOTE_KINDS as readonly string[]).includes(k) ? (k as NoteKind) : "basis";
}

/** 這位教練對這位客戶有沒有註記權限；順便回傳他是主責還是協作。 */
async function accessOf(coachId: string, clientId: string): Promise<ClientAccess> {
  return clientAccess(coachId, clientId);
}

/** 讀這位客戶的所有註記。主責與協作教練都看得到全部（含彼此寫的）。 */
export async function listNotes(coachId: string, clientId: string): Promise<NoteRow[]> {
  const access = await accessOf(coachId, clientId);
  if (!access) return [];
  return db
    .select({
      id: clientNotes.id,
      sessionId: clientNotes.sessionId,
      blockKey: clientNotes.blockKey,
      kind: clientNotes.kind,
      body: clientNotes.body,
      visible: clientNotes.visible,
      authorType: clientNotes.authorType,
      authorId: clientNotes.authorId,
      authorName: clientNotes.authorName,
      authorAccess: clientNotes.authorAccess,
      createdAt: clientNotes.createdAt,
    })
    .from(clientNotes)
    .where(eq(clientNotes.clientId, clientId))
    .orderBy(asc(clientNotes.createdAt));
}

/** 客戶端只看得到勾了「客戶可見」的。 */
export async function listVisibleNotes(clientId: string): Promise<NoteRow[]> {
  return db
    .select({
      id: clientNotes.id,
      sessionId: clientNotes.sessionId,
      blockKey: clientNotes.blockKey,
      kind: clientNotes.kind,
      body: clientNotes.body,
      visible: clientNotes.visible,
      authorType: clientNotes.authorType,
      authorId: clientNotes.authorId,
      authorName: clientNotes.authorName,
      authorAccess: clientNotes.authorAccess,
      createdAt: clientNotes.createdAt,
    })
    .from(clientNotes)
    .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.visible, true)))
    .orderBy(asc(clientNotes.createdAt));
}

export type AddOutcome = { ok: true; note: NoteRow } | { ok: false; error: string };

/**
 * 新增一則註記。
 *
 * ⚠️ visible 由這裡**強制**決定，不信任呼叫端：
 *    只有主責教練（access === 'owner'）寫的列才可能是 true。
 *    協作教練與客戶寫的一律 false —— 那是合規線，不是 UI 偏好。
 */
export async function addNote(
  coachId: string,
  clientId: string,
  input: NoteInput,
  authorName?: string | null,
): Promise<AddOutcome> {
  const access = await accessOf(coachId, clientId);
  if (!access) return { ok: false, error: "沒有這位客戶的權限" };

  const body = (input.body ?? "").trim().slice(0, MAX_BODY);
  if (!body) return { ok: false, error: "註記內容是空的" };
  const blockKey = (input.blockKey ?? "").trim();
  if (!blockKey) return { ok: false, error: "缺少區塊代號" };

  const [row] = await db
    .insert(clientNotes)
    .values({
      clientId,
      sessionId: input.sessionId ?? null,
      blockKey,
      kind: normKind(input.kind),
      body,
      visible: access === "owner" ? !!input.visible : false,
      authorType: "coach",
      authorId: coachId,
      // 協作教練寫的註記一定要看得出是誰寫的；主責自己寫的不標，畫面才不會滿版都是自己的名字。
      authorName: access === "owner" ? null : (authorName ?? null),
      authorAccess: access,
    })
    .returning({
      id: clientNotes.id,
      sessionId: clientNotes.sessionId,
      blockKey: clientNotes.blockKey,
      kind: clientNotes.kind,
      body: clientNotes.body,
      visible: clientNotes.visible,
      authorType: clientNotes.authorType,
      authorId: clientNotes.authorId,
      authorName: clientNotes.authorName,
      authorAccess: clientNotes.authorAccess,
      createdAt: clientNotes.createdAt,
    });
  return { ok: true, note: row };
}

/** 客戶自己在客戶端寫的註記。永遠 visible=false、authorAccess='client'。 */
export async function addClientNote(clientId: string, clientUserId: string, input: NoteInput): Promise<AddOutcome> {
  const body = (input.body ?? "").trim().slice(0, MAX_BODY);
  if (!body) return { ok: false, error: "註記內容是空的" };
  const blockKey = (input.blockKey ?? "").trim();
  if (!blockKey) return { ok: false, error: "缺少區塊代號" };

  const [row] = await db
    .insert(clientNotes)
    .values({
      clientId,
      sessionId: input.sessionId ?? null,
      blockKey,
      kind: normKind(input.kind),
      body,
      visible: false,
      authorType: "client",
      authorId: clientUserId,
      authorAccess: "client",
    })
    .returning({
      id: clientNotes.id,
      sessionId: clientNotes.sessionId,
      blockKey: clientNotes.blockKey,
      kind: clientNotes.kind,
      body: clientNotes.body,
      visible: clientNotes.visible,
      authorType: clientNotes.authorType,
      authorId: clientNotes.authorId,
      authorName: clientNotes.authorName,
      authorAccess: clientNotes.authorAccess,
      createdAt: clientNotes.createdAt,
    });
  return { ok: true, note: row };
}

/**
 * 改「客戶可見」。只有主責教練能改，而且只能改主責自己寫的列——
 * 協作教練與客戶寫的列即使由主責來按，也不該變成對客戶公開。
 */
export async function setNoteVisible(coachId: string, clientId: string, noteId: string, visible: boolean): Promise<boolean> {
  const access = await accessOf(coachId, clientId);
  if (access !== "owner") return false;
  const res = await db
    .update(clientNotes)
    .set({ visible, updatedAt: new Date() })
    .where(and(eq(clientNotes.id, noteId), eq(clientNotes.clientId, clientId), eq(clientNotes.authorAccess, "owner")))
    .returning({ id: clientNotes.id });
  return res.length > 0;
}

/** 批次改可見（結束諮詢的那一步）。 */
export async function setNotesVisible(coachId: string, clientId: string, ids: string[], visible: boolean): Promise<number> {
  const access = await accessOf(coachId, clientId);
  if (access !== "owner" || !ids.length) return 0;
  const res = await db
    .update(clientNotes)
    .set({ visible, updatedAt: new Date() })
    .where(and(inArray(clientNotes.id, ids), eq(clientNotes.clientId, clientId), eq(clientNotes.authorAccess, "owner")))
    .returning({ id: clientNotes.id });
  return res.length;
}

/** 刪自己寫的那一則。協作教練不能刪主責的，主責也不能刪協作的。 */
export async function deleteNote(coachId: string, clientId: string, noteId: string): Promise<boolean> {
  const access = await accessOf(coachId, clientId);
  if (!access) return false;
  const res = await db
    .delete(clientNotes)
    .where(and(eq(clientNotes.id, noteId), eq(clientNotes.clientId, clientId), eq(clientNotes.authorId, coachId)))
    .returning({ id: clientNotes.id });
  return res.length > 0;
}

/** 一場諮詢期間記下的註記（產摘要用）。 */
export async function notesOfSession(sessionId: string): Promise<NoteRow[]> {
  return db
    .select({
      id: clientNotes.id,
      sessionId: clientNotes.sessionId,
      blockKey: clientNotes.blockKey,
      kind: clientNotes.kind,
      body: clientNotes.body,
      visible: clientNotes.visible,
      authorType: clientNotes.authorType,
      authorId: clientNotes.authorId,
      authorName: clientNotes.authorName,
      authorAccess: clientNotes.authorAccess,
      createdAt: clientNotes.createdAt,
    })
    .from(clientNotes)
    .where(eq(clientNotes.sessionId, sessionId))
    .orderBy(asc(clientNotes.createdAt));
}

/** 還沒歸屬任何場次的註記（＝日常維護）。開場時可以帶進來當議程。 */
export async function looseNotes(coachId: string, clientId: string): Promise<NoteRow[]> {
  const all = await listNotes(coachId, clientId);
  return all.filter((x) => !x.sessionId);
}

/** 這支存在只為了讓 annotatableClient() 有一個真正的使用點，並在此集中說明它的邊界。 */
export async function canAnnotate(coachId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), annotatableClient(coachId)))
    .limit(1);
  return !!row;
}

export { desc };
