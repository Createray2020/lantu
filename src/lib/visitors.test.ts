import { describe, it, expect, vi } from "vitest";

/**
 * 訪客記錄（2026/09/09 Ray）：一列一位外部客戶，看得出他走到哪一步。
 * 這裡釘的是把五張表併成一列的那段語意，不碰資料庫。
 */
vi.mock("@/Shared/db", () => ({ db: {} }));
vi.mock("@/Shared/db/schema", () => ({
  clientLoginEvents: {}, clientUsers: {}, clients: {}, coachApplications: {},
  coachDisplayName: {}, coachLinkRequests: {}, coaches: {}, plans: {},
}));

import { shapeVisitors, visitorStats, type ShapeInput } from "./visitors";

const d = (s: string) => new Date(s);

function base(): ShapeInput {
  return {
    users: [
      { id: "u1", name: "王大明", email: "a@b.c", status: "active", createdAt: d("2026-08-01T00:00:00Z"), lastLoginAt: d("2026-09-08T00:00:00Z"), loginCount: 6 },
      { id: "u2", name: "陳小美", email: "m@b.c", status: "active", createdAt: d("2026-08-20T00:00:00Z"), lastLoginAt: null, loginCount: 0 },
    ],
    clients: [{ id: "c1", clientUserId: "u1", coachId: "fc1", code: "2608001" }],
    plans: [{ clientId: "c1", updatedAt: d("2026-08-05T00:00:00Z"), healthGrade: "B" }],
    pendingLinks: [],
    coachNames: { fc1: "李教練", fc2: "張教練" },
    applicants: [],
    applications: [],
  };
}

describe("shapeVisitors", () => {
  it("四個階段各自接對表：註冊 / 護照 / 指定教練 / 報聘", () => {
    const [a, b] = shapeVisitors(base());
    expect(a.clientCode).toBe("2608001");
    expect(a.passport).toMatchObject({ saved: true, healthGrade: "B" });
    expect(a.coach).toEqual({ state: "linked", name: "李教練" });
    expect(a.apply.state).toBe("none");
    // 只註冊、什麼都沒做的人不能因為查無資料就漏掉一列。
    expect(b.passport.saved).toBe(false);
    expect(b.coach.state).toBe("none");
    expect(b.loginCount).toBe(0);
  });

  it("⚠️ 已掛上教練的人身上還留著舊的 pending 列時，顯示「已掛上」不是「申請中」", () => {
    const inp = base();
    inp.pendingLinks = [{ clientId: "c1", coachId: "fc2" }];
    expect(shapeVisitors(inp)[0].coach).toEqual({ state: "linked", name: "李教練" });
  });

  it("還沒被接受的申請顯示對象教練", () => {
    const inp = base();
    inp.clients = [{ id: "c1", clientUserId: "u1", coachId: null, code: "2608001" }];
    inp.pendingLinks = [{ clientId: "c1", coachId: "fc2" }];
    expect(shapeVisitors(inp)[0].coach).toEqual({ state: "pending", name: "張教練" });
  });

  it("跨年兩份護照只取最新的那一份", () => {
    const inp = base();
    inp.plans = [
      { clientId: "c1", updatedAt: d("2026-08-05T00:00:00Z"), healthGrade: "B" },
      { clientId: "c1", updatedAt: d("2026-09-01T00:00:00Z"), healthGrade: "A" },
    ];
    expect(shapeVisitors(inp)[0].passport).toMatchObject({ healthGrade: "A" });
  });

  it("⚠️ 報聘 pending 要分得出「等推薦人」與「等後台」——混成一個會讓後台把不是自己的事當待辦", () => {
    const inp = base();
    inp.applicants = [{ id: "u1", status: "pending" }];
    inp.applications = [{ coachId: "u1", introducerState: "pending", submittedAt: d("2026-09-02T00:00:00Z") }];
    expect(shapeVisitors(inp)[0].apply).toMatchObject({ state: "introducer" });

    inp.applications = [{ coachId: "u1", introducerState: "confirmed", submittedAt: d("2026-09-02T00:00:00Z") }];
    expect(shapeVisitors(inp)[0].apply).toMatchObject({ state: "review" });
  });

  it("已開通／停權的教練身分照實顯示；沒有 coaches 列＝沒申請過", () => {
    const inp = base();
    inp.applicants = [{ id: "u1", status: "active" }];
    expect(shapeVisitors(inp)[0].apply.state).toBe("active");
    inp.applicants = [{ id: "u1", status: "suspended" }];
    expect(shapeVisitors(inp)[0].apply.state).toBe("suspended");
    inp.applicants = [];
    expect(shapeVisitors(inp)[0].apply.state).toBe("none");
  });
});

describe("visitorStats", () => {
  it("七天內回來過、已存護照、已指定教練、只註冊沒再回來", () => {
    const rows = shapeVisitors(base());
    const s = visitorStats(rows, d("2026-09-09T00:00:00Z"));
    expect(s).toMatchObject({ total: 2, active7d: 1, passportSaved: 1, coachLinked: 1, applying: 0, oneShot: 1 });
  });

  it("報聘進行中只算兩種 pending，不含已開通", () => {
    const inp = base();
    inp.applicants = [{ id: "u1", status: "pending" }, { id: "u2", status: "active" }];
    inp.applications = [{ coachId: "u1", introducerState: "skipped", submittedAt: d("2026-09-02T00:00:00Z") }];
    const s = visitorStats(shapeVisitors(inp), d("2026-09-09T00:00:00Z"));
    expect(s.applying).toBe(1);
  });
});
