// 共同執案（協作教練）資料層。
//
// 主責教練用「教練編號」邀請其他教練一起看某一位客戶；對方接受後，
// 該客戶的所有資料與報告書對他就是**唯讀**可見（可見範圍見 lib/clientScope.ts）。
//
// ⚠️ 這支檔案不提供任何「協作者可以寫」的入口，也不要為了方便加。
//    唯讀是這個功能唯一的賣點；一旦某條路徑能寫，主責就再也不知道報告書是誰改的。
import { and, count, desc, eq, ne } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientCollaborators, clients, coaches, coachDisplayName } from "@/Shared/db/schema";
import { findCoachByCode } from "./coachLink";
import { COLLAB_ACCEPTED } from "./clientScope";

export type CollabStatus = "pending" | "accepted" | "declined" | "revoked";

export type CollaboratorRow = {
  id: string;
  coachId: string;
  coachName: string | null;
  coachCode: string | null;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
};

export type CollabInvite = {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string | null;
  ownerName: string | null;
  createdAt: Date;
};

export type InviteResult = { ok: true; coachName: string | null } | { ok: false; error: string };

/** 主責才叫得動：確認這位客戶真的掛在他名下。 */
async function assertOwner(ownerId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.coachId, ownerId)))
    .limit(1);
  return !!row;
}

/**
 * 邀請一位教練共同執案（以教練編號指定）。
 *
 * 沿用 findCoachByCode()：只認 active 帳號、不看職級——C 階教練同樣可以被邀來幫看，
 * 「不吃系統派案」跟「不能協助看案子」是兩件事。
 *
 * 重新邀請已婉拒／已移除的人＝把同一列改回 pending（唯一鍵 ccollab_client_coach_uidx），
 * 不會長出第二列。
 */
export async function inviteCollaborator(ownerId: string, clientId: string, rawCode: string): Promise<InviteResult> {
  if (!(await assertOwner(ownerId, clientId))) return { ok: false, error: "找不到這位客戶，或你不是主責教練" };
  const target = await findCoachByCode(rawCode);
  if (!target) return { ok: false, error: "查無此教練編號（或該帳號尚未開通）" };
  if (target.id === ownerId) return { ok: false, error: "這是你自己的編號" };

  const [existing] = await db
    .select({ id: clientCollaborators.id, status: clientCollaborators.status })
    .from(clientCollaborators)
    .where(and(eq(clientCollaborators.clientId, clientId), eq(clientCollaborators.coachId, target.id)))
    .limit(1);

  if (existing?.status === "pending") return { ok: false, error: "已經邀請過了，等待對方接受" };
  if (existing?.status === COLLAB_ACCEPTED) return { ok: false, error: "這位教練已經在共同執案名單中" };

  if (existing) {
    await db
      .update(clientCollaborators)
      .set({ status: "pending", invitedBy: ownerId, createdAt: new Date(), respondedAt: null })
      .where(eq(clientCollaborators.id, existing.id));
  } else {
    await db.insert(clientCollaborators).values({ clientId, coachId: target.id, invitedBy: ownerId, status: "pending" });
  }
  return { ok: true, coachName: target.name };
}

/** 客戶詳情頁的協作面板：這位客戶目前的協作教練（不含已移除／已婉拒的）。 */
export async function listCollaborators(clientId: string): Promise<CollaboratorRow[]> {
  return db
    .select({
      id: clientCollaborators.id,
      coachId: clientCollaborators.coachId,
      coachName: coachDisplayName,
      coachCode: coaches.code,
      status: clientCollaborators.status,
      createdAt: clientCollaborators.createdAt,
      respondedAt: clientCollaborators.respondedAt,
    })
    .from(clientCollaborators)
    .innerJoin(coaches, eq(coaches.id, clientCollaborators.coachId))
    .where(
      and(
        eq(clientCollaborators.clientId, clientId),
        ne(clientCollaborators.status, "revoked"),
        ne(clientCollaborators.status, "declined"),
      ),
    )
    .orderBy(desc(clientCollaborators.createdAt));
}

/**
 * 主責移除協作教練。
 * 標成 revoked 而不是刪列：留得住「誰在什麼時候看過這個案子」，
 * 而且下次重新邀請時同一列直接改回 pending。
 */
export async function revokeCollaborator(ownerId: string, clientId: string, collabId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await assertOwner(ownerId, clientId))) return { ok: false, error: "你不是這位客戶的主責教練" };
  const [row] = await db
    .select({ id: clientCollaborators.id })
    .from(clientCollaborators)
    .where(and(eq(clientCollaborators.id, collabId), eq(clientCollaborators.clientId, clientId)))
    .limit(1);
  if (!row) return { ok: false, error: "找不到這筆協作紀錄" };
  await db
    .update(clientCollaborators)
    .set({ status: "revoked", respondedAt: new Date() })
    .where(eq(clientCollaborators.id, collabId));
  return { ok: true };
}

/** 被邀請的教練端：待回覆的共同執案邀請。 */
export async function listPendingInvitesForCoach(coachId: string): Promise<CollabInvite[]> {
  return db
    .select({
      id: clientCollaborators.id,
      clientId: clientCollaborators.clientId,
      clientName: clients.name,
      clientCode: clients.code,
      ownerName: coachDisplayName,
      createdAt: clientCollaborators.createdAt,
    })
    .from(clientCollaborators)
    .innerJoin(clients, eq(clients.id, clientCollaborators.clientId))
    .innerJoin(coaches, eq(coaches.id, clientCollaborators.invitedBy))
    .where(and(eq(clientCollaborators.coachId, coachId), eq(clientCollaborators.status, "pending")))
    .orderBy(desc(clientCollaborators.createdAt));
}

/** 頂欄紅點用。 */
export async function countPendingInvitesForCoach(coachId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(clientCollaborators)
    .where(and(eq(clientCollaborators.coachId, coachId), eq(clientCollaborators.status, "pending")));
  return Number(rows[0]?.n ?? 0);
}

/** 被邀請的教練接受／婉拒。 */
export async function respondToCollabInvite(inviteId: string, coachId: string, accept: boolean): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db
    .select({ id: clientCollaborators.id, coachId: clientCollaborators.coachId, status: clientCollaborators.status })
    .from(clientCollaborators)
    .where(eq(clientCollaborators.id, inviteId))
    .limit(1);
  if (!row || row.coachId !== coachId) return { ok: false, error: "找不到邀請或無權處理" };
  if (row.status !== "pending") return { ok: false, error: "這筆邀請已經處理過了" };
  await db
    .update(clientCollaborators)
    .set({ status: accept ? COLLAB_ACCEPTED : "declined", respondedAt: new Date() })
    .where(eq(clientCollaborators.id, inviteId));
  return { ok: true };
}
