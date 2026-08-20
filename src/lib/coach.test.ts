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
  const state: any = { rows: [] as any[], inserts: [] as any[], updates: [] as any[] };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(state.rows) }) }) }),
    insert: () => ({
      values: (v: any) => {
        state.inserts.push(v);
        const c: any = { returning: () => Promise.resolve([{ ...v }]), onConflictDoUpdate: () => c };
        return c;
      },
    }),
    update: () => ({
      set: (v: any) => {
        state.updates.push(v);
        const c: any = { where: () => c, returning: () => Promise.resolve([{ ...state.rows[0], ...v }]) };
        return c;
      },
    }),
  };
  const currentUser = vi.fn();
  return { state, db, currentUser };
});

vi.mock("react", async (orig) => ({ ...(await orig<any>()), cache: (f: any) => f }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => ({ coaches: { id: "id" } }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: h.currentUser }));

import { ensureCoach, applyAsCoach } from "./coach";

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
    expect(h.state.updates).toEqual([{ email: "coach@example.com", name: "小明 王" }]);
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
