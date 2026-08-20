// 教練帳號與權限（伺服器端）。
// Clerk 負責「你是誰」；這裡負責「你能不能用」（coaches 表的 role/status）。
import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { eq, count } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches, clients, compCases } from "@/Shared/db/schema";

export type Coach = typeof coaches.$inferSelect;

function adminEmails(): string[] {
  return (process.env.LANTU_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

// 只認「主要且已驗證」的 email。用 emailAddresses[0] 會把未驗證的次要信箱也算進白名單比對。
function identity(user: ClerkUser) {
  const primary = user.primaryEmailAddress;
  const verified = primary?.verification?.status === "verified";
  const email = primary?.emailAddress?.toLowerCase() ?? null;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;
  return { email, name, isAdmin: !!email && verified && adminEmails().includes(email) };
}

// 白名單雙向同步：在名單內 → 保證 admin+active；不在名單內但目前是 admin → 降回 coach。
// 從白名單移除後必須真的降回 coach，否則 admin 權限永遠撤不掉。
async function syncAdminRole(row: Coach, isAdmin: boolean): Promise<Coach> {
  if (isAdmin && (row.role !== "admin" || row.status !== "active")) {
    const r = await db
      .update(coaches)
      .set({ role: "admin", status: "active", approvedAt: row.approvedAt ?? new Date() })
      .where(eq(coaches.id, row.id))
      .returning();
    return r[0] ?? row;
  }
  if (!isAdmin && row.role === "admin") {
    const r = await db.update(coaches).set({ role: "coach" }).where(eq(coaches.id, row.id)).returning();
    return r[0] ?? row;
  }
  return row;
}

// 取得目前登入者的教練身分。**唯讀**：沒有 coaches 列就回 null，不會順手把人建成待審教練。
//
// 舊版這裡是 upsert，任何登入者只要走到 /dashboard 就被建成 status=pending —— 客戶點教練發出的
// 邀請連結、被 Clerk 的全域 fallbackRedirectUrl 丟進 /dashboard 後，就直接變成「教練申請」待審核，
// 而且永遠綁不到教練。成為教練必須是明確動作，一律走 applyAsCoach()（/dashboard/apply）。
//
// 例外：LANTU_ADMIN_EMAILS 白名單自動建立為 admin+active（列在環境變數裡就是明確意圖）。
// 既有列仍同步 email/name 與 admin 角色。
//
// 用 React cache() 包住：同一個 request 內不論被幾個 page/action/API 呼叫都只打一次 DB。
export const ensureCoach = cache(async function ensureCoach(): Promise<Coach | null> {
  const user = await currentUser();
  if (!user) return null;
  const { email, name, isAdmin } = identity(user);

  const rows = await db.select().from(coaches).where(eq(coaches.id, user.id)).limit(1);
  let row = rows[0] ?? null;

  if (!row) {
    if (!isAdmin) return null; // 一般登入者：沒申請過就不是教練
    const ins = await db
      .insert(coaches)
      .values({ id: user.id, email, name, role: "admin", status: "active", approvedAt: new Date() })
      .onConflictDoUpdate({ target: coaches.id, set: { email, name } })
      .returning();
    row = ins[0] ?? null;
    if (!row) return null;
  } else if (row.email !== email || row.name !== name) {
    const r = await db.update(coaches).set({ email, name }).where(eq(coaches.id, user.id)).returning();
    row = r[0] ?? row;
  }

  return syncAdminRole(row, isAdmin);
});

// 明確申請成為教練：建立 status=pending 的 coaches 列（待後台核准）。
// 已經有列就原樣回傳，不覆寫 status —— 停權者不能靠再申請一次把自己救回 pending。
export async function applyAsCoach(): Promise<Coach | null> {
  const user = await currentUser();
  if (!user) return null;
  const { email, name, isAdmin } = identity(user);

  const inserted = await db
    .insert(coaches)
    .values({
      id: user.id,
      email,
      name,
      role: isAdmin ? "admin" : "coach",
      status: isAdmin ? "active" : "pending",
      approvedAt: isAdmin ? new Date() : null,
    })
    .onConflictDoUpdate({ target: coaches.id, set: { email, name } })
    .returning();

  const row = inserted[0] ?? null;
  if (!row) return null;
  return syncAdminRole(row, isAdmin);
}

// admin 必須同時是 admin 且 active。舊版只看 role，導致被停權的管理員
// /dashboard 進不去、/admin 照樣進得去（還能核准帳號、把自己升成 owner、竄改品牌）。
export async function isAdmin(coach: Coach | null): Promise<boolean> {
  return !!coach && coach.role === "admin" && coach.status === "active";
}

export async function listCoaches(): Promise<Coach[]> {
  return db.select().from(coaches).orderBy(coaches.createdAt);
}

export async function setCoachStatus(id: string, status: "pending" | "active" | "suspended") {
  await db
    .update(coaches)
    .set({ status, approvedAt: status === "active" ? new Date() : null })
    .where(eq(coaches.id, id));
}

// 設定組織職級與上線（後台維護組織樹）。
// uplineId 會先做「整條上線鏈」的環狀檢查：A→B→A 這種多層環雖然不會讓 downlineIds 無限迴圈
// （有 seen Set），但會讓兩位主管互看對方團隊，且該子樹在老闆視角整段消失。
export async function setCoachOrg(id: string, orgRank: string, uplineId: string | null) {
  if (uplineId) {
    if (uplineId === id) return { ok: false as const, error: "上線不能是自己" };
    const all = await db.select({ id: coaches.id, uplineId: coaches.uplineId }).from(coaches);
    const parent = new Map(all.map((c) => [c.id, c.uplineId]));
    let cur: string | null | undefined = uplineId;
    const seen = new Set<string>();
    while (cur) {
      if (cur === id) return { ok: false as const, error: "會形成組織環（該教練已在你的下線）" };
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = parent.get(cur) ?? null;
    }
  }
  await db.update(coaches).set({ orgRank, uplineId }).where(eq(coaches.id, id));
  return { ok: true as const };
}

// ── 教練離職／移除 ────────────────────────────────────────────────
// 「移除帳號」是給誤建帳號用的稀有動作；正常離職一律走停權（setCoachStatus('suspended')），
// 停權不動任何資料。移除之前必須把兩件事清乾淨，否則資料庫的 RESTRICT 也會擋下來：
//   clients   —— 客戶與規劃是公司資產，要先轉移給接手教練
//   compCases —— 分潤案件是財務紀錄，一旦有過就不可移除（只能停權）

export type CoachWorkload = { clients: number; cases: number };

// 一次算出所有教練的「名下客戶數 / 分潤案件數」，給 /admin 列表用。
// 不逐列查：教練數會長，逐列查就是 N+1。
export async function coachWorkloads(): Promise<Record<string, CoachWorkload>> {
  const [cl, cs] = await Promise.all([
    db.select({ id: clients.coachId, n: count() }).from(clients).groupBy(clients.coachId),
    db.select({ id: compCases.executorId, n: count() }).from(compCases).groupBy(compCases.executorId),
  ]);
  const out: Record<string, CoachWorkload> = {};
  for (const r of cl) {
    if (!r.id) continue; // coachId 為 null＝自助客戶，不屬於任何教練
    out[r.id] = { clients: Number(r.n), cases: 0 };
  }
  for (const r of cs) {
    if (!r.id) continue;
    out[r.id] = { clients: out[r.id]?.clients ?? 0, cases: Number(r.n) };
  }
  return out;
}

export async function coachWorkload(coachId: string): Promise<CoachWorkload> {
  const [cl, cs] = await Promise.all([
    db.select({ n: count() }).from(clients).where(eq(clients.coachId, coachId)),
    db.select({ n: count() }).from(compCases).where(eq(compCases.executorId, coachId)),
  ]);
  return { clients: Number(cl[0]?.n ?? 0), cases: Number(cs[0]?.n ?? 0) };
}

// 把 from 名下的客戶整批轉給 to。只動 clients.coachId ——
// 刻意不碰 compCases.executorId：改掉「誰執行了這個案子」會竄改已發分潤與晉升指標的依據。
export async function transferClients(
  fromCoachId: string,
  toCoachId: string,
): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  if (fromCoachId === toCoachId) return { ok: false, error: "接手教練不能是同一人" };
  const to = await db.select().from(coaches).where(eq(coaches.id, toCoachId)).limit(1);
  if (!to[0]) return { ok: false, error: "找不到接手教練" };
  if (to[0].status !== "active") return { ok: false, error: "接手教練必須是已開通狀態" };

  const moved = await db
    .update(clients)
    .set({ coachId: toCoachId, updatedAt: new Date() })
    .where(eq(clients.coachId, fromCoachId))
    .returning({ id: clients.id });
  return { ok: true, moved: moved.length };
}

// 移除教練帳號。名下還有客戶或有任何分潤案件都拒絕 ——
// DB 的 RESTRICT 是最後一道，這裡先擋是為了給得出人看得懂的理由。
export async function removeCoach(
  id: string,
  operatorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (id === operatorId) return { ok: false, error: "不能移除自己的帳號" };
  const rows = await db.select().from(coaches).where(eq(coaches.id, id)).limit(1);
  if (!rows[0]) return { ok: false, error: "找不到這個教練帳號" };

  const w = await coachWorkload(id);
  if (w.cases > 0) {
    return { ok: false, error: `有 ${w.cases} 筆案件分潤紀錄，依稽核不可移除，請改用停權` };
  }
  if (w.clients > 0) {
    return { ok: false, error: `名下還有 ${w.clients} 位客戶，請先轉移給接手教練` };
  }

  // 下線的 upline_id 是 SET NULL，會自己斷開；其餘 CASCADE 的都是這位教練自己的資料。
  await db.delete(coaches).where(eq(coaches.id, id));
  return { ok: true };
}
