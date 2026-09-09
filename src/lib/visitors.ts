// 訪客記錄（2026/09/09 Ray）：後台要看得到「有多少外部客戶登入過」，
// 以及每一位走到了哪一步——註冊 → 存檔人生護照 → 指定教練 → 申請成為教練。
//
// 為什麼要有這一支：這四件事分散在五張表（client_users / clients / plans /
// coach_link_requests / coaches+coach_applications），此前後台沒有任何一頁把它們接起來，
// 只能一張一張查、還看不出同一個人的順序。
//
// ⚠️ 一律「整批撈、在記憶體裡併」，不逐位查（六張表 × N 位訪客就是 N+1）。
//    真正的合併寫在純函式 shapeVisitors() 裡，測試釘的是它。
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import {
  clientLoginEvents, clientUsers, clients, coachApplications, coachDisplayName,
  coachLinkRequests, coaches, plans,
} from "@/Shared/db/schema";

export type PassportState = { saved: boolean; updatedAt: Date | null; healthGrade: string | null };
export type CoachState = { state: "none" | "pending" | "linked"; name: string | null };
export type ApplyState = {
  state: "none" | "introducer" | "review" | "active" | "suspended";
  submittedAt: Date | null;
};

export type Visitor = {
  id: string;
  name: string | null;
  email: string | null;
  status: string;              // client_users.status：active / suspended
  createdAt: Date;             // 註冊時間
  lastLoginAt: Date | null;
  loginCount: number;
  clientCode: string | null;   // 客戶編號（存過護照才有）
  passport: PassportState;
  coach: CoachState;
  apply: ApplyState;
};

export type VisitorStats = {
  total: number;
  active7d: number;
  passportSaved: number;
  coachLinked: number;
  applying: number;
  /** 註冊之後再也沒回來過（登入次數 ≤ 1）。 */
  oneShot: number;
};

// ── 純函式：把各表撈回來的東西併成一列一位訪客 ──────────────────────
export type ShapeInput = {
  users: { id: string; name: string | null; email: string | null; status: string; createdAt: Date; lastLoginAt: Date | null; loginCount: number }[];
  clients: { id: string; clientUserId: string | null; coachId: string | null; code: string | null }[];
  plans: { clientId: string; updatedAt: Date; healthGrade: string | null }[];
  pendingLinks: { clientId: string; coachId: string }[];
  coachNames: Record<string, string>;
  applicants: { id: string; status: string }[];
  applications: { coachId: string; introducerState: string; submittedAt: Date }[];
};

export function shapeVisitors(input: ShapeInput): Visitor[] {
  const clientByUser = new Map<string, ShapeInput["clients"][number]>();
  for (const c of input.clients) if (c.clientUserId) clientByUser.set(c.clientUserId, c);
  // 同一位客戶只留最新的一份護照（理論上 track='client' 一年一份，跨年會有兩份）。
  const planByClient = new Map<string, ShapeInput["plans"][number]>();
  for (const p of input.plans) {
    const cur = planByClient.get(p.clientId);
    if (!cur || cur.updatedAt < p.updatedAt) planByClient.set(p.clientId, p);
  }
  const pendingByClient = new Map(input.pendingLinks.map((r) => [r.clientId, r.coachId]));
  const applicantById = new Map(input.applicants.map((a) => [a.id, a.status]));
  const appByCoach = new Map(input.applications.map((a) => [a.coachId, a]));

  return input.users.map((u) => {
    const client = clientByUser.get(u.id) ?? null;
    const plan = client ? planByClient.get(client.id) ?? null : null;

    // 指定教練有三態，且順序不能顛倒：已掛上的人身上可能還留著早期的 pending 列。
    let coach: CoachState = { state: "none", name: null };
    if (client?.coachId) {
      coach = { state: "linked", name: input.coachNames[client.coachId] ?? null };
    } else if (client && pendingByClient.has(client.id)) {
      const cid = pendingByClient.get(client.id)!;
      coach = { state: "pending", name: input.coachNames[cid] ?? null };
    }

    // 報聘：有 coaches 列才算送出過。pending 再細分「等推薦人確認」與「等後台審核」——
    // 前者是**申請人自己要去催推薦人**，後者才是後台的事，混成一個「審核中」會讓後台
    // 把永遠不會動的那幾筆當成自己的待辦。
    const coachStatus = applicantById.get(u.id) ?? null;
    const app = appByCoach.get(u.id) ?? null;
    let apply: ApplyState = { state: "none", submittedAt: app?.submittedAt ?? null };
    if (coachStatus === "active") apply = { state: "active", submittedAt: app?.submittedAt ?? null };
    else if (coachStatus === "suspended") apply = { state: "suspended", submittedAt: app?.submittedAt ?? null };
    else if (coachStatus === "pending") {
      apply = {
        state: app?.introducerState === "pending" ? "introducer" : "review",
        submittedAt: app?.submittedAt ?? null,
      };
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      loginCount: u.loginCount,
      clientCode: client?.code ?? null,
      passport: { saved: !!plan, updatedAt: plan?.updatedAt ?? null, healthGrade: plan?.healthGrade ?? null },
      coach,
      apply,
    };
  });
}

/**
 * 畫面要的「現在」（毫秒）。
 * ⚠️ 刻意住在這裡而不是 page/board 裡：Date.now() 在 render 中呼叫是不純的，
 *    react-hooks/purity 會擋——而且它擋得有道理（同一份畫面兩次渲染會得到不同的「幾天前」）。
 *    伺服器端算一次、當 prop 傳下去，整張表的相對時間才會一致。
 */
export function visitorNow(): number {
  return Date.now();
}

export function visitorStats(rows: Visitor[], now = new Date()): VisitorStats {
  const week = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return {
    total: rows.length,
    active7d: rows.filter((r) => r.lastLoginAt && r.lastLoginAt.getTime() >= week).length,
    passportSaved: rows.filter((r) => r.passport.saved).length,
    coachLinked: rows.filter((r) => r.coach.state === "linked").length,
    applying: rows.filter((r) => r.apply.state === "introducer" || r.apply.state === "review").length,
    // ⚠️ 登入次數 0 的是「這個欄位上線前就註冊的舊帳號」，不是沒回來過——
    //    但兩者在畫面上都該被看見，所以 ≤ 1 一起算，欄位本身顯示「—」讓人分得出來。
    oneShot: rows.filter((r) => r.loginCount <= 1).length,
  };
}

// ── 資料層 ────────────────────────────────────────────────────────
export async function listVisitors(): Promise<Visitor[]> {
  const users = await db
    .select({
      id: clientUsers.id, name: clientUsers.name, email: clientUsers.email,
      status: clientUsers.status, createdAt: clientUsers.createdAt,
      lastLoginAt: clientUsers.lastLoginAt, loginCount: clientUsers.loginCount,
    })
    .from(clientUsers)
    .orderBy(desc(clientUsers.createdAt));
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);

  const clientRows = await db
    .select({ id: clients.id, clientUserId: clients.clientUserId, coachId: clients.coachId, code: clients.code })
    .from(clients)
    .where(inArray(clients.clientUserId, ids));
  const clientIds = clientRows.map((c) => c.id);

  const [planRows, pendingRows, applicantRows, appRows, coachRows] = await Promise.all([
    clientIds.length
      ? db.select({ clientId: plans.clientId, updatedAt: plans.updatedAt, healthGrade: plans.healthGrade })
          .from(plans).where(and(inArray(plans.clientId, clientIds), eq(plans.track, "client")))
      : Promise.resolve([]),
    clientIds.length
      ? db.select({ clientId: coachLinkRequests.clientId, coachId: coachLinkRequests.coachId })
          .from(coachLinkRequests)
          .where(and(inArray(coachLinkRequests.clientId, clientIds), eq(coachLinkRequests.status, "pending")))
      : Promise.resolve([]),
    db.select({ id: coaches.id, status: coaches.status }).from(coaches).where(inArray(coaches.id, ids)),
    db.select({ coachId: coachApplications.coachId, introducerState: coachApplications.introducerState, submittedAt: coachApplications.submittedAt })
      .from(coachApplications).where(inArray(coachApplications.coachId, ids)),
    // 教練名字：只有兩處要用（已掛上 / 待接受），整張表一次撈完最省，教練數量是數十列。
    db.select({ id: coaches.id, name: coachDisplayName }).from(coaches),
  ]);

  const coachNames: Record<string, string> = {};
  for (const c of coachRows) if (c.name) coachNames[c.id] = c.name;

  return shapeVisitors({
    users, clients: clientRows, plans: planRows, pendingLinks: pendingRows,
    coachNames, applicants: applicantRows, applications: appRows,
  });
}

export type LoginEvent = { id: string; at: Date; sessionId: string | null };

/** 單一訪客的完整登入歷史（Ray：全部保留，不設保存期限）。 */
export async function listLoginEvents(clientUserId: string, limit = 500): Promise<LoginEvent[]> {
  return db
    .select({ id: clientLoginEvents.id, at: clientLoginEvents.at, sessionId: clientLoginEvents.sessionId })
    .from(clientLoginEvents)
    .where(eq(clientLoginEvents.clientUserId, clientUserId))
    .orderBy(desc(clientLoginEvents.at))
    .limit(limit);
}

export async function getVisitor(clientUserId: string): Promise<Visitor | null> {
  const all = await listVisitors();
  return all.find((v) => v.id === clientUserId) ?? null;
}
