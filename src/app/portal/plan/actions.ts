"use server";

// 客戶端的區塊註記。
//
// 客戶寫的註記是「幫教練補脈絡」——「租金那筆是我父親的房子，他只收半價」這種話，
// 教練自己看數字永遠看不出來。
//
// ⚠️ 三條線一律由伺服器決定，不信任前端：
//   1. clientId 從登入身分反查，不從參數拿（否則任何人都能往別人的客戶寫註記）。
//   2. visible 永遠 false —— 客戶寫的東西不會印進帶公司抬頭的客戶文件。
//   3. authorAccess='client'，畫面上標成「客戶填的」，跟教練寫的分得開。
import { ensureClientUser } from "@/lib/clientUser";
import { getClientPlanCase } from "@/lib/clientPlan";
import { addClientNote, type NoteInput, type NoteRow } from "@/lib/notes";
import { db } from "@/Shared/db";
import { clientNotes } from "@/Shared/db/schema";
import { and, asc, eq, or } from "drizzle-orm";

async function myClientId(): Promise<{ clientId: string; userId: string } | null> {
  const user = await ensureClientUser();
  if (!user) return null;
  const plan = await getClientPlanCase(user.id);
  if (!plan) return null;
  return { clientId: plan.clientId, userId: user.id };
}

/**
 * 客戶看得到的註記＝教練勾了「客戶可見」的 ＋ 他自己寫的。
 * 少了後半段，客戶寫完一句話會發現它憑空消失。
 */
export async function listMyNotesAction(): Promise<NoteRow[]> {
  const me = await myClientId();
  if (!me) return [];
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
    .where(
      and(
        eq(clientNotes.clientId, me.clientId),
        or(eq(clientNotes.visible, true), eq(clientNotes.authorAccess, "client")),
      ),
    )
    .orderBy(asc(clientNotes.createdAt));
}

export type MyNoteResult = { ok: true; note: NoteRow } | { ok: false; error: string };

export async function addMyNoteAction(input: NoteInput): Promise<MyNoteResult> {
  const me = await myClientId();
  if (!me) return { ok: false, error: "請先登入" };
  return addClientNote(me.clientId, me.userId, input);
}

export async function deleteMyNoteAction(noteId: string): Promise<boolean> {
  const me = await myClientId();
  if (!me) return false;
  // 只能刪自己寫的：教練寫的（即使客戶看得到）不歸客戶處理。
  const res = await db
    .delete(clientNotes)
    .where(
      and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, me.clientId),
        eq(clientNotes.authorAccess, "client"),
        eq(clientNotes.authorId, me.userId),
      ),
    )
    .returning({ id: clientNotes.id });
  return res.length > 0;
}
