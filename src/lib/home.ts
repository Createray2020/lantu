// 首頁彙總層：依角色（教練／主管／核心成員）把各卡片要的數字算出來。
// 有真實資料源的（客戶／待辦／約訪、組織樹、成員名冊）直接接；
// 業績／活動量／增員／公告由 member_metrics / recruits / announcements 承載
// ——那些是**真的資料表**，由後台填，只是上線初期還沒有人填。
//
// ⚠️⚠️ hasMetrics（2026/08/30 Ray 拍板）：沒有任何 member_metrics 列時，
//    收益、達成率、留存率、組織健康度這些數字全部會算成 0／0%。
//    畫面上的「0 分」跟假數字一樣糟——它看起來是一個結論，實際上只是「沒人填」。
//    所以這裡把「有沒有資料」跟「資料是 0」分開，讓 HomeView 有辦法說實話。
import { and, inArray, eq, desc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { memberMetrics, recruits, announcements, coaches, clients, reviews } from "@/Shared/db/schema";
import { getCoachDashboard } from "./dashboard";
import {
  listActiveCoaches, teamsUnder, downlineIds, visibleCoachIds, rankOf,
  type CoachRow, type OrgRank,
} from "./org";

// ---------- 期間工具 ----------
export function currentPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function lastPeriods(period: string, n: number): string[] {
  const out: string[] = [];
  let p = period;
  for (let i = 0; i < n; i++) { out.unshift(p); p = prevPeriod(p); }
  return out;
}
export function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${y}年${Number(m)}月`;
}
export function todayLabel(d = new Date()): string {
  const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${wd}`;
}
function todayISO(d = new Date()): string { return d.toISOString().slice(0, 10); }

export type Metric = typeof memberMetrics.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;

// period 條件要下推到 SQL。舊版把該教練「所有期間」的列全撈回 Node 再 filter，
// 100 位教練 × 36 個月＝3600 列拉回來丟掉 97%，而核心成員首頁一次 render 會呼叫 2~4 次。
async function metricsFor(period: string, coachIds: string[]): Promise<Map<string, Metric>> {
  if (!coachIds.length) return new Map();
  const rows = await db.select().from(memberMetrics)
    .where(and(inArray(memberMetrics.coachId, coachIds), eq(memberMetrics.period, period)));
  const map = new Map<string, Metric>();
  for (const r of rows) map.set(r.coachId, r);
  return map;
}

async function listAnnouncements(): Promise<Announcement[]> {
  const rows = await db.select().from(announcements)
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt));
  return rows.slice(0, 5);
}

// ---------- 教練（member）----------
export type MemberHome = {
  coach: { name: string; title: string | null };
  /** 本期有沒有 member_metrics 那一列。false ＝畫面要說「尚未有資料」而不是 0。 */
  hasMetrics: boolean;
  kpis: { income: number; incomeGoal: number; deals: number; dealsGoal: number; newClients: number; openItems: number; todayAppts: number };
  progressPct: number;
  todos: { time: string; title: string; sub: string; tag: string; tagKind: string }[];
  watch: { name: string; note: string; tag: string; tagKind: string; dot: string }[];
  goals: { label: string; cur: number; goal: number; unit: string; kind: string }[];
  compliance: { ceHours: number; ceHoursGoal: number; licenseNote: string | null; kycPending: number };
  announcements: Announcement[];
};

export async function getMemberHome(coach: CoachRow, period: string): Promise<MemberHome> {
  const d = await getCoachDashboard(coach.id);
  const m = (await metricsFor(period, [coach.id])).get(coach.id);
  const today = todayISO();
  const income = m?.income ?? 0, incomeGoal = m?.incomeGoal || 1;
  const kycPending = Object.entries(d.byStatus).find(([k]) => k === "pending")?.[1] ?? 0;

  const todos: MemberHome["todos"] = [];
  for (const a of d.thisWeek.slice(0, 3)) {
    todos.push({ time: a.date === today ? "今天" : a.date.slice(5).replace("-", "/"), title: `${a.clientName} · ${a.type}`, sub: "約訪 / 諮詢", tag: "約訪", tagKind: "blue" });
  }
  for (const it of d.openItems.slice(0, 3)) {
    todos.push({ time: it.dueDate ? it.dueDate.slice(5).replace("-", "/") : "—", title: `${it.clientName} · ${it.title}`, sub: it.owner ? `負責：${it.owner}` : "待辦動作", tag: it.overdue ? "逾期" : "待辦", tagKind: it.overdue ? "warn" : "amber" });
  }

  const watch: MemberHome["watch"] = [];
  for (const o of d.overdue.slice(0, 4)) {
    watch.push({ name: o.clientName, note: `逾期未檢視（${o.date}）`, tag: "需跟進", tagKind: "warn", dot: "warn" });
  }
  for (const it of d.openItems.slice(0, 4 - watch.length)) {
    if (watch.find((w) => w.name === it.clientName)) continue;
    watch.push({ name: it.clientName, note: it.title, tag: "進行中", tagKind: "green", dot: "ok" });
  }

  return {
    coach: { name: coach.name ?? "教練", title: coach.title },
    hasMetrics: !!m,
    kpis: {
      income, incomeGoal: m?.incomeGoal ?? 0,
      deals: m?.deals ?? 0, dealsGoal: m?.dealsGoal ?? 0,
      newClients: m?.newClients ?? d.counts.total,
      openItems: d.counts.openItems,
      todayAppts: d.thisWeek.filter((a) => a.date === today).length,
    },
    progressPct: Math.min(100, Math.round((income / incomeGoal) * 100)),
    todos,
    watch,
    goals: [
      { label: "收益月目標", cur: income, goal: m?.incomeGoal ?? 0, unit: "money", kind: "amber" },
      { label: "案件月目標", cur: m?.deals ?? 0, goal: m?.dealsGoal ?? 0, unit: " 案", kind: "teal" },
      { label: "活動量目標", cur: (m ? m.visits + m.calls + m.proposals + m.closes : 0), goal: m?.activityGoal ?? 0, unit: " 次", kind: "green" },
    ],
    compliance: { ceHours: m?.ceHours ?? 0, ceHoursGoal: m?.ceHoursGoal ?? 12, licenseNote: m?.licenseNote ?? null, kycPending },
    announcements: await listAnnouncements(),
  };
}

// ---------- 主管（manager）----------
export type ManagerHome = {
  teamName: string;
  memberCount: number;
  /** 這個團隊本期有沒有任何一位填了 member_metrics。false ＝畫面要說「尚未有資料」而不是 0。 */
  hasMetrics: boolean;
  kpis: { teamIncome: number; teamGoal: number; achievePct: number; activity: number; recruitsActive: number; pending: number };
  leaderboard: { name: string; income: number }[];
  activity: { visits: number; calls: number; proposals: number; closes: number };
  funnel: { label: string; value: number }[];
  pending: { title: string; sub: string; tag: string; tagKind: string }[];
  weekly: number[];
  announcements: Announcement[];
};

const STAGE_LABEL: Record<string, string> = { prospect: "準增員名單", contact: "接觸中", interview: "面談", offer: "錄取", onboard: "到職" };
const STAGE_ORDER = ["prospect", "contact", "interview", "offer", "onboard"];

// 純函式版：吃已經撈回來的 recruits 列，避免同一批資料查兩次。
function recruitFunnelFrom(rows: { stage: string }[]): { label: string; value: number }[] {
  const count: Record<string, number> = {};
  for (const r of rows) count[r.stage] = (count[r.stage] ?? 0) + 1;
  // 漏斗以「該階段(含)之後」的累計呈現遞減。
  return STAGE_ORDER.map((s, i) => ({
    label: STAGE_LABEL[s],
    value: STAGE_ORDER.slice(i).reduce((acc, st) => acc + (count[st] ?? 0), 0),
  }));
}

async function teamWeeklyAppts(memberIds: string[]): Promise<number[]> {
  const week = [0, 0, 0, 0, 0, 0, 0];
  if (!memberIds.length) return week;
  // ⚠️ 明列欄位。這裡要的只有 id，而 `select()` 會把整批客戶列（含 contact jsonb、tags、
  // 各種備註）撈回 Node 再丟掉 —— 一個 20 人的處，底下幾百位客戶，每次開主管首頁都搬一次。
  const clientRows = await db.select({ id: clients.id }).from(clients).where(inArray(clients.coachId, memberIds));
  const cids = clientRows.map((c) => c.id);
  if (!cids.length) return week;
  // 同上：本週預約只用得到 nextAppt。
  const rev = await db.select({ nextAppt: reviews.nextAppt }).from(reviews).where(inArray(reviews.clientId, cids));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - today.getDay()); // 本週日
  for (const r of rev) {
    if (!r.nextAppt) continue;
    const d = new Date(r.nextAppt + "T00:00:00");
    const diff = Math.floor((d.getTime() - start.getTime()) / 86400000);
    if (diff >= 0 && diff < 7) week[diff] += 1;
  }
  return week;
}

export async function getManagerHome(manager: CoachRow, all: CoachRow[], period: string): Promise<ManagerHome> {
  const teamIds = downlineIds(manager.id, all);
  const memberIds = teamIds.filter((id) => id !== manager.id);
  const metrics = await metricsFor(period, teamIds);
  const nameOf = new Map(all.map((c) => [c.id, c.name ?? ""] as const));

  let teamIncome = 0, teamGoal = 0, visits = 0, calls = 0, proposals = 0, closes = 0;
  const board: { name: string; income: number }[] = [];
  for (const id of memberIds) {
    const m = metrics.get(id);
    if (!m) continue;
    teamIncome += m.income; teamGoal += m.incomeGoal;
    visits += m.visits; calls += m.calls; proposals += m.proposals; closes += m.closes;
    board.push({ name: nameOf.get(id) ?? "", income: m.income });
  }
  board.sort((a, b) => b.income - a.income);

  // 同一批 recruits 只查一次，funnel 由已取得的列算（舊版用同一組 teamIds 連查兩次）。
  const recRows = await db.select().from(recruits).where(inArray(recruits.ownerCoachId, teamIds));
  const funnel = recruitFunnelFrom(recRows);
  const recruitsActive = recRows.filter((r) => r.stage !== "onboard").length;

  // 待審核：直屬夥伴中 status=pending 的教練 + 增員在「錄取」階段（待簽核）。
  const pendingCoaches = await db.select().from(coaches).where(eq(coaches.status, "pending"));
  const teamPending = pendingCoaches.filter((c) => c.uplineId && teamIds.includes(c.uplineId));
  const pending: ManagerHome["pending"] = [];
  for (const c of teamPending.slice(0, 3)) pending.push({ title: `${c.name ?? "新人"} · 帳號待開通`, sub: c.email ?? "待指派培訓路徑", tag: "開通", tagKind: "green" });
  for (const r of recRows.filter((r) => r.stage === "offer").slice(0, 2)) pending.push({ title: `增員錄取單 · ${r.candidateName}`, sub: `${nameOf.get(r.ownerCoachId) ?? ""} 提報 · 待簽核`, tag: "簽核", tagKind: "amber" });

  const activity = visits + calls + proposals + closes;
  return {
    teamName: manager.title || `${manager.name ?? ""}的團隊`,
    memberCount: memberIds.length,
    hasMetrics: metrics.size > 0,
    kpis: {
      teamIncome, teamGoal,
      achievePct: teamGoal ? Math.round((teamIncome / teamGoal) * 100) : 0,
      activity, recruitsActive,
      pending: teamPending.length + recRows.filter((r) => r.stage === "offer").length,
    },
    leaderboard: board,
    activity: { visits, calls, proposals, closes },
    funnel,
    pending,
    weekly: await teamWeeklyAppts(memberIds),
    announcements: await listAnnouncements(),
  };
}

// ---------- 核心成員（owner）----------
export type OwnerHome = {
  /** 全組織本期有沒有任何一位填了 member_metrics。 */
  hasMetrics: boolean;
  kpis: { income: number; growthPct: number; headcount: number; retention: number; activity: number };
  healthScore: number;
  health: { label: string; pct: number; color: string }[];
  funnel: { label: string; value: number }[];
  teams: { name: string; income: number; headcount: number; achievePct: number }[];
  trend: { period: string; value: number }[];
  top5: { name: string; income: number }[];
  announcements: Announcement[];
};

export async function getOwnerHome(owner: CoachRow, all: CoachRow[], period: string): Promise<OwnerHome> {
  const ids = all.map((c) => c.id);
  const nameOf = new Map(all.map((c) => [c.id, c.name ?? ""] as const));
  const cur = await metricsFor(period, ids);
  const prev = await metricsFor(prevPeriod(period), ids);

  const memberRows = all.filter((c) => rankOf(c) === "member");
  let income = 0, incomeGoal = 0, visits = 0, calls = 0, proposals = 0, closes = 0, activityGoal = 0, retSum = 0, retN = 0, producing = 0;
  for (const c of memberRows) {
    const m = cur.get(c.id);
    if (!m) continue;
    income += m.income; incomeGoal += m.incomeGoal;
    visits += m.visits; calls += m.calls; proposals += m.proposals; closes += m.closes;
    activityGoal += m.activityGoal;
    if (m.retentionRate) { retSum += m.retentionRate; retN++; }
    if (m.income > 0) producing++;
  }
  let prevIncome = 0;
  for (const c of memberRows) prevIncome += prev.get(c.id)?.income ?? 0;
  const activity = visits + calls + proposals + closes;
  const retention = retN ? Math.round(retSum / retN) : 0;
  const advisorRetention = memberRows.length ? Math.round((producing / memberRows.length) * 100) : 0;

  // 增員動能：全組織 recruits 進到 offer/onboard 的比例。
  const recRows = await db.select().from(recruits).where(inArray(recruits.ownerCoachId, ids));
  const recruitMomentum = recRows.length ? Math.round((recRows.filter((r) => r.stage === "offer" || r.stage === "onboard").length / recRows.length) * 100) : 0;

  const mAchieve = incomeGoal ? Math.round((income / incomeGoal) * 100) : 0;
  const mActivity = activityGoal ? Math.min(100, Math.round((activity / activityGoal) * 100)) : 0;
  const health = [
    { label: "業績達成", pct: mAchieve, color: "#c99a5b" },
    { label: "活動量", pct: mActivity, color: "#8fc0a3" },
    { label: "增員動能", pct: recruitMomentum, color: "#e08a68" },
    { label: "客戶留存", pct: retention, color: "#8fc0a3" },
    { label: "教練留存", pct: advisorRetention, color: "#a9bccf" },
  ];
  const healthScore = Math.round(health.reduce((a, h) => a + h.pct, 0) / health.length);

  // 各團隊對比。
  const teams = teamsUnder(owner.id, all).map((t) => {
    let ti = 0, tg = 0;
    for (const id of t.memberIds) { const m = cur.get(id); if (m) { ti += m.income; tg += m.incomeGoal; } }
    return { name: t.manager.title || `${t.manager.name ?? ""}團隊`, income: ti, headcount: t.memberIds.length, achievePct: tg ? Math.round((ti / tg) * 100) : 0 };
  }).sort((a, b) => b.income - a.income);

  // 業績月成長趨勢（近 8 個月，單位萬）。
  const periods = lastPeriods(period, 8);
  const allMetrics = await db.select().from(memberMetrics).where(inArray(memberMetrics.coachId, ids));
  const byPeriod = new Map<string, number>();
  for (const m of allMetrics) {
    if (rankOf(all.find((c) => c.id === m.coachId) ?? { orgRank: "member" }) !== "member") continue;
    byPeriod.set(m.period, (byPeriod.get(m.period) ?? 0) + m.income);
  }
  const trend = periods.map((p) => ({ period: p, value: Math.round((byPeriod.get(p) ?? 0) / 10000) }));

  // 全組織排行 Top5。
  const top5 = memberRows
    .map((c) => ({ name: nameOf.get(c.id) ?? "", income: cur.get(c.id)?.income ?? 0 }))
    .sort((a, b) => b.income - a.income).slice(0, 5);

  return {
    hasMetrics: cur.size > 0,
    kpis: { income, growthPct: prevIncome ? Math.round(((income - prevIncome) / prevIncome) * 100) : 0, headcount: all.length, retention, activity },
    healthScore, health,
    funnel: [
      { label: "拜訪", value: visits }, { label: "電話", value: calls },
      { label: "提案", value: proposals }, { label: "成交", value: closes },
    ],
    teams, trend, top5,
    announcements: await listAnnouncements(),
  };
}

// ---------- 首頁入口：解析角色/預覽視角 ----------
export type HomeView = {
  rank: OrgRank;           // 目前呈現的視角
  views: OrgRank[];        // 可切換的視角（依 viewer 職級）
  teamOptions: { id: string; name: string }[];
  memberOptions: { id: string; name: string }[];
  focusId: string;
  period: string;
  periodLabel: string;
  today: string;
  member?: MemberHome;
  manager?: ManagerHome;
  owner?: OwnerHome;
};

function allowedViews(rank: OrgRank): OrgRank[] {
  if (rank === "owner") return ["owner", "manager", "member"];
  if (rank === "manager") return ["manager", "member"];
  return ["member"];
}

export async function getHome(me: CoachRow, opts: { as?: string; focus?: string } = {}): Promise<HomeView> {
  const all = await listActiveCoaches();
  const myRank = rankOf(me);
  const views = allowedViews(myRank);
  const period = currentPeriod();

  const wanted = (opts.as as OrgRank) || myRank;
  const view: OrgRank = views.includes(wanted) ? wanted : myRank;

  const teamLeaders = teamsUnder(rankOf(me) === "owner" ? me.id : (me.uplineId ?? me.id), all);
  const teamOptions = (myRank === "owner" ? teamsUnder(me.id, all) : []).map((t) => ({ id: t.manager.id, name: t.manager.title || t.manager.name || "" }));

  // 可見範圍：owner＝全組織、manager＝自己子樹（含自己）、member＝只有自己。
  // ⚠️ 這是 ?focus= 的唯一防線。舊版完全沒有比對可見範圍，任一 member 教練把 focus 換成
  //    別人的 Clerk userId，就能看到對方的客戶總數、客戶姓名、約訪、逾期名單與階段分佈；
  //    而 memberOptions 又把全體 active 教練的 id 序列化進 RSC payload（即使 UI 不渲染，
  //    網頁原始碼裡也撈得到），等於把可用的 id 清單一起附上。兩者都要收斂。
  const visible = new Set(visibleCoachIds(me, all));

  // 成員清單依「本月是否有業績」排序：有資料的排前面（預設預覽會落在有資料者）。
  const members = all.filter((c) => rankOf(c) === "member" && visible.has(c.id));
  const memberMetric = await metricsFor(period, members.map((c) => c.id));
  const incomeOf = (id: string) => memberMetric.get(id)?.income ?? 0;
  const membersByIncome = [...members].sort((a, b) => incomeOf(b.id) - incomeOf(a.id));
  const memberOptions = membersByIncome.map((c) => ({ id: c.id, name: c.name || "" }));

  // focus 一律先過可見範圍；不在範圍內就當作沒帶（退回自己），不要靜默給出別人的資料。
  const focus = opts.focus && visible.has(opts.focus) ? opts.focus : undefined;

  const base = {
    rank: view, views, teamOptions, memberOptions,
    period, periodLabel: periodLabel(period), today: todayLabel(),
    focusId: focus || me.id,
  };

  if (view === "owner") {
    // 只有 owner 進得來（allowedViews 把關），這裡的 owner 一定是自己。
    const owner = rankOf(me) === "owner" ? me : all.find((c) => rankOf(c) === "owner") ?? me;
    return { ...base, owner: await getOwnerHome(owner, all, period) };
  }
  if (view === "manager") {
    // 主管視角同樣受限：只能看自己子樹內的主管，不能預覽平行團隊。
    let mgr = all.find((c) => c.id === focus && rankOf(c) === "manager");
    if (!mgr) mgr = myRank === "manager" ? me : (teamsUnder(me.id, all)[0]?.manager ?? teamLeaders[0]?.manager);
    if (!mgr || !visible.has(mgr.id)) return { ...base, rank: "member", member: await getMemberHome(me, period) };
    return { ...base, focusId: mgr.id, manager: await getManagerHome(mgr, all, period) };
  }
  // member：優先 focus；否則 viewer 本人（若為教練）；再否則挑本月業績最高的成員（保證有資料可看）。
  let target = focus ? all.find((c) => c.id === focus) : undefined;
  if (!target && myRank === "member") target = me;
  if (!target) target = membersByIncome[0] ?? me;
  if (!visible.has(target.id)) target = me;
  return { ...base, focusId: target.id, member: await getMemberHome(target, period) };
}
