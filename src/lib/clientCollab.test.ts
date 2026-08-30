/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 共同執案（client_collaborators）的邊界。
 *
 * 這個功能只賣一件事：**被邀來的教練看得到全部、但一個字都改不了**。
 * 一旦哪條路徑把「可見範圍」接到寫入條件上，主責就再也不知道報告書是誰改的，
 * 而且畫面上完全看不出來。所以這裡驗的是兩件事：
 *   1. clientAccess／getClientForRead 對「已接受」的協作者放行，對 pending／已移除的不放行。
 *   2. 寫入路徑（updateClient / createReview / createPlan…）對協作者一律 forbidden。
 *
 * mock 讓 where 真的求值（含 readableClient 的 EXISTS 相關子查詢），
 * no-op 的 mock 會讓上面兩條全部假通過。
 */

const h = vi.hoisted(() => {
  const store: any = { clients: [], client_collaborators: [], plans: [], reviews: [], action_items: [], coaches: [] };

  const camel = (col: string) => col.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());
  const get = (row: any, col: string) => (row?.[col] !== undefined ? row[col] : row?.[camel(col)]);

  // outer＝相關子查詢的外層列（EXISTS 內用 clients.id 對回外層那一列）
  const evalCond = (c: any, row: any, outer?: any): boolean => {
    if (!c) return true;
    switch (c.__op) {
      case "and": return c.parts.every((p: any) => evalCond(p, row, outer));
      case "or": return c.parts.some((p: any) => evalCond(p, row, outer));
      case "not": return !evalCond(c.part, row, outer);
      case "eq": {
        const val = c.valCol ? get(outer ?? row, c.valCol) : c.val;
        return get(row, c.col) === val;
      }
      case "ne": return get(row, c.col) !== c.val;
      case "inArray": return c.val.includes(get(row, c.col));
      case "exists": {
        const sub = c.sub;
        return (store[sub.__table] ?? []).some((r: any) => evalCond(sub.__cond, r, row));
      }
      default: return true;
    }
  };

  const tableOf = (t: any) => t?.[Symbol.for("drizzle:Name")];

  const db = {
    select: (proj?: any) => ({
      from: (t: any) => {
        const state: any = { __table: tableOf(t), __cond: null };
        const rows = () => (store[state.__table] ?? []).filter((r: any) => evalCond(state.__cond, r));
        const project = (rs: any[]) =>
          rs.map((r) => {
            if (!proj) return r;
            const out: any = {};
            for (const [k, v] of Object.entries<any>(proj)) {
              if (v?.__sql) out[k] = r.__count ?? 1;
              else if (v && typeof v === "object" && !("name" in v)) out[k] = r;
              else out[k] = get(r, v?.name ?? k);
            }
            return out;
          });
        const c: any = Object.assign(state, {
          where: (x: any) => { state.__cond = x; return c; },
          orderBy: () => c,
          innerJoin: () => c,
          leftJoin: () => c,
          limit: (n: number) => Promise.resolve(project(rows().slice(0, n))),
          then: (res: any, rej: any) => Promise.resolve(project(rows())).then(res, rej),
        });
        return c;
      },
    }),
    insert: (t: any) => ({
      values: (v: any) => {
        const row = { id: `new-${(store[tableOf(t)] ?? []).length + 1}`, ...v };
        (store[tableOf(t)] ??= []).push(row);
        store.__inserted = { table: tableOf(t), values: v };
        return Object.assign(Promise.resolve(), { returning: () => Promise.resolve([row]) });
      },
    }),
    update: (t: any) => ({
      set: (v: any) => ({
        where: (x: any) => {
          store.__updated = { table: tableOf(t), values: v, cond: x };
          for (const r of store[tableOf(t)] ?? []) if (evalCond(x, r)) Object.assign(r, v);
          return Promise.resolve();
        },
      }),
    }),
    delete: (t: any) => ({ where: (x: any) => { store.__deleted = { table: tableOf(t), cond: x }; return Promise.resolve(); } }),
  };
  return { store, db };
});

vi.mock("drizzle-orm", () => ({
  and: (...parts: any[]) => ({ __op: "and", parts: parts.filter(Boolean) }),
  or: (...parts: any[]) => ({ __op: "or", parts: parts.filter(Boolean) }),
  not: (part: any) => ({ __op: "not", part }),
  exists: (sub: any) => ({ __op: "exists", sub }),
  eq: (col: any, val: any) => ({ __op: "eq", col: col?.name, val, valCol: val?.name }),
  ne: (col: any, val: any) => ({ __op: "ne", col: col?.name, val }),
  inArray: (col: any, val: any) => ({ __op: "inArray", col: col?.name, val }),
  desc: (c: any) => c,
  asc: (c: any) => c,
  count: () => ({ __sql: true }),
  sql: Object.assign(() => ({ __sql: true }), { raw: () => ({ __sql: true }) }),
}));

vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("./snapshot", () => ({
  planSnapshot: () => ({ healthGrade: "B", netWorth: 0 }),
  planMetrics: () => ({ netWorth: 0, healthGrade: "B" }),
  newCaseData: () => ({}),
}));
vi.mock("./codeAlloc", () => ({ allocCode: async () => "2608099" }));

const OWNER = "coach-owner";
const HELPER = "coach-helper";
const STRANGER = "coach-stranger";
const CID = "client-1";

function seed(collabStatus: string | null = "accepted") {
  // isTemplate 是 DB 的 NOT NULL DEFAULT false，真實的列一定有值；
  // 假資料少了它，兩把尺的 `is_template = false` 條件就求不到值（整列會被濾掉）。
  h.store.clients = [{ id: CID, coachId: OWNER, name: "陳純愛", code: "2608078", status: "active", isTemplate: false }];
  h.store.coaches = [
    { id: OWNER, name: "主責教練", displayName: null, code: "FC2608001", status: "active", title: null },
    { id: HELPER, name: "協作教練", displayName: null, code: "FC2608012", status: "active", title: null },
  ];
  h.store.client_collaborators = collabStatus
    ? [{ id: "cc-1", clientId: CID, coachId: HELPER, invitedBy: OWNER, status: collabStatus, createdAt: new Date("2026-08-24"), respondedAt: null }]
    : [];
  h.store.plans = [];
  h.store.reviews = [];
  h.store.action_items = [];
  delete h.store.__updated;
  delete h.store.__inserted;
  delete h.store.__deleted;
}

beforeEach(() => { vi.resetModules(); seed(); });

describe("clientAccess：誰看得到這位客戶", () => {
  it("主責是 owner", async () => {
    const { clientAccess } = await import("./clientScope");
    expect(await clientAccess(OWNER, CID)).toBe("owner");
  });

  it("已接受邀請的協作教練是 viewer", async () => {
    const { clientAccess } = await import("./clientScope");
    expect(await clientAccess(HELPER, CID)).toBe("viewer");
  });

  it("邀請還沒被接受（pending）＝看不到", async () => {
    seed("pending");
    const { clientAccess } = await import("./clientScope");
    expect(await clientAccess(HELPER, CID)).toBeNull();
  });

  it("被主責移除（revoked）＝當場看不到", async () => {
    seed("revoked");
    const { clientAccess } = await import("./clientScope");
    expect(await clientAccess(HELPER, CID)).toBeNull();
  });

  it("路人看不到", async () => {
    const { clientAccess } = await import("./clientScope");
    expect(await clientAccess(STRANGER, CID)).toBeNull();
  });
});

describe("讀 vs 寫是兩把尺", () => {
  it("getClientForRead 協作教練讀得到；getClient（寫入用）讀不到", async () => {
    const { getClient, getClientForRead } = await import("./clients");
    expect((await getClientForRead(HELPER, CID))?.name).toBe("陳純愛");
    // ⚠️ 這條是整個功能的地基：所有寫入都靠 getClient 擋人。
    expect(await getClient(HELPER, CID)).toBeNull();
  });

  it("協作教練改不了客戶資料", async () => {
    const { updateClient } = await import("./clients");
    await expect(updateClient(HELPER, CID, { name: "改掉" })).rejects.toThrow("forbidden");
    expect(h.store.__updated).toBeUndefined();
  });

  it("協作教練建不了新的年度版本", async () => {
    const { createPlan } = await import("./plans");
    await expect(createPlan(HELPER, CID, "陳純愛")).rejects.toThrow("forbidden");
    expect(h.store.__inserted).toBeUndefined();
  });

  it("協作教練寫不了諮詢紀錄", async () => {
    const { createReview } = await import("./reviews");
    await expect(createReview(HELPER, CID, { date: "2026-08-24", type: "review" } as any)).rejects.toThrow("forbidden");
  });

  it("主責當然改得動", async () => {
    const { updateClient } = await import("./clients");
    await updateClient(OWNER, CID, { name: "陳純愛（改）" });
    expect(h.store.__updated?.table).toBe("clients");
  });
});

describe("邀請／回覆／移除", () => {
  it("用教練編號邀請，建出一筆 pending", async () => {
    seed(null);
    const { inviteCollaborator } = await import("./clientCollab");
    const r = await inviteCollaborator(OWNER, CID, "fc2608012");   // 小寫、有空白都要吃得下
    expect(r.ok).toBe(true);
    expect(h.store.client_collaborators[0]).toMatchObject({ coachId: HELPER, status: "pending" });
  });

  it("不是主責的人不能邀人進來", async () => {
    seed(null);
    const { inviteCollaborator } = await import("./clientCollab");
    const r = await inviteCollaborator(STRANGER, CID, "FC2608012");
    expect(r).toMatchObject({ ok: false });
    expect(h.store.client_collaborators).toHaveLength(0);
  });

  it("不能邀自己", async () => {
    seed(null);
    const { inviteCollaborator } = await import("./clientCollab");
    const r = await inviteCollaborator(OWNER, CID, "FC2608001");
    expect(r).toMatchObject({ ok: false, error: "這是你自己的編號" });
  });

  it("查無編號就是查無編號，不要靜靜建一筆", async () => {
    seed(null);
    const { inviteCollaborator } = await import("./clientCollab");
    const r = await inviteCollaborator(OWNER, CID, "FC9999999");
    expect(r).toMatchObject({ ok: false });
    expect(h.store.client_collaborators).toHaveLength(0);
  });

  it("重新邀請婉拒過的人＝同一列改回 pending，不是長出第二列", async () => {
    seed("declined");
    const { inviteCollaborator } = await import("./clientCollab");
    const r = await inviteCollaborator(OWNER, CID, "FC2608012");
    expect(r.ok).toBe(true);
    expect(h.store.client_collaborators).toHaveLength(1);
    expect(h.store.client_collaborators[0].status).toBe("pending");
  });

  it("已在名單中就不重複邀", async () => {
    const { inviteCollaborator } = await import("./clientCollab");
    const r = await inviteCollaborator(OWNER, CID, "FC2608012");
    expect(r).toMatchObject({ ok: false });
  });

  it("接受邀請後才看得到；婉拒則否", async () => {
    seed("pending");
    const { respondToCollabInvite } = await import("./clientCollab");
    const { clientAccess } = await import("./clientScope");
    expect(await respondToCollabInvite("cc-1", HELPER, true)).toMatchObject({ ok: true });
    expect(await clientAccess(HELPER, CID)).toBe("viewer");
  });

  it("別人的邀請動不了", async () => {
    seed("pending");
    const { respondToCollabInvite } = await import("./clientCollab");
    expect(await respondToCollabInvite("cc-1", STRANGER, true)).toMatchObject({ ok: false });
    expect(h.store.client_collaborators[0].status).toBe("pending");
  });

  it("同一筆邀請不能處理兩次", async () => {
    const { respondToCollabInvite } = await import("./clientCollab");
    expect(await respondToCollabInvite("cc-1", HELPER, true)).toMatchObject({ ok: false });
  });

  it("主責移除後，協作教練當場失去可見權", async () => {
    const { revokeCollaborator } = await import("./clientCollab");
    const { clientAccess } = await import("./clientScope");
    expect(await revokeCollaborator(OWNER, CID, "cc-1")).toMatchObject({ ok: true });
    expect(await clientAccess(HELPER, CID)).toBeNull();
  });

  it("協作教練不能把自己以外的人移除，也不能移除自己以外的關係", async () => {
    const { revokeCollaborator } = await import("./clientCollab");
    expect(await revokeCollaborator(HELPER, CID, "cc-1")).toMatchObject({ ok: false });
    expect(h.store.client_collaborators[0].status).toBe("accepted");
  });
});
