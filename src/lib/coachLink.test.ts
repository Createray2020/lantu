/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 教練邀請連結（redeemInvite）的入場語意。
 *
 * 2026/08/20 事故的第二層：新客戶點了邀請連結、還沒填人生護照時，舊版直接擋掉
 * （「請先完成人生護照，再用邀請連結掛教練」）。客戶被丟去別的頁面後多半找不回那條連結，
 * 邀請碼永遠停在未使用，教練收不到人。改成當場建 clients 列並立刻綁定。
 */

const h = vi.hoisted(() => {
  const T = {
    clients: { _n: "clients" },
    coaches: { _n: "coaches" },
    coachLinkRequests: { _n: "clr" },
    coachInvites: { _n: "invites" },
    clientUsers: { _n: "client_users" },
    // 顯示名稱的 SQL 片段也從 schema 匯出（見 coachName.ts 的說明）。
    // 假 db 只認欄位名，這裡給個佔位物件讓 select({ name: coachDisplayName }) 過得去。
    coachDisplayName: { _col: "name" },
  };
  const store: any = { clients: [], coaches: [], clr: [], invites: [] };
  const log: any[] = [];
  const db = {
    select: () => ({
      from: (t: any) => {
        const rows = () => store[t._n] ?? [];
        const c: any = {
          where: () => c,
          orderBy: () => c,
          limit: () => Promise.resolve(rows()),
          then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
        };
        return c;
      },
    }),
    insert: (t: any) => ({
      values: (v: any) => {
        const row = { id: `${t._n}-new`, ...v };
        store[t._n].push(row);
        log.push({ op: "insert", table: t._n, values: v });
        const c: any = {
          onConflictDoUpdate: () => c,
          returning: () => Promise.resolve([row]),
          then: (res: any, rej: any) => Promise.resolve([row]).then(res, rej),
        };
        return c;
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        log.push({ op: "update", table: t._n, values: v });
        const c: any = {
          where: () => c,
          returning: () => Promise.resolve([]),
          then: (res: any, rej: any) => Promise.resolve([]).then(res, rej),
        };
        return c;
      },
    }),
  };
  // 客戶數上限：由測試直接擺佈，不去碰真的 quota 查詢
  //（rankCaps() 會查 comp_versions / comp_ranks，那兩張表不在這份假 schema 裡）。
  const quota = { cap: null as number | null, used: 0, full: false };
  return { T, store, log, db, quota };
});

vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}), desc: () => ({}), count: () => ({}) }));
vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => h.T);
// 配號走 DB（code_counters）——這裡的假 schema 沒有那張表，且發號規則另有 codes.test.ts 守著。
vi.mock("@/lib/codeAlloc", () => ({ allocCode: async (kind: string) => (kind === "coach" ? "FC2608001" : "2608001") }));
vi.mock("@/lib/quota", () => ({
  clientQuota: async () => ({ cap: h.quota.cap, used: h.quota.used, left: null, full: h.quota.full }),
}));

import { redeemInvite, respondToLinkRequest } from "./coachLink";

const USER: any = { id: "user_c1", email: "c@example.com", name: "湘淇 楊", status: "active" };

beforeEach(() => {
  h.store.clients = [];
  h.store.coaches = [{ id: "coach_1", name: "Ray", status: "active" }];
  h.store.clr = [];
  h.store.invites = [{ code: "abc123", coachId: "coach_1", usedAt: null }];
  h.log.length = 0;
  h.quota.cap = null; h.quota.used = 0; h.quota.full = false;
});

describe("redeemInvite", () => {
  it("還沒填人生護照也能綁：當場建 clients 列並掛上教練", async () => {
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(true);
    expect(r.coachName).toBe("Ray");

    const ins = h.log.find((l: any) => l.op === "insert" && l.table === "clients");
    expect(ins).toBeTruthy();
    expect(ins.values).toMatchObject({ clientUserId: "user_c1", name: "湘淇 楊", source: "教練邀請" });

    // 一定要真的掛上教練，而且邀請碼被標記使用過
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clients" && l.values.coachId === "coach_1")).toBe(true);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "invites" && l.values.usedByClientUserId === "user_c1")).toBe(true);
  });

  it("已有 clients 列且未綁教練 → 直接綁，不重複建列", async () => {
    h.store.clients = [{ id: "cl_1", clientUserId: "user_c1", coachId: null, name: "湘淇 楊" }];
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(true);
    expect(h.log.some((l: any) => l.op === "insert" && l.table === "clients")).toBe(false);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clients" && l.values.coachId === "coach_1")).toBe(true);
  });

  it("已連結同一位教練 → 視同成功（連結可重複開）", async () => {
    h.store.clients = [{ id: "cl_1", clientUserId: "user_c1", coachId: "coach_1", name: "湘淇 楊" }];
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(true);
    expect(h.log.some((l: any) => l.op === "insert")).toBe(false);
  });

  it("已連結別的教練 → 擋下，不偷換教練", async () => {
    h.store.clients = [{ id: "cl_1", clientUserId: "user_c1", coachId: "coach_9", name: "湘淇 楊" }];
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(false);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clients")).toBe(false);
  });

  it("教練已停權 → 舊連結不能再收客戶，也不會建 clients 列", async () => {
    h.store.coaches = [{ id: "coach_1", name: "Ray", status: "suspended" }];
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(false);
    expect(h.log).toHaveLength(0);
  });

  it("邀請碼不存在 → 失效訊息", async () => {
    h.store.invites = [];
    const r = await redeemInvite("nope", USER);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("失效");
  });
});

/**
 * 客戶數上限的另外兩個入口。
 *
 * usedClientCount() 數的是 clients.coach_id，所以每一條會設 coach_id 的路徑都在花額度。
 * requireClientQuota() 原本只掛在「教練自己新增客戶」那一支，接受連結申請與邀請碼兌換
 * 兩條路一句都沒查 —— 上限 30 位的教練可以靠邀請連結收到第 200 位，
 * 而且是既成事實（客戶已經掛上去了，要收回只能把人踢掉）。
 */
describe("客戶數上限：接受申請與邀請碼都要過", () => {
  beforeEach(() => {
    h.quota.cap = 30; h.quota.used = 30; h.quota.full = true;
  });

  it("邀請碼：額度滿了就擋，而且不留下半成品的 clients 列", async () => {
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("上限 30 位");
    // 擋在建列之前：不可以留下一筆沒教練、沒護照的空客戶（連客戶編號都不該發）
    expect(h.log.some((l: any) => l.op === "insert" && l.table === "clients")).toBe(false);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clients")).toBe(false);
  });

  it("邀請碼：已經連結同一位教練的人再開一次，額度滿了也照樣成功", async () => {
    // 這一次不會多佔名額，拿額度去擋只會讓已經掛好的客戶看到「教練已滿」。
    h.store.clients = [{ id: "cl_1", clientUserId: "user_c1", coachId: "coach_1", name: "湘淇 楊" }];
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(true);
  });

  it("邀請碼：額度還有就照常綁", async () => {
    h.quota.used = 29; h.quota.full = false;
    const r = await redeemInvite("abc123", USER);
    expect(r.ok).toBe(true);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clients" && l.values.coachId === "coach_1")).toBe(true);
  });

  it("接受連結申請：額度滿了就擋，客戶不會被掛上來", async () => {
    h.store.clr = [{ id: "rq1", clientId: "cl_1", coachId: "coach_1", status: "pending" }];
    const r = await respondToLinkRequest("rq1", "coach_1", true);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("上限 30 位");
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clients")).toBe(false);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clr")).toBe(false);
  });

  it("婉拒不佔額度，額度滿了也要能按", async () => {
    h.store.clr = [{ id: "rq1", clientId: "cl_1", coachId: "coach_1", status: "pending" }];
    const r = await respondToLinkRequest("rq1", "coach_1", false);
    expect(r.ok).toBe(true);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clr" && l.values.status === "rejected")).toBe(true);
  });

  it("接受連結申請：額度還有就照常掛上", async () => {
    h.quota.used = 29; h.quota.full = false;
    h.store.clr = [{ id: "rq1", clientId: "cl_1", coachId: "coach_1", status: "pending" }];
    const r = await respondToLinkRequest("rq1", "coach_1", true);
    expect(r.ok).toBe(true);
    expect(h.log.some((l: any) => l.op === "update" && l.table === "clients" && l.values.coachId === "coach_1")).toBe(true);
  });
});
