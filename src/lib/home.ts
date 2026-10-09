// 首頁彙總層：依角色（教練／主管／核心成員）把各卡片要的數字算出來。
// 有真實資料源的（客戶／待辦／約訪、組織樹、成員名冊）直接接；
// 業績／活動量／增員／公告由 member_metrics / recruits / announcements 承載
// ——那些是**真的資料表**，由後台填，只是上線初期還沒有人填。
//
// ⚠️⚠️ hasMetrics（2026/08/30 Ray 拍板）：沒有任何 member_metrics 列時，
//    收益、達成率、留存率、組織健康度這些數字全部會算成 0／0%。
//    畫面上的「0 分」跟假數字一樣糟——它看起來是一個結論，實際上只是「沒人填」。
//    所以這裡把「有沒有資料」跟「資料是 0」分開，讓 HomeView 有辦法說實話。
import { eq, desc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { announcements, coaches } from "@/Shared/db/schema";
import type { CompParams } from "./comp/types";
import { payoutsOf } from "./acctEngine";
import {
  memberMoney, promoProgress, termInfo, teamMoney, applyFunnel, companyMonth, coachLine,
  type MemberMoney, type PromoProgress, type TermInfo, type TeamMoney, type ApplyFunnel, type CompanyMonth, type ApplyLike,
} from "./homeStats";
import { getCoachDashboard } from "./dashboard";
// ⚠️ 同 dashboard.ts：今天是哪一天用 Asia/Taipei 那一支，不要用 UTC 的 toISOString()。
import { todayISO, addDaysISO } from "./license";
import { upcomingEvents, KIND_LABEL, VIS_LABEL, type EventKind } from "./orgEvents";
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

export type Announcement = typeof announcements.$inferSelect;

async function listAnnouncements(): Promise<Announcement[]> {
  const rows = await db.select().from(announcements)
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt));
  return rows.slice(0, 5);
}

// ---------- 近期行程（公司行事曆 + 我的客戶約訪）----------
//
// 2026/09/14 Ray 拍板：首頁分成「有時間、要出席的」與「沒時間、要做完的」兩塊，
// 而不是「公司的」與「個人的」。教練早上的問題只有兩個——幾點要去哪、我還欠什麼沒做。
// 用公司／個人切，兩個問題都要讀兩塊才拼得出答案。
//
// ⚠️⚠️ 所以 todos **不再包含約訪**。併進近期行程卻沒從 todos 拿掉的話，
//    同一場約訪會在首頁出現兩次——這是改這塊時最容易漏的一件事。
// ⚠️ 視窗固定 7 天，跟 getCoachDashboard() 的 thisWeek 同寬；兩邊不同寬的話會出現
//    「近期行程看得到、今日約訪數字沒算到」這種對不起來的狀況。
export type AgendaItem = {
  id: string;
  date: string;
  /** 時間欄顯示的字：'14:00'／'全天'／'—'（約訪只有日期沒有時間）。 */
  timeLabel: string;
  title: string;
  place: string | null;
  kind: EventKind | "appt";
  kindLabel: string;
  /** 'all' 與約訪回 null＝畫面不用標可見層級。 */
  visLabel: string | null;
  /** 點下去要去哪；約訪連到客戶頁。 */
  href: string;
};

export const AGENDA_DAYS = 7;

async function agendaFor(
  rank: OrgRank,
  appts: { clientId: string; clientName: string; date: string; type: string }[] = [],
): Promise<AgendaItem[]> {
  const today = todayISO();
  const until = addDaysISO(today, AGENDA_DAYS);
  const events = await upcomingEvents(rank, AGENDA_DAYS);

  // 同一天內的排序鍵：全天（整天都算）'00:00' → 有時間的依時間 → 沒指定時間的約訪 '99:99'。
  // reviews.next_appt 只有日期沒有時間，硬把它排在最前面會蓋掉真的整天事件。
  const rows: { key: string; item: AgendaItem }[] = events.map((e) => ({
    key: e.start ?? "00:00",
    item: {
      id: e.id,
      date: e.date,
      timeLabel: e.start ?? "全天",
      title: e.title,
      place: e.place,
      kind: e.kind,
      kindLabel: KIND_LABEL[e.kind],
      visLabel: e.visibility === "all" ? null : VIS_LABEL[e.visibility],
      href: `/dashboard/calendar?e=${encodeURIComponent(e.id)}`,
    },
  }));

  for (const a of appts) {
    // upcomingEvents 已經把區間切好了，約訪這邊要自己切——thisWeek 是 7 天沒錯，
    // 但它不含「今天之前」的判斷以外的東西，邊界還是自己守著比較安全。
    if (a.date < today || a.date > until) continue;
    rows.push({
      key: "99:99",
      item: {
        id: `appt:${a.clientId}:${a.date}`,
        date: a.date,
        timeLabel: "—",
        title: `${a.clientName} · ${a.type}`,
        place: null,
        kind: "appt",
        kindLabel: "客戶約訪",
        visLabel: null,
        href: `/dashboard/clients/${a.clientId}`,
      },
    });
  }

  rows.sort((x, y) =>
    x.item.date !== y.item.date
      ? (x.item.date < y.item.date ? -1 : 1)
      : x.key === y.key
        ? x.item.title.localeCompare(y.item.title, "zh-Hant")
        : (x.key < y.key ? -1 : 1),
  );
  return rows.map((r) => r.item);
}

// ---------- 共用：後台真相一次載入 ----------
//
// 2026/10/09 Ray：首頁要跟後台設定的邏輯全面對齊。錢從分潤匯款／本月帳務算、晉升從制度門檻算、
// 到期從合作期限算、報聘從申請表算。member_metrics／recruits 不再讀（活動量整組下架）。
async function homeCtx() {
  const [{ getAcctState }, { ensureActiveVersion, loadParams }] = await Promise.all([import("./acctStore"), import("./comp/repo")]);
  const S = await getAcctState();
  let params: CompParams = { settings: {}, ranks: [], thresholds: [] };
  try { const v = await ensureActiveVersion(); params = await loadParams(v.id); } catch { /* 制度還沒建：門檻全空 */ }
  return { S, params };
}
async function pendingCoachRows(): Promise<CoachRow[]> {
  return db.select().from(coaches).where(eq(coaches.status, "pending"));
}
async function applicationRows(): Promise<ApplyLike[]> {
  try {
    const { listApplications } = await import("./coachApplyStore");
    return Object.values(await listApplications()).map((a) => ({ coachId: a.coachId, route: a.route, introducerId: a.introducerId, introducerState: a.introducerState, submittedAt: a.submittedAt }));
  } catch { return []; }
}

// ---------- 教練（member）----------
export type MemberHome = {
  coach: { name: string; title: string | null };
  /** 這個月有沒有任何收款（整個公司）。沒有＝錢的那幾塊顯示「本月還沒有收款」而不是 0。 */
  hasMoney: boolean;
  money: MemberMoney;
  promo: PromoProgress;
  term: TermInfo;
  kpis: { openItems: number; todayAppts: number; clients: number };
  agenda: AgendaItem[];
  todos: { time: string; title: string; sub: string; tag: string; tagKind: string }[];
  watch: { name: string; note: string; tag: string; tagKind: string; dot: string }[];
  compliance: { kycPending: number };
  announcements: Announcement[];
  checkins: { done: number; partial: number; none: number; total: number };
};

export async function getMemberHome(coach: CoachRow, period: string): Promise<MemberHome> {
  const d = await getCoachDashboard(coach.id);
  let checkins: MemberHome["checkins"] = { done: 0, partial: 0, none: 0, total: 0 };
  try {
    const { checkinStats } = await import("@/lib/consultSession");
    checkins = await checkinStats(coach.id, new Date(`${period}-01T00:00:00+08:00`));
  } catch { /* 統計不影響首頁 */ }
  const { S, params } = await homeCtx();
  const today = todayISO();
  const kycPending = Object.entries(d.byStatus).find(([k]) => k === "pending")?.[1] ?? 0;

  // ⚠️ 這裡刻意**不放約訪**——約訪在 agenda 那一塊。兩邊都放＝首頁同一場出現兩次。
  const todos: MemberHome["todos"] = [];
  for (const it of d.openItems.slice(0, 6)) {
    todos.push({ time: it.dueDate ? it.dueDate.slice(5).replace("-", "/") : "—", title: `${it.clientName} · ${it.title}`, sub: it.owner ? `負責：${it.owner}` : "待辦動作", tag: it.overdue ? "逾期" : "待辦", tagKind: it.overdue ? "warn" : "amber" });
  }
  const watch: MemberHome["watch"] = [];
  for (const o of d.overdue.slice(0, 4)) watch.push({ name: o.clientName, note: `逾期未檢視（${o.date}）`, tag: "需跟進", tagKind: "warn", dot: "warn" });
  for (const it of d.openItems.slice(0, 4 - watch.length)) {
    if (watch.find((w) => w.name === it.clientName)) continue;
    watch.push({ name: it.clientName, note: it.title, tag: "進行中", tagKind: "green", dot: "ok" });
  }

  return {
    coach: { name: coach.name ?? "教練", title: coach.title },
    hasMoney: (S.receipts?.[period] ?? []).some((x) => !x.void && x.verified !== false),
    money: memberMoney(S, coach, period),
    promo: promoProgress(S, params, coach),
    term: termInfo(coach, today),
    kpis: { openItems: d.counts.openItems, todayAppts: d.thisWeek.filter((a) => a.date === today).length, clients: d.counts.total },
    agenda: await agendaFor(rankOf(coach), d.thisWeek),
    todos, watch, checkins,
    compliance: { kycPending },
    announcements: await listAnnouncements(),
  };
}

// ---------- 主管（manager）----------
export type ManagerHome = {
  teamName: string;
  memberCount: number;
  hasMoney: boolean;
  team: TeamMoney;
  payDate: string;
  funnel: ApplyFunnel;
  pendingCount: number;
  agenda: AgendaItem[];
  announcements: Announcement[];
};

export async function getManagerHome(manager: CoachRow, all: CoachRow[], period: string): Promise<ManagerHome> {
  const teamIds = downlineIds(manager.id, all);
  const memberIds = teamIds.filter((id) => id !== manager.id);
  const members = all.filter((c) => memberIds.includes(c.id));
  const { S, params } = await homeCtx();
  const team = teamMoney(S, params, members, period);
  const [pend, apps] = await Promise.all([pendingCoachRows(), applicationRows()]);
  const funnel = applyFunnel(apps, pend, new Set(teamIds), manager.id);
  return {
    teamName: manager.title || `${manager.name ?? ""}的團隊`,
    memberCount: memberIds.length,
    hasMoney: (S.receipts?.[period] ?? []).some((x) => !x.void && x.verified !== false),
    team, payDate: payoutsOf(S, period).payDate,
    funnel, pendingCount: funnel.steps[0].value,
    agenda: await agendaFor(rankOf(manager)),
    announcements: await listAnnouncements(),
  };
}

// ---------- 核心成員（owner）----------
export type OwnerHome = {
  hasMoney: boolean;
  company: CompanyMonth;
  top5: { name: string; net: number }[];
  funnel: ApplyFunnel;
  agenda: AgendaItem[];
  announcements: Announcement[];
};

export async function getOwnerHome(owner: CoachRow, all: CoachRow[], period: string): Promise<OwnerHome> {
  const { S, params } = await homeCtx();
  void params;
  const today = todayISO();
  const year = Number(period.slice(0, 4));
  let maintainPass = 0, maintainTotal = 0;
  try {
    const { listMaintenance } = await import("./comp/caseRepo");
    const rows = await listMaintenance(year);
    maintainTotal = rows.length; maintainPass = rows.filter((r) => r.exempt || (r.execPass && r.trainPass)).length;
  } catch { /* 沒有維持資格資料 */ }
  let checkinDone = 0, checkinTotal = 0;
  try {
    const { checkinStats } = await import("@/lib/consultSession");
    const since = new Date(`${period}-01T00:00:00+08:00`);
    for (const c of all) { const st = await checkinStats(c.id, since); checkinDone += st.done; checkinTotal += st.total; }
  } catch { /* 統計不影響首頁 */ }
  const chains = teamsUnder(owner.id, all).map((t) => ({ id: t.manager.id, name: t.manager.title || `${t.manager.name ?? ""}團隊`, memberIds: t.memberIds }));
  const company = companyMonth(S, all, period, today, { maintainPass, maintainTotal, checkinDone, checkinTotal, chains });
  const sum = company.payouts;
  const top5 = all.map((c) => ({ name: c.name ?? "", net: coachLine(S, period, c)?.tax.net ?? 0 })).filter((x) => x.net > 0).sort((a, b) => b.net - a.net).slice(0, 5);
  void sum;
  const [pend, apps] = await Promise.all([pendingCoachRows(), applicationRows()]);
  return {
    hasMoney: (S.receipts?.[period] ?? []).some((x) => !x.void && x.verified !== false),
    company, top5,
    funnel: applyFunnel(apps, pend, new Set(all.map((c) => c.id)), null),
    agenda: await agendaFor("owner"),
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
  // 依本月實匯排序（分潤匯款算出來的），不再看手填業績
  const { getAcctState } = await import("./acctStore");
  const S0 = await getAcctState();
  const incomeOf = (c: CoachRow) => coachLine(S0, period, c)?.tax.net ?? 0;
  const membersByIncome = [...members].sort((a, b) => incomeOf(b) - incomeOf(a));
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
