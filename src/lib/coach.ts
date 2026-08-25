// 教練帳號與權限（伺服器端）。
// Clerk 負責「你是誰」；這裡負責「你能不能用」（coaches 表的 role/status）。
import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { eq, count } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches, clients, compCases } from "@/Shared/db/schema";
import { allocCode } from "./codeAlloc";
import { normalizeCode } from "./codes";
// 顯示名稱的唯一真相（純函式＋SQL 版同住一處，語意不會走鐘）。
import { displayNameOf, DISPLAY_NAME_MAX } from "./coachName";

/**
 * ⚠️ **`Coach.name` 是「顯示名稱」，不是 DB 的 `coaches.name`。**
 *
 * `ensureCoach()` / `applyAsCoach()` 回傳前會把 `name` 換成 `displayNameOf(row)`
 * （教練自填優先，沒填才用 Clerk 姓名），Clerk 的原名留在 `clerkName`。
 *
 * 為什麼要這樣偷天換日：Ray 2026/08/24 要「教練改了名字全站都換」。
 * `coaches.name` 被 8 支查詢直接選出去、又散在頁首／工作台／分潤鏈裡，
 * 逐處改一定會漏，而漏一處就是「官網叫雷立揚、後台叫立揚 雷」。
 * 從回傳值就換掉，顯示層一行都不用動，也不可能漏。
 *
 * 要拿登入帳號的真名（後台辨識身分）請用 `clerkName`。**不要**把 `name` 寫回 DB。
 */
export type Coach = Omit<CoachRow, "name"> & {
  /** 顯示名稱。永遠有值（最後退路是「教練」），所以型別上不是 nullable。 */
  name: string;
  /** 登入帳號的真名（Clerk）。只有 /admin 名冊在用。 */
  clerkName: string | null;
};

/** DB 原始列（`name` 還是 Clerk 鏡像）。只在這個檔案內部流通。 */
type CoachRow = typeof coaches.$inferSelect;

/**
 * 把 DB 列包成對外的 Coach：`name` 換成顯示名，原名移到 `clerkName`。
 * ⚠️ 所有回傳 Coach 的路徑都必須經過這裡 —— coach.drift.test.ts 會掃。
 */
function withDisplayName(row: CoachRow): Coach {
  return { ...row, clerkName: row.name, name: displayNameOf(row) };
}

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
async function syncAdminRole(row: CoachRow, isAdmin: boolean): Promise<CoachRow> {
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

  return withDisplayName(await withCode(await syncAdminRole(row, isAdmin)));
});

// 已開通卻沒有編號的教練補發一個（白名單自動建的 admin、以及回填之前就存在的舊帳號）。
// 這不違反「ensureCoach 唯讀」——那條規矩是「不准無中生有一列 coaches」，
// 這裡只在既有列上補一個冪等欄位，而且 code 一有值就完全不打 DB。
async function withCode(row: CoachRow): Promise<CoachRow> {
  if (row.status !== "active" || row.code) return row;
  const code = await ensureCoachCode(row.id);
  return code ? { ...row, code } : row;
}

/**
 * 申請表單填的四樣東西（2026/08/25）。
 *
 * 為什麼不是「多開四個欄位」：
 * · 姓名 → `display_name`。**絕對不能寫 `name`** —— 那欄是 Clerk 鏡像，
 *   `ensureCoach()` 下一次導頁就用 Clerk 的 firstName+lastName 蓋回去（見檔頭那段）。
 * · 手機＋現職 → `note`（後台備註欄）。`title` 是「制度職稱」會被印到內部畫面上，
 *   拿它裝「現職：OO人壽業務」等於讓申請人的舊頭銜變成嵐途的頭銜。
 * · 推薦人編號 → 解成 `sponsor_id`（既有的推薦人欄位，同業招募的業績歸屬就吃它）。
 */
export type CoachApplication = {
  name?: string | null;
  phone?: string | null;
  currentJob?: string | null;
  sponsorCode?: string | null;
};

const APPLY_FIELD_MAX = 60;
const clip = (v: string | null | undefined, max = APPLY_FIELD_MAX) => (v ?? "").trim().slice(0, max);

/** 把申請資料組成後台看得懂的一行。查無推薦人編號也照樣留字串（是線索，不是錯誤）。 */
function applyNote(input: CoachApplication, sponsorName: string | null): string {
  const parts = [
    clip(input.phone) ? `手機：${clip(input.phone)}` : "",
    clip(input.currentJob) ? `現職：${clip(input.currentJob)}` : "",
    clip(input.sponsorCode)
      ? `推薦人：${normalizeCode(clip(input.sponsorCode))}${sponsorName ? `（${sponsorName}）` : "（查無此編號）"}`
      : "",
  ].filter(Boolean);
  return parts.length ? `申請資料｜${parts.join("｜")}` : "";
}

// 明確申請成為教練：建立 status=pending 的 coaches 列（待後台核准）。
// 已經有列就原樣回傳，不覆寫 status —— 停權者不能靠再申請一次把自己救回 pending。
//
// ⚠️ 申請表單那四欄**只在「這一列還是待審」時才寫**：已核准的教練誤觸申請頁
//    （或按了瀏覽器上一頁重送），不能把他自己設定過的顯示名稱與後台備註洗掉。
export async function applyAsCoach(input: CoachApplication = {}): Promise<Coach | null> {
  const user = await currentUser();
  if (!user) return null;
  const { email, name, isAdmin } = identity(user);

  // 推薦人：用教練編號解人。查無不擋送出（可能只是打錯或對方還沒發號），留在 note 給後台判斷。
  let sponsorId: string | null = null;
  let sponsorName: string | null = null;
  const rawSponsor = normalizeCode(clip(input.sponsorCode, 20));
  if (rawSponsor) {
    const found = await db
      .select({ id: coaches.id, name: coaches.name, displayName: coaches.displayName, email: coaches.email })
      .from(coaches)
      .where(eq(coaches.code, rawSponsor))
      .limit(1);
    if (found[0]) {
      sponsorId = found[0].id;
      sponsorName = displayNameOf(found[0]);
    }
  }

  const selfName = clip(input.name, DISPLAY_NAME_MAX);
  const note = applyNote(input, sponsorName);

  const existing = await db.select().from(coaches).where(eq(coaches.id, user.id)).limit(1);
  const fresh = !existing[0];
  const stillPending = existing[0]?.status === "pending";

  const applyFields =
    fresh || stillPending
      ? {
          ...(selfName ? { displayName: selfName } : {}),
          ...(note ? { note } : {}),
          ...(sponsorId ? { sponsorId } : {}),
        }
      : {};

  const inserted = await db
    .insert(coaches)
    .values({
      id: user.id,
      email,
      name,
      role: isAdmin ? "admin" : "coach",
      status: isAdmin ? "active" : "pending",
      approvedAt: isAdmin ? new Date() : null,
      ...applyFields,
    })
    .onConflictDoUpdate({ target: coaches.id, set: { email, name, ...applyFields } })
    .returning();

  const row = inserted[0] ?? null;
  if (!row) return null;
  return withDisplayName(await withCode(await syncAdminRole(row, isAdmin)));
}

// 後台權限有兩條來源，任一成立即可，但都必須 active：
//   1. role==='admin'  —— LANTU_ADMIN_EMAILS 白名單同步出來的系統管理員
//   2. orgRank==='owner' —— 核心成員（2026/08/22 Ray 拍板：核心成員等同 admin，後台全開）
// 必須同時是 active。舊版只看 role，導致被停權的管理員 /dashboard 進不去、
// /admin 照樣進得去（還能核准帳號、把自己升成核心成員、竄改品牌）。
//
// 注意：orgRank 的 DB 值仍是 'owner'（brand.getOrgOwnerId / visibleCoachIds 都吃它），
// 只有顯示字串改成「核心成員」。
export async function isAdmin(coach: Coach | null): Promise<boolean> {
  if (!coach || coach.status !== "active") return false;
  return coach.role === "admin" || coach.orgRank === "owner";
}

/**
 * 教練自己改對外顯示名稱。空字串＝清掉自填、回到 Clerk 姓名。
 * ⚠️ 寫的是 `display_name`，**絕對不要寫 `name`** —— 那是 Clerk 鏡像，
 *    下一次 ensureCoach() 就會把它蓋回去，使用者會覺得「改了又跳回來」。
 */
export async function saveDisplayName(id: string, raw: string): Promise<void> {
  const v = (raw ?? "").trim().slice(0, DISPLAY_NAME_MAX);
  await db.update(coaches).set({ displayName: v || null }).where(eq(coaches.id, id));
}

export async function listCoaches(): Promise<Coach[]> {
  // 後台名冊也要顯示名 —— 但 /admin 會另外把 clerkName 印成小字，方便對得上登入帳號。
  const rows = await db.select().from(coaches).orderBy(coaches.createdAt);
  return rows.map(withDisplayName);
}

export async function setCoachStatus(id: string, status: "pending" | "active" | "suspended") {
  await db
    .update(coaches)
    .set({ status, approvedAt: status === "active" ? new Date() : null })
    .where(eq(coaches.id, id));
  if (status === "active") await ensureCoachCode(id);
}

/**
 * 「核准報聘」那一刻發教練編號（FC + YYMM + 三碼流水號）。
 *
 * ⚠️ 只在 code 還是 null 時發：停權後再核准、或後台連按兩次「核准」，都必須拿回同一個號。
 *    先讀再寫在這裡是安全的——重複配號最多浪費一個流水號，而 coaches_code_uidx
 *    會擋掉真正的重號；相對地「每次核准都重發」會讓已經印在名片上的號失效。
 */
export async function ensureCoachCode(id: string): Promise<string | null> {
  const rows = await db.select({ code: coaches.code }).from(coaches).where(eq(coaches.id, id)).limit(1);
  if (!rows[0]) return null;
  if (rows[0].code) return rows[0].code;
  const code = await allocCode("coach");
  await db.update(coaches).set({ code }).where(eq(coaches.id, id));
  return code;
}

// 設定組織職級與上線（後台維護組織樹）。
// uplineId 會先做「整條上線鏈」的環狀檢查：A→B→A 這種多層環雖然不會讓 downlineIds 無限迴圈
// （有 seen Set），但會讓兩位主管互看對方團隊，且該子樹在核心成員視角整段消失。
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
