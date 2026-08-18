// 客戶↔教練 連結（雙向確認）資料層。
// 客戶端「選擇教練」→ 建 pending 申請；教練端「接受」→ 設 clients.coachId、申請 accepted。
import { randomBytes } from "node:crypto";
import { and, eq, desc, count } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, coaches, coachLinkRequests, coachInvites } from "@/Shared/db/schema";
import type { ClientUser } from "@/lib/clientUser";

export type ActiveCoach = { id: string; name: string | null; title: string | null; orgRank: string };

// 可供客戶選擇的教練＝已開通(active)。
export async function listActiveCoaches(): Promise<ActiveCoach[]> {
  const rows = await db
    .select({ id: coaches.id, name: coaches.name, title: coaches.title, orgRank: coaches.orgRank })
    .from(coaches)
    .where(eq(coaches.status, "active"))
    .orderBy(coaches.createdAt);
  return rows;
}

export type LinkStatus =
  | { state: "none" }
  | { state: "pending"; coachName: string | null }
  | { state: "linked"; coachName: string | null };

// 客戶目前的連結狀態：已掛上(linked) / 送出申請待接受(pending) / 尚未(none)。
export async function getClientLinkStatus(clientUserId: string): Promise<LinkStatus> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, clientUserId)).limit(1);
  const client = cRows[0];
  if (!client) return { state: "none" };
  if (client.coachId) {
    const co = await db.select({ name: coaches.name }).from(coaches).where(eq(coaches.id, client.coachId)).limit(1);
    return { state: "linked", coachName: co[0]?.name ?? null };
  }
  const pend = await db
    .select({ coachId: coachLinkRequests.coachId })
    .from(coachLinkRequests)
    .where(and(eq(coachLinkRequests.clientId, client.id), eq(coachLinkRequests.status, "pending")))
    .orderBy(desc(coachLinkRequests.createdAt))
    .limit(1);
  if (pend[0]) {
    const co = await db.select({ name: coaches.name }).from(coaches).where(eq(coaches.id, pend[0].coachId)).limit(1);
    return { state: "pending", coachName: co[0]?.name ?? null };
  }
  return { state: "none" };
}

// 客戶送出連結申請（不重複；已掛上則不動）。
export async function requestCoachLink(user: ClientUser, coachId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  const client = cRows[0];
  if (!client) return { ok: false, error: "請先完成人生護照" };
  if (client.coachId) return { ok: false, error: "你已經連結教練了" };
  // 清掉這位客戶其他 pending（只留最新一筆），避免重複。
  await db
    .update(coachLinkRequests)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(and(eq(coachLinkRequests.clientId, client.id), eq(coachLinkRequests.status, "pending")));
  await db.insert(coachLinkRequests).values({ clientUserId: user.id, clientId: client.id, coachId, note: note || null });
  return { ok: true };
}

export type PendingRequest = { id: string; clientId: string; clientName: string; note: string | null; createdAt: Date };

// 教練端：待我接受的連結申請。
export async function listPendingRequestsForCoach(coachId: string): Promise<PendingRequest[]> {
  const rows = await db
    .select({
      id: coachLinkRequests.id, clientId: coachLinkRequests.clientId,
      clientName: clients.name, note: coachLinkRequests.note, createdAt: coachLinkRequests.createdAt,
    })
    .from(coachLinkRequests)
    .innerJoin(clients, eq(clients.id, coachLinkRequests.clientId))
    .where(and(eq(coachLinkRequests.coachId, coachId), eq(coachLinkRequests.status, "pending")))
    .orderBy(desc(coachLinkRequests.createdAt));
  return rows;
}

// 只要數量就用 count(*)，不要把整批列（還 join clients）撈回 Node 再 .length。
// 這支被 DashboardHeader 的紅點在「每次導頁」時打一次。
export async function countPendingForCoach(coachId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(coachLinkRequests)
    .where(and(eq(coachLinkRequests.coachId, coachId), eq(coachLinkRequests.status, "pending")));
  return Number(rows[0]?.n ?? 0);
}

// 教練回應：接受→掛上(設 clients.coachId)；婉拒→rejected。只能回應掛給自己的申請。
export async function respondToLinkRequest(requestId: string, coachId: string, accept: boolean): Promise<{ ok: boolean; error?: string }> {
  const reqRows = await db.select().from(coachLinkRequests).where(eq(coachLinkRequests.id, requestId)).limit(1);
  const req = reqRows[0];
  if (!req || req.coachId !== coachId) return { ok: false, error: "找不到申請或無權處理" };
  if (req.status !== "pending") return { ok: false, error: "此申請已處理過" };
  if (accept) {
    await db.update(clients).set({ coachId, updatedAt: new Date() }).where(eq(clients.id, req.clientId));
    await db.update(coachLinkRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(coachLinkRequests.id, requestId));
  } else {
    await db.update(coachLinkRequests).set({ status: "rejected", respondedAt: new Date() }).where(eq(coachLinkRequests.id, requestId));
  }
  return { ok: true };
}

// 客戶解除與教練的連結（撤銷授權）：coachId 清空、已接受的申請標 revoked。
export async function revokeClientLink(user: ClientUser): Promise<{ ok: boolean; error?: string }> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  const client = cRows[0];
  if (!client || !client.coachId) return { ok: false, error: "目前沒有連結教練" };
  await db.update(clients).set({ coachId: null, updatedAt: new Date() }).where(eq(clients.id, client.id));
  await db.update(coachLinkRequests)
    .set({ status: "revoked", respondedAt: new Date() })
    .where(and(eq(coachLinkRequests.clientId, client.id), eq(coachLinkRequests.status, "accepted")));
  return { ok: true };
}

// ── 教練反向邀請連結 ──────────────────────────────
// Math.random 不是 CSPRNG（同一個 V8 isolate 連續產生的碼可由前幾組還原內部狀態），
// 邀請碼等同「把客戶掛到某位教練」的授權憑證，一律用 CSPRNG。
function genCode(): string {
  return randomBytes(12).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14);
}

export async function createInvite(coachId: string, note?: string): Promise<{ code: string }> {
  const code = genCode();
  await db.insert(coachInvites).values({ coachId, code, note: note || null });
  return { code };
}

export async function getInviteByCode(code: string): Promise<{ coachId: string; coachName: string | null; used: boolean } | null> {
  const rows = await db.select({ coachId: coachInvites.coachId, usedAt: coachInvites.usedAt }).from(coachInvites).where(eq(coachInvites.code, code)).limit(1);
  if (!rows[0]) return null;
  const co = await db.select({ name: coaches.name }).from(coaches).where(eq(coaches.id, rows[0].coachId)).limit(1);
  return { coachId: rows[0].coachId, coachName: co[0]?.name ?? null, used: !!rows[0].usedAt };
}

// 客戶開啟邀請 → 直接掛到該教練（教練主動＝視同同意）。
// TODO(待拍板)：邀請碼目前是「一碼多人可用」——getInviteByCode 已算出 used 旗標但這裡沒有採用。
// 單次用 vs 多次用是產品決策（見盤點報告待拍板 #4），定案前先不改這個語意。
// 但「教練必須仍是 active」是安全底線，先補上：停權教練的舊連結不該還能繼續收客戶。
export async function redeemInvite(code: string, user: ClientUser): Promise<{ ok: boolean; error?: string; coachName?: string | null }> {
  const inv = await getInviteByCode(code);
  if (!inv) return { ok: false, error: "邀請連結無效或已失效" };
  const coachRows = await db
    .select({ status: coaches.status })
    .from(coaches)
    .where(eq(coaches.id, inv.coachId))
    .limit(1);
  if (coachRows[0]?.status !== "active") return { ok: false, error: "這位教練目前無法接受新客戶" };
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  const client = cRows[0];
  if (!client) return { ok: false, error: "請先完成人生護照，再用邀請連結掛教練" };
  if (client.coachId) {
    if (client.coachId === inv.coachId) return { ok: true, coachName: inv.coachName }; // 已連結同一位＝視同成功（可重複開）
    return { ok: false, error: "你已連結其他教練，請先解除再用此連結" };
  }
  await db.update(clients).set({ coachId: inv.coachId, updatedAt: new Date() }).where(eq(clients.id, client.id));
  await db.update(coachLinkRequests)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(and(eq(coachLinkRequests.clientId, client.id), eq(coachLinkRequests.status, "pending")));
  await db.update(coachInvites).set({ usedByClientUserId: user.id, usedAt: new Date() }).where(eq(coachInvites.code, code));
  return { ok: true, coachName: inv.coachName };
}
