// 客戶↔教練 連結（雙向確認）資料層。
// 客戶端「選擇教練」→ 建 pending 申請；教練端「接受」→ 設 clients.coachId、申請 accepted。
import { randomBytes } from "node:crypto";
import { and, eq, desc, count } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, coaches, coachLinkRequests, coachInvites, coachDisplayName } from "@/Shared/db/schema";
import type { ClientUser } from "@/lib/clientUser";
import { allocCode } from "@/lib/codeAlloc";
import { normalizeCode } from "@/lib/codes";
import { QUOTA_FULL_MESSAGE } from "@/lib/license";
import { clientQuota } from "@/lib/quota";

/**
 * 客戶數上限的第二、第三個入口。
 *
 * usedClientCount() 數的是 `clients.coach_id`，所以**任何**會設 coach_id 的路徑都在花額度。
 * 目前有三條：`createClientAction`（教練自己建，已經有 requireClientQuota）、
 * 接受連結申請、以及邀請碼兌換。後兩條原本一句額度都沒查 ——
 * 上限 30 位的教練可以靠邀請連結收到第 200 位，畫面上的「x/y」只會顯示超額，
 * 而且是既成事實：客戶已經掛上去了，要收回只能把人踢掉。
 *
 * 這裡刻意回 { ok:false, error } 而不是 throw：兩條路徑都是使用者按一下就到底的動作，
 * 訊息要能直接顯示給人看（Next 會把 throw 出去的訊息換成沒有意義的 digest）。
 */
async function quotaBlocked(coachId: string): Promise<string | null> {
  const rows = await db
    .select({ id: coaches.id, rankCode: coaches.rankCode, clientCapOverride: coaches.clientCapOverride })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);
  if (!rows[0]) return "找不到這位教練";
  const q = await clientQuota(rows[0]);
  return q.full && q.cap != null ? QUOTA_FULL_MESSAGE(q.cap) : null;
}

export type ActiveCoach = { id: string; name: string | null; title: string | null; orgRank: string };

// 可供客戶選擇的教練＝已開通(active)。
export async function listActiveCoaches(): Promise<ActiveCoach[]> {
  const rows = await db
    .select({ id: coaches.id, name: coachDisplayName, title: coaches.title, orgRank: coaches.orgRank })
    .from(coaches)
    .where(eq(coaches.status, "active"))
    .orderBy(coaches.createdAt);
  return rows;
}

/**
 * 用教練編號找教練（客戶在官網「輸入編號指定」時走這條）。
 *
 * 刻意**不要求**對方有公開檔案、也不看職級：
 * C 階教練不吃系統派案（官網卡片不給點、自動建議也不出現），但他自己開發來的客戶
 * 拿著編號一定要進得來——編號就是為了這件事才發的。唯一的底線仍是「帳號已開通」。
 */
export async function findCoachByCode(raw: string): Promise<{ id: string; name: string | null; title: string | null; code: string } | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const rows = await db
    .select({ id: coaches.id, name: coachDisplayName, title: coaches.title, code: coaches.code })
    .from(coaches)
    .where(and(eq(coaches.code, code), eq(coaches.status, "active")))
    .limit(1);
  const r = rows[0];
  return r?.code ? { id: r.id, name: r.name, title: r.title, code: r.code } : null;
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
    const co = await db.select({ name: coachDisplayName }).from(coaches).where(eq(coaches.id, client.coachId)).limit(1);
    return { state: "linked", coachName: co[0]?.name ?? null };
  }
  const pend = await db
    .select({ coachId: coachLinkRequests.coachId })
    .from(coachLinkRequests)
    .where(and(eq(coachLinkRequests.clientId, client.id), eq(coachLinkRequests.status, "pending")))
    .orderBy(desc(coachLinkRequests.createdAt))
    .limit(1);
  if (pend[0]) {
    const co = await db.select({ name: coachDisplayName }).from(coaches).where(eq(coaches.id, pend[0].coachId)).limit(1);
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
  // coachId 直接來自表單，先驗它真的是一位已核可、可對外的教練。
  // 少了這道，帶一個待審／已停權／已離職的 id 進來也能建出 pending 申請，
  // 而那筆申請不會出現在任何人的待辦裡——客戶等一輩子也等不到回覆。
  const okCoach = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(and(eq(coaches.id, coachId), eq(coaches.status, "active")))
    .limit(1);
  if (!okCoach[0]) return { ok: false, error: "找不到這位教練，請重新選擇" };
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
    // 接受＝多一位掛在自己名下的客戶，跟「新增客戶」一樣要先過額度。
    // 婉拒不佔額度，所以只擋 accept 這一支。
    const blocked = await quotaBlocked(coachId);
    if (blocked) return { ok: false, error: blocked };
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
  const co = await db.select({ name: coachDisplayName }).from(coaches).where(eq(coaches.id, rows[0].coachId)).limit(1);
  return { coachId: rows[0].coachId, coachName: co[0]?.name ?? null, used: !!rows[0].usedAt };
}

// 客戶開啟邀請 → 直接掛到該教練（教練主動＝視同同意）。
// 已拍板(2026/08/20)：邀請碼是「一碼多人可用」——一條連結可以群發，教練不必每位客戶產一次。
// usedAt/usedByClientUserId 只當「最近一次被誰用掉」的紀錄，不作為失效判定。
// 「教練必須仍是 active」是安全底線：停權教練的舊連結不該還能繼續收客戶。
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
  let client = cRows[0];
  // ⚠️ 順序有意義：先處理「已經連結過」再查額度。
  // 邀請連結是一碼多人可用、而且可以重複開的，同一位客戶再點一次同一條連結必須照樣成功——
  // 那一次並不會多佔一個名額，拿額度去擋它只會讓已經掛好的客戶看到「教練已滿」。
  if (client?.coachId) {
    if (client.coachId === inv.coachId) return { ok: true, coachName: inv.coachName }; // 已連結同一位＝視同成功（可重複開）
    return { ok: false, error: "你已連結其他教練，請先解除再用此連結" };
  }
  // 這條路真的會多一位客戶了 → 過額度。擋在建 clients 列之前，
  // 免得擋掉之後還留下一筆沒有教練、也沒有護照的空客戶（和白發掉的一組客戶編號）。
  const blocked = await quotaBlocked(inv.coachId);
  if (blocked) return { ok: false, error: blocked };
  // 還沒填人生護照也要能綁：邀請連結＝一鍵入場。舊版在這裡擋掉（「請先完成人生護照」），
  // 新客戶會卡在中間，回頭多半找不到那條連結，教練就永遠收不到人。
  // 先用 Clerk 姓名開一筆空的 clients 列，綁上教練，再引導去填人生護照（savePassport 會沿用這一列）。
  if (!client) {
    const ins = await db
      .insert(clients)
      .values({ coachId: null, clientUserId: user.id, name: user.name || "我的規劃", source: "教練邀請", status: "active", code: await allocCode("client") })
      .returning();
    client = ins[0];
    if (!client) return { ok: false, error: "建立客戶資料失敗，請稍後再試" };
  }
  await db.update(clients).set({ coachId: inv.coachId, updatedAt: new Date() }).where(eq(clients.id, client.id));
  await db.update(coachLinkRequests)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(and(eq(coachLinkRequests.clientId, client.id), eq(coachLinkRequests.status, "pending")));
  await db.update(coachInvites).set({ usedByClientUserId: user.id, usedAt: new Date() }).where(eq(coachInvites.code, code));
  return { ok: true, coachName: inv.coachName };
}
