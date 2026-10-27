/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 客戶專用登入連結（2026/10/27）。
 *
 * 情境：教練先建好客戶、做完規劃，才發連結讓客戶登入。通用邀請認「這個帳號自己的 clients 列」，
 * 對這種客戶會另建一筆空白列（教練名下兩個同名客戶、客戶登入看到空的）。
 * 專用連結把帳號接到**既有那一筆**；一人一碼、綁定後失效；帳號已有自助護照就併入。
 *
 * 這份假 db 會真的照 eq / and / isNull 過濾（coachLink.test.ts 那份不會），
 * 因為這條路同一張 clients 表要分別查「目標列」與「帳號自己的列」，不過濾就分不出來。
 */
const h = vi.hoisted(() => {
  const col = (t: string, c: string) => ({ _t: t, _c: c });
  const tbl = (n: string, cols: string[]) => Object.fromEntries([["_n", n], ...cols.map((c) => [c, col(n, c)])]);
  const T: any = {
    clients: tbl("clients", ["id", "coachId", "clientUserId", "status", "name", "source", "updatedAt"]),
    coaches: tbl("coaches", ["id", "status", "name", "rankCode", "clientCapOverride"]),
    coachLinkRequests: tbl("clr", ["clientId", "status", "respondedAt"]),
    coachInvites: tbl("invites", ["code", "coachId", "clientId", "usedAt", "usedByClientUserId", "note", "createdAt"]),
    clientUsers: tbl("client_users", ["id"]),
    plans: tbl("plans", ["clientId", "track", "updatedAt"]),
    coachDisplayName: col("coaches", "name"),
  };
  const store: any = { clients: [], coaches: [], clr: [], invites: [], plans: [] };
  const log: any[] = [];
  const match = (row: any, cond: any): boolean => {
    if (!cond) return true;
    if (cond.op === "and") return cond.parts.every((p: any) => match(row, p));
    if (cond.op === "eq") return row[cond.col._c] === cond.val;
    if (cond.op === "isNull") return row[cond.col._c] == null;
    return true;
  };
  const db = {
    select: (shape?: any) => ({
      from: (t: any) => {
        let cond: any = null;
        const project = (rows: any[]) => (shape ? rows.map((r) => Object.fromEntries(Object.entries(shape).map(([k, c]: any) => [k, r[c._c]]))) : rows);
        const run = () => project((store[t._n] ?? []).filter((r: any) => match(r, cond)));
        const c: any = {
          where: (w: any) => { cond = w; return c; },
          leftJoin: () => c,
          orderBy: () => c,
          limit: () => Promise.resolve(run()),
          then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
        };
        return c;
      },
    }),
    insert: (t: any) => ({
      values: (v: any) => {
        const row = { id: `${t._n}-new`, ...v };
        store[t._n].push(row);
        log.push({ op: "insert", table: t._n, values: v });
        const c: any = { returning: () => Promise.resolve([row]), then: (res: any, rej: any) => Promise.resolve([row]).then(res, rej) };
        return c;
      },
    }),
    update: (t: any) => ({
      set: (v: any) => ({
        where: (w: any) => {
          const hit = (store[t._n] ?? []).filter((r: any) => match(r, w));
          hit.forEach((r: any) => Object.assign(r, v));
          log.push({ op: "update", table: t._n, values: v, n: hit.length });
          return Promise.resolve([]);
        },
      }),
    }),
    delete: (t: any) => ({
      where: (w: any) => {
        const keep = (store[t._n] ?? []).filter((r: any) => !match(r, w));
        log.push({ op: "delete", table: t._n, n: store[t._n].length - keep.length });
        store[t._n] = keep;
        return Promise.resolve([]);
      },
    }),
  };
  return { T, store, log, db };
});

vi.mock("drizzle-orm", () => ({
  and: (...parts: any[]) => ({ op: "and", parts }),
  eq: (col: any, val: any) => ({ op: "eq", col, val }),
  isNull: (col: any) => ({ op: "isNull", col }),
  desc: () => ({}),
  count: () => ({}),
}));
vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => h.T);
vi.mock("@/lib/codeAlloc", () => ({ allocCode: async () => "2610001" }));
const seeded: string[] = [];
vi.mock("@/lib/plans", () => ({ seedCoachPlanFromPassport: async (clientId: string) => { seeded.push(clientId); return null; } }));
vi.mock("@/lib/quota", () => ({ clientQuota: async () => ({ cap: 1, used: 1, left: 0, full: true }) }));

import { redeemInvite, createClientInvite, activeClientInvite } from "./coachLink";

const USER: any = { id: "user_c1", email: "c@example.com", name: "周承翰", status: "active" };

beforeEach(() => {
  seeded.length = 0;
  h.log.length = 0;
  h.store.coaches = [{ id: "coach_1", name: "Ray", status: "active" }];
  // 教練先建好的那一筆（還沒接登入帳號）＋已做好的年度版
  h.store.clients = [{ id: "cl_t", coachId: "coach_1", clientUserId: null, status: "active", name: "周承翰", source: "講座" }];
  h.store.plans = [{ id: "p_coach", clientId: "cl_t", track: "coach" }];
  h.store.clr = [];
  h.store.invites = [{ code: "ded001", coachId: "coach_1", clientId: "cl_t", usedAt: null, usedByClientUserId: null }];
});

describe("createClientInvite", () => {
  it("主責才能產；產新碼時舊的未用碼作廢（一人一碼）", async () => {
    const r1 = await createClientInvite("coach_1", "cl_t");
    expect(r1.ok).toBe(true);
    expect(h.store.invites.filter((i: any) => i.clientId === "cl_t")).toHaveLength(1);
    expect(h.store.invites[0].code).not.toBe("ded001");
    expect(await activeClientInvite("cl_t")).toBe(h.store.invites[0].code);
    expect((await createClientInvite("coach_9", "cl_t")).ok).toBe(false);
  });

  it("已開通登入的客戶不再產碼", async () => {
    h.store.clients[0].clientUserId = "user_x";
    const r = await createClientInvite("coach_1", "cl_t");
    expect(r.ok).toBe(false);
    expect(h.log.some((l: any) => l.op === "insert")).toBe(false);
  });
});

describe("redeemInvite（專用連結）", () => {
  it("全新帳號 → 接到既有那一筆，不新建、不過額度、碼標已用", async () => {
    const r = await redeemInvite("ded001", USER);
    expect(r.ok).toBe(true);
    expect(r.coachName).toBe("Ray");
    expect(h.log.some((l: any) => l.op === "insert" && l.table === "clients")).toBe(false); // 額度滿也照接（本來就在名下）
    expect(h.store.clients.find((c: any) => c.id === "cl_t").clientUserId).toBe("user_c1");
    expect(h.store.invites[0]).toMatchObject({ usedByClientUserId: "user_c1" });
    expect(h.store.invites[0].usedAt).toBeTruthy();
    expect(seeded).toHaveLength(0); // 教練軌已經在，不用再從護照複製
  });

  it("同一帳號再開一次 → 視同成功；別的帳號開 → 擋", async () => {
    await redeemInvite("ded001", USER);
    expect((await redeemInvite("ded001", USER)).ok).toBe(true);
    const r = await redeemInvite("ded001", { ...USER, id: "user_other" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("使用過");
    expect(h.store.clients.find((c: any) => c.id === "cl_t").clientUserId).toBe("user_c1");
  });

  it("帳號已有自助護照（沒教練）→ 併入：護照 plan 搬到目標列、自助列封存並清 clientUserId", async () => {
    h.store.clients.push({ id: "cl_s", coachId: null, clientUserId: "user_c1", status: "active", name: "我的規劃", source: "自助" });
    h.store.plans.push({ id: "p_pass", clientId: "cl_s", track: "client" });
    h.store.clr.push({ id: "rq", clientId: "cl_s", status: "pending" });
    const r = await redeemInvite("ded001", USER);
    expect(r.ok).toBe(true);
    expect(h.store.plans.find((p: any) => p.id === "p_pass").clientId).toBe("cl_t"); // 變成「客戶的想法」
    expect(h.store.plans.find((p: any) => p.id === "p_coach").clientId).toBe("cl_t");
    const s = h.store.clients.find((c: any) => c.id === "cl_s");
    expect(s.clientUserId).toBeNull();
    expect(s.status).toBe("archived");
    expect(s.source).toContain("已併入");
    expect(h.store.clr[0].status).toBe("rejected");
    expect(h.store.clients.find((c: any) => c.id === "cl_t").clientUserId).toBe("user_c1");
    expect(h.log.some((l: any) => l.op === "delete")).toBe(false); // 封存不刪
  });

  it("帳號掛在別的教練 → 擋；掛在同一教練的另一筆 → 擋並點名", async () => {
    h.store.clients.push({ id: "cl_s", coachId: "coach_9", clientUserId: "user_c1", status: "active", name: "X" });
    let r = await redeemInvite("ded001", USER);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("其他教練");
    h.store.clients[1].coachId = "coach_1";
    r = await redeemInvite("ded001", USER);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("X");
    expect(h.store.clients.find((c: any) => c.id === "cl_t").clientUserId).toBeNull();
  });

  it("目標列已被別的帳號接走、或已不在該教練名下 → 失效", async () => {
    h.store.clients[0].clientUserId = "user_other";
    expect((await redeemInvite("ded001", USER)).ok).toBe(false);
    h.store.clients[0].clientUserId = null;
    h.store.clients[0].coachId = "coach_9";
    const r = await redeemInvite("ded001", USER);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("失效");
  });

  it("通用邀請（沒有 clientId）仍走原路：新建列並過額度", async () => {
    h.store.invites = [{ code: "gen001", coachId: "coach_1", clientId: null, usedAt: null }];
    const r = await redeemInvite("gen001", USER);
    expect(r.ok).toBe(false); // 額度滿 → 擋
    expect(r.error).toContain("上限");
  });
});
