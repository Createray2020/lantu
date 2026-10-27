// 客戶↔教練 連結（雙向確認）資料層。
// 客戶端「選擇教練」→ 建 pending 申請；教練端「接受」→ 設 clients.coachId、申請 accepted。
import { randomBytes } from "node:crypto";
import { seedCoachPlanFromPassport } from "@/lib/plans";
import { and, eq, desc, count, isNull } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, coaches, coachLinkRequests, coachInvites, coachDisplayName, plans } from "@/Shared/db/schema";
import type { ClientUser } from "@/lib/clientUser";
import { allocCode } from "@/lib/codeAlloc";
import { normalizeCode } from "@/lib/codes";
import { QUOTA_FULL_MESSAGE } from "@/lib/license";
import { clientQuota } from "@/lib/quota";

// 客戶人生護照那條軌（與 clientPlan.ts 同值）。
const CLIENT_TRACK = "client";

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
    // 掛上的那一刻就把護照複製成第一份年度版——教練不從空白起填，客戶前台從此投影教練軌。
    await seedCoachPlanFromPassport(req.clientId);
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

export type InviteInfo = {
  coachId: string;
  coachName: string | null;
  used: boolean;
  usedByClientUserId: string | null;
  /** 有值＝客戶專用登入連結（接到教練已建好的那一筆）；null＝通用邀請。 */
  clientId: string | null;
  clientName: string | null;
};

export async function getInviteByCode(code: string): Promise<InviteInfo | null> {
  const rows = await db
    .select({ coachId: coachInvites.coachId, usedAt: coachInvites.usedAt, usedBy: coachInvites.usedByClientUserId, clientId: coachInvites.clientId })
    .from(coachInvites)
    .where(eq(coachInvites.code, code))
    .limit(1);
  const inv = rows[0];
  if (!inv) return null;
  const co = await db.select({ name: coachDisplayName }).from(coaches).where(eq(coaches.id, inv.coachId)).limit(1);
  let clientName: string | null = null;
  if (inv.clientId) {
    const c = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, inv.clientId)).limit(1);
    clientName = c[0]?.name ?? null;
  }
  return {
    coachId: inv.coachId,
    coachName: co[0]?.name ?? null,
    used: !!inv.usedAt,
    usedByClientUserId: inv.usedBy ?? null,
    clientId: inv.clientId ?? null,
    clientName,
  };
}

// ── 客戶專用登入連結（2026/10/27）──────────────────────────────
// 情境：教練先在教練端建好客戶、做完整份規劃，才要讓客戶登入來看。
// 通用邀請認的是「這個帳號自己的 clients 列」，對這種客戶會另建一筆空白列——
// 教練名下出現兩個同名客戶、客戶登入看到的是空的。專用連結改成把帳號接到**既有那一筆**。
// 一人一碼、綁定後失效（Ray 2026/10/27 拍板）；重新產生就作廢舊碼。

export type ClientInviteResult = { ok: true; code: string } | { ok: false; error: string };

export async function createClientInvite(coachId: string, clientId: string): Promise<ClientInviteResult> {
  const rows = await db
    .select({ id: clients.id, coachId: clients.coachId, clientUserId: clients.clientUserId, status: clients.status })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.coachId, coachId)))
    .limit(1);
  const c = rows[0];
  if (!c) return { ok: false, error: "找不到這位客戶，或你不是主責教練" };
  if (c.clientUserId) return { ok: false, error: "這位客戶已經開通登入了" };
  if (c.status === "archived") return { ok: false, error: "已封存的客戶不能開通登入" };
  // 一人一碼：舊的未用碼直接作廢，免得客戶手上同時有兩條都能用的連結。
  await db.delete(coachInvites).where(and(eq(coachInvites.clientId, clientId), isNull(coachInvites.usedAt)));
  const code = genCode();
  await db.insert(coachInvites).values({ coachId, clientId, code, note: "客戶專用登入連結" });
  return { ok: true, code };
}

/** 這位客戶目前有效（未用）的專用碼；教練頁重整後還能看到同一條連結。 */
export async function activeClientInvite(clientId: string): Promise<string | null> {
  const rows = await db
    .select({ code: coachInvites.code })
    .from(coachInvites)
    .where(and(eq(coachInvites.clientId, clientId), isNull(coachInvites.usedAt)))
    .orderBy(desc(coachInvites.createdAt))
    .limit(1);
  return rows[0]?.code ?? null;
}

/**
 * 兌換專用連結：把登入帳號接到教練已建好的那一筆。
 *
 * 這個帳號可能早就有一筆自己的 clients 列 S（自助做過人生護照）：
 * - S 掛別的教練 → 擋（跟通用邀請一樣）。
 * - S 掛同一位教練 → 擋並點名：教練名下已經有一筆接著這個帳號，兩筆都有規劃就不能由系統猜要留哪一份。
 * - S 沒有教練（純自助）→ **併入**（Ray 2026/10/27 拍板）：S 的護照（track=client 的 plan，含 revisions）
 *   搬到目標列，自動變成教練端的「客戶的想法」；S 清掉 clientUserId、封存、不刪。
 *   清 clientUserId 是必要的：全站找「這個帳號的客戶列」都是 where clientUserId limit 1，留著會撞。
 * 不過額度：目標列本來就在教練名下，這一步不會多一位客戶。
 */
async function redeemClientInvite(code: string, inv: InviteInfo & { clientId: string }, user: ClientUser): Promise<{ ok: boolean; error?: string; coachName?: string | null }> {
  if (inv.used) {
    if (inv.usedByClientUserId === user.id) return { ok: true, coachName: inv.coachName }; // 同一帳號重開＝視同成功
    return { ok: false, error: "這條登入連結已經被使用過，請向教練重新索取" };
  }
  const tRows = await db
    .select({ id: clients.id, coachId: clients.coachId, clientUserId: clients.clientUserId, status: clients.status })
    .from(clients)
    .where(eq(clients.id, inv.clientId))
    .limit(1);
  const target = tRows[0];
  if (!target || target.coachId !== inv.coachId || target.status === "archived") return { ok: false, error: "這條登入連結已失效，請向教練重新索取" };
  if (target.clientUserId) {
    if (target.clientUserId === user.id) return { ok: true, coachName: inv.coachName };
    return { ok: false, error: "這筆規劃已由其他帳號開通，請向教練確認" };
  }
  const sRows = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  const self = sRows[0];
  if (self && self.id !== target.id) {
    if (self.coachId && self.coachId !== inv.coachId) return { ok: false, error: "你已連結其他教練，請先解除再用此連結" };
    if (self.coachId === inv.coachId) return { ok: false, error: `這個帳號已經連結到教練名下的另一筆資料（${self.name}），請向教練確認要保留哪一份` };
    // 純自助列 → 併入目標列。
    await db.update(plans).set({ clientId: target.id, updatedAt: new Date() }).where(and(eq(plans.clientId, self.id), eq(plans.track, CLIENT_TRACK)));
    await db.update(coachLinkRequests)
      .set({ status: "rejected", respondedAt: new Date() })
      .where(and(eq(coachLinkRequests.clientId, self.id), eq(coachLinkRequests.status, "pending")));
    await db.update(clients)
      .set({ clientUserId: null, status: "archived", source: `${self.source ?? "自助"}（已併入教練客戶 ${target.id}）`, updatedAt: new Date() })
      .where(eq(clients.id, self.id));
  }
  await db.update(clients).set({ clientUserId: user.id, updatedAt: new Date() }).where(eq(clients.id, target.id));
  await db.update(coachInvites).set({ usedByClientUserId: user.id, usedAt: new Date() }).where(eq(coachInvites.code, code));
  // 案件進度：客戶綁定帳號＝「已開通會員中心」，是階段 4 的完成訊號之一（失敗不擋綁定）
  try { const { recheckCommission } = await import("./serviceStore"); await recheckCommission(target.id); } catch { /* 不擋 */ }
  return { ok: true, coachName: inv.coachName };
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
  // 專用連結走自己的路：接既有列、不新建、不過額度。
  if (inv.clientId) return redeemClientInvite(code, { ...inv, clientId: inv.clientId }, user);
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
  // 已有護照 → 立刻複製成第一份年度版；還沒有 → savePassport 存檔時會補做。
  await seedCoachPlanFromPassport(client.id);
  return { ok: true, coachName: inv.coachName };
}
