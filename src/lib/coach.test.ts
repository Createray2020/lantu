/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「誰會被建成教練」的守門測試。
 *
 * 2026/08/20 事故：ensureCoach() 原本是 upsert，任何登入者只要走到 /dashboard 就被
 * 建成 status=pending 的教練。教練把邀請連結發給客戶，客戶註冊後被 Clerk 的全域
 * fallbackRedirectUrl(/dashboard) 丟進教練端，畫面直接變成「帳號待開通／已收到您的使用申請」。
 * 建立教練列必須是明確動作（applyAsCoach），ensureCoach 一律唯讀。
 */

const h = vi.hoisted(() => {
  const T = { coaches: { _n: "coaches" }, clients: { _n: "clients" }, compCases: { _n: "comp_cases" } };
  // rows＝coaches 查詢結果；counts＝clients/comp_cases 的 count() 結果；moved＝transferClients 影響列
  const state: any = {
    rows: [] as any[], inserts: [] as any[], updates: [] as any[], deletes: [] as string[],
    counts: { clients: 0, comp_cases: 0 }, moved: [] as any[],
  };
  const db = {
    select: () => ({
      from: (t: any) => {
        const table = t?._n ?? "coaches";
        const rows = () => (table === "coaches" ? state.rows : [{ n: state.counts[table] ?? 0 }]);
        const c: any = {
          where: () => c,
          groupBy: () => Promise.resolve(rows()),
          limit: () => Promise.resolve(rows()),
          then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
        };
        return c;
      },
    }),
    insert: () => ({
      values: (v: any) => {
        state.inserts.push(v);
        const c: any = { returning: () => Promise.resolve([{ ...v }]), onConflictDoUpdate: () => c };
        return c;
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        const table = t?._n ?? "coaches";
        state.updates.push({ table, ...v });
        const c: any = {
          where: () => c,
          returning: () => Promise.resolve(table === "clients" ? state.moved : [{ ...state.rows[0], ...v }]),
        };
        return c;
      },
    }),
    delete: (t: any) => {
      const c: any = {
        where: () => {
          state.deletes.push(t?._n ?? "coaches");
          return Promise.resolve([]);
        },
      };
      return c;
    },
  };
  const currentUser = vi.fn();
  return { T, state, db, currentUser };
});

vi.mock("react", async (orig) => ({ ...(await orig<any>()), cache: (f: any) => f }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), count: () => ({}) }));
vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => h.T);
vi.mock("@clerk/nextjs/server", () => ({ currentUser: h.currentUser }));

import { ensureCoach, applyAsCoach, transferClients, removeCoach } from "./coach";

function signedInAs(email: string) {
  h.currentUser.mockResolvedValue({
    id: "user_1",
    firstName: "小明",
    lastName: "王",
    username: null,
    primaryEmailAddress: { emailAddress: email, verification: { status: "verified" } },
  });
}

beforeEach(() => {
  h.state.rows = [];
  h.state.inserts = [];
  h.state.updates = [];
  h.state.deletes = [];
  h.state.counts = { clients: 0, comp_cases: 0 };
  h.state.moved = [];
  h.currentUser.mockReset();
  process.env.LANTU_ADMIN_EMAILS = "boss@lantu.tw";
});

describe("ensureCoach：唯讀，不會把人變成教練", () => {
  it("一般登入者沒有 coaches 列 → 回 null，且完全不寫入", async () => {
    signedInAs("client@example.com");
    expect(await ensureCoach()).toBeNull();
    expect(h.state.inserts).toHaveLength(0);
    expect(h.state.updates).toHaveLength(0);
  });

  it("未登入 → 回 null", async () => {
    h.currentUser.mockResolvedValue(null);
    expect(await ensureCoach()).toBeNull();
    expect(h.state.inserts).toHaveLength(0);
  });

  it("既有教練照常回傳，status 不被覆寫", async () => {
    h.state.rows = [{ id: "user_1", email: "coach@example.com", name: "小明 王", role: "coach", status: "active", approvedAt: new Date() }];
    signedInAs("coach@example.com");
    const c = await ensureCoach();
    expect(c?.status).toBe("active");
    expect(h.state.inserts).toHaveLength(0);
  });

  it("既有教練的 email/name 變了會同步，但不動 status", async () => {
    h.state.rows = [{ id: "user_1", email: "old@example.com", name: "舊名", role: "coach", status: "pending", approvedAt: null }];
    signedInAs("coach@example.com");
    await ensureCoach();
    expect(h.state.updates).toEqual([{ table: "coaches", email: "coach@example.com", name: "小明 王" }]);
  });

  it("白名單 admin 沒有列 → 自動建立 admin+active（環境變數＝明確意圖）", async () => {
    signedInAs("boss@lantu.tw");
    const c = await ensureCoach();
    expect(c?.role).toBe("admin");
    expect(c?.status).toBe("active");
    expect(h.state.inserts).toHaveLength(1);
  });

  it("被移出白名單的 admin 會降回 coach", async () => {
    h.state.rows = [{ id: "user_1", email: "coach@example.com", name: "小明 王", role: "admin", status: "active", approvedAt: null }];
    signedInAs("coach@example.com");
    const c = await ensureCoach();
    expect(c?.role).toBe("coach");
  });
});

describe("applyAsCoach：唯一會建立教練列的入口", () => {
  it("建立 status=pending 的教練列", async () => {
    signedInAs("newcoach@example.com");
    const c = await applyAsCoach();
    expect(c?.status).toBe("pending");
    expect(c?.role).toBe("coach");
    expect(h.state.inserts).toHaveLength(1);
  });

  it("已存在的列不覆寫 status（停權者不能靠再申請一次救回 pending）", async () => {
    h.state.rows = [{ id: "user_1", email: "x@example.com", name: "小明 王", role: "coach", status: "suspended", approvedAt: null }];
    signedInAs("x@example.com");
    await applyAsCoach();
    // onConflictDoUpdate 只帶 email/name
    expect(h.state.inserts[0]).toMatchObject({ status: "pending" }); // values 內容
    // 真正落地的是 onConflict 的 set(email,name)，這裡確認沒有額外的 status update
    expect(h.state.updates.some((u: any) => "status" in u)).toBe(false);
  });
});


/**
 * 移除教練的兩道門檻。
 *
 * `clients.coach_id` 與 `comp_cases.executor_id` 對 coaches 原本都是 ON DELETE CASCADE ——
 * 在 /admin 刪一位教練會把他名下所有客戶、規劃與分潤案件一起靜默刪掉，畫面上沒有任何警告。
 * schema 已改成 RESTRICT，這裡是「先擋住並給得出理由」的那一層。
 */
describe("removeCoach：擋住誤刪", () => {
  beforeEach(() => {
    h.state.rows = [{ id: "coach_x", email: "x@example.com", name: "小明 王", role: "coach", status: "suspended" }];
  });

  it("有分潤案件 → 永遠不可移除，請改用停權", async () => {
    h.state.counts = { clients: 0, comp_cases: 3 };
    const r = await removeCoach("coach_x", "admin_1");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("停權");
    expect(h.state.deletes).toHaveLength(0);
  });

  it("名下還有客戶 → 要先轉移", async () => {
    h.state.counts = { clients: 5, comp_cases: 0 };
    const r = await removeCoach("coach_x", "admin_1");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("5 位客戶");
    expect(h.state.deletes).toHaveLength(0);
  });

  it("案件優先於客戶提示（兩者都有時先講不可刪）", async () => {
    h.state.counts = { clients: 5, comp_cases: 2 };
    const r = await removeCoach("coach_x", "admin_1");
    expect(r.ok === false && r.error).toContain("不可移除");
  });

  it("不能移除自己", async () => {
    const r = await removeCoach("coach_x", "coach_x");
    expect(r.ok).toBe(false);
    expect(h.state.deletes).toHaveLength(0);
  });

  it("找不到帳號 → 拒絕", async () => {
    h.state.rows = [];
    const r = await removeCoach("coach_x", "admin_1");
    expect(r.ok).toBe(false);
    expect(h.state.deletes).toHaveLength(0);
  });

  it("沒客戶也沒案件 → 才真的刪", async () => {
    const r = await removeCoach("coach_x", "admin_1");
    expect(r.ok).toBe(true);
    expect(h.state.deletes).toEqual(["coaches"]);
  });
});

describe("transferClients", () => {
  beforeEach(() => {
    h.state.rows = [{ id: "coach_to", email: "to@example.com", name: "接手", role: "coach", status: "active" }];
    h.state.moved = [{ id: "cl_1" }, { id: "cl_2" }];
  });

  it("整批改掛到接手教練，且只動 clients", async () => {
    const r = await transferClients("coach_from", "coach_to");
    expect(r).toEqual({ ok: true, moved: 2 });
    const tables = h.state.updates.map((u: any) => u.table);
    expect(tables).toEqual(["clients"]);
    expect(h.state.updates[0].coachId).toBe("coach_to");
  });

  it("不動 comp_cases.executorId（改掉會竄改誰執行了案子）", async () => {
    await transferClients("coach_from", "coach_to");
    expect(h.state.updates.some((u: any) => u.table === "comp_cases")).toBe(false);
  });

  it("接手教練不能是同一人", async () => {
    const r = await transferClients("coach_a", "coach_a");
    expect(r.ok).toBe(false);
    expect(h.state.updates).toHaveLength(0);
  });

  it("接手教練必須是已開通", async () => {
    h.state.rows = [{ id: "coach_to", status: "pending", role: "coach", email: null, name: null }];
    const r = await transferClients("coach_from", "coach_to");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("已開通");
    expect(h.state.updates).toHaveLength(0);
  });

  it("找不到接手教練 → 拒絕", async () => {
    h.state.rows = [];
    const r = await transferClients("coach_from", "coach_to");
    expect(r.ok).toBe(false);
    expect(h.state.updates).toHaveLength(0);
  });
});
