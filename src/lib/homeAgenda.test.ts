/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 首頁「近期行程」（2026/09/14 Ray 拍板）。
 *
 * ⚠️⚠️ 這支測試守的是那個最容易漏掉的一半：約訪搬進近期行程之後，
 *    **必須同時從「待辦動作」拿掉**。只加不減的話，同一場約訪會在首頁出現兩次——
 *    畫面不會壞、不會噴錯，只是每個教練都看到重複的東西。
 */
const h = vi.hoisted(() => {
  const state: any = { dash: null as any, events: [] as any[] };
  const builder = () => {
    const b: any = {};
    for (const m of ["from", "where", "orderBy", "limit", "leftJoin"]) b[m] = () => b;
    b.then = (res: any, rej: any) => Promise.resolve([]).then(res, rej);
    return b;
  };
  return { state, db: { select: () => builder() } };
});

vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("drizzle-orm", () => ({
  and: (...p: any[]) => ({ p }), inArray: () => ({}), eq: () => ({}), desc: () => ({}),
}));
vi.mock("@/Shared/db/schema", () => ({
  memberMetrics: {}, recruits: {}, announcements: {}, coaches: {}, clients: {}, reviews: {},
}));
vi.mock("./org", () => ({
  rankOf: (c: any) => (c?.orgRank === "owner" || c?.orgRank === "manager" ? c.orgRank : "member"),
  listActiveCoaches: async () => [],
  teamsUnder: () => [],
  downlineIds: () => [],
  visibleCoachIds: () => [],
}));
vi.mock("./license", () => ({
  todayISO: () => "2026-09-14",
  addDaysISO: (iso: string, days: number) =>
    new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + days * 86400000)
      .toISOString().slice(0, 10),
}));
vi.mock("./dashboard", () => ({ getCoachDashboard: async () => h.state.dash }));
vi.mock("./orgEvents", async () => {
  const actual: any = await vi.importActual("./orgEvents");
  return {
    ...actual,
    upcomingEvents: async () => h.state.events,
    KIND_LABEL: { meeting: "會議", activity: "活動", ops: "公司行程", training: "教育訓練" },
    VIS_LABEL: { all: "全體教練", manager: "主管以上", owner: "僅核心成員" },
  };
});

import { getMemberHome } from "./home";

const ev = (over: any = {}) => ({
  id: "e1", date: "2026-09-15", start: "19:30", end: null, kind: "meeting",
  title: "月會", place: "台中", visibility: "all", body: null, minutes: null,
  readOnly: false, canMinute: true, ...over,
});

beforeEach(() => {
  h.state.events = [];
  h.state.dash = {
    counts: { total: 3, active: 3, upcomingWeek: 0, openItems: 2 },
    thisWeek: [],
    thisMonth: [],
    overdue: [],
    openItems: [],
    byStatus: {},
    byGrade: {},
  };
});

const coach: any = { id: "c1", name: "小明", title: null, orgRank: "member" };

describe("待辦動作", () => {
  it("⚠️ 不再包含約訪——約訪只出現在近期行程，兩邊都放就是首頁重複", async () => {
    h.state.dash.thisWeek = [{ clientId: "k1", clientName: "陳先生", date: "2026-09-16", type: "季檢視" }];
    h.state.dash.openItems = [{ id: "a1", clientId: "k1", clientName: "陳先生", title: "補保單影本", owner: null, dueDate: "2026-09-18", overdue: false }];

    const home = await getMemberHome(coach, "2026-09");

    expect(home.todos).toHaveLength(1);
    expect(home.todos[0].title).toContain("補保單影本");
    expect(home.todos.some((t) => t.tag === "約訪")).toBe(false);
    // 而且約訪確實有出現在另一塊，不是被弄丟了。
    expect(home.agenda.some((a) => a.kind === "appt")).toBe(true);
  });
});

describe("近期行程", () => {
  it("公司行程與客戶約訪合併成一條時間軸，依日期排序", async () => {
    h.state.events = [ev({ id: "e2", date: "2026-09-18", title: "核心會議" }), ev({ id: "e1", date: "2026-09-15" })];
    h.state.dash.thisWeek = [{ clientId: "k1", clientName: "陳先生", date: "2026-09-16", type: "季檢視" }];

    const { agenda } = await getMemberHome(coach, "2026-09");
    expect(agenda.map((a) => a.date)).toEqual(["2026-09-15", "2026-09-16", "2026-09-18"]);
  });

  it("同一天：全天在前 → 有時間的依時間 → 沒指定時間的約訪排最後", async () => {
    h.state.events = [
      ev({ id: "a", date: "2026-09-16", start: "14:00", title: "下午會" }),
      ev({ id: "b", date: "2026-09-16", start: null, title: "Q3 結算截止" }),
      ev({ id: "c", date: "2026-09-16", start: "09:00", title: "早會" }),
    ];
    h.state.dash.thisWeek = [{ clientId: "k1", clientName: "陳先生", date: "2026-09-16", type: "季檢視" }];

    const { agenda } = await getMemberHome(coach, "2026-09");
    expect(agenda.map((a) => a.title)).toEqual([
      "Q3 結算截止", "早會", "下午會", "陳先生 · 季檢視",
    ]);
    expect(agenda[0].timeLabel).toBe("全天");
    expect(agenda[3].timeLabel).toBe("—");
  });

  it("視窗是 7 天：更遠的約訪不進來（首頁不該被 20 筆約訪撐爆）", async () => {
    h.state.dash.thisWeek = [
      { clientId: "k1", clientName: "近的", date: "2026-09-20", type: "初談" },
      { clientId: "k2", clientName: "遠的", date: "2026-09-30", type: "初談" },
    ];
    const { agenda } = await getMemberHome(coach, "2026-09");
    expect(agenda.map((a) => a.title)).toEqual(["近的 · 初談"]);
  });

  it("已經過去的約訪不進來（近期行程是往前看，逾期的事留在待辦）", async () => {
    h.state.dash.thisWeek = [{ clientId: "k1", clientName: "昨天", date: "2026-09-13", type: "初談" }];
    const { agenda } = await getMemberHome(coach, "2026-09");
    expect(agenda).toHaveLength(0);
  });

  it("點下去各自去對的地方；全體可見的事件不標層級", async () => {
    h.state.events = [ev({ id: "e9", visibility: "manager", title: "主管月會" })];
    h.state.dash.thisWeek = [{ clientId: "k7", clientName: "陳先生", date: "2026-09-16", type: "季檢視" }];

    const { agenda } = await getMemberHome(coach, "2026-09");
    const meeting = agenda.find((a) => a.kind === "meeting")!;
    const appt = agenda.find((a) => a.kind === "appt")!;
    expect(meeting.href).toBe("/dashboard/calendar?e=e9");
    expect(meeting.visLabel).toBe("主管以上");
    expect(appt.href).toBe("/dashboard/clients/k7");
    expect(appt.visLabel).toBeNull();
  });

  it("全體可見（all）不標層級，畫面才不會每一列都掛一顆沒資訊的標籤", async () => {
    h.state.events = [ev()];
    const { agenda } = await getMemberHome(coach, "2026-09");
    expect(agenda[0].visLabel).toBeNull();
  });
});
