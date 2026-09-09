/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 訪客登入紀錄（2026/09/09 Ray：後台要看得到有多少外部客戶登入過）。
 *
 * ⚠️⚠️ 這支測試的存在理由只有一個：**一次登入 ≠ 一次頁面載入**。
 *    ensureClientUser() 每開一頁就跑一次，天真地 +1 的話，一位訪客在站上翻十頁
 *    就會在後台變成「登入 10 次」——那個數字看起來很正常，但完全是假的。
 */
const h = vi.hoisted(() => {
  const state: any = {
    row: { id: "u1", email: "a@b.c", name: "王大明", status: "active", lastSessionId: null, lastLoginAt: null, loginCount: 0 },
    events: [] as any[],
    sessionId: "sess_1" as string | null,
    authThrows: false,
  };
  const db = {
    insert: (t: any) => ({
      values: (v: any) => {
        if (t?._n === "client_login_events") state.events.push(v);
        const c: any = {
          onConflictDoUpdate: () => Promise.resolve(),
          then: (res: any, rej: any) => Promise.resolve().then(res, rej),
        };
        return c;
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [state.row] }) }) }),
    // WHERE last_session_id IS DISTINCT FROM ? 的行為：不同才改到列、才回傳。
    update: () => ({
      set: (s: any) => ({
        where: () => ({
          returning: async () => {
            if (state.row.lastSessionId === s.lastSessionId) return [];
            state.row = { ...state.row, lastSessionId: s.lastSessionId, lastLoginAt: s.lastLoginAt, loginCount: state.row.loginCount + 1 };
            return [{ id: state.row.id }];
          },
        }),
      }),
    }),
  };
  return { state, db };
});

vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => ({
  clientUsers: { _n: "client_users", id: { name: "id" }, lastSessionId: { name: "last_session_id" }, loginCount: { name: "login_count" } },
  clientLoginEvents: { _n: "client_login_events" },
}));
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: async () => ({ id: "u1", emailAddresses: [{ emailAddress: "A@B.c" }], firstName: "王", lastName: "大明" }),
  auth: async () => {
    if (h.state.authThrows) throw new Error("clerk down");
    return { sessionId: h.state.sessionId };
  },
}));

import { ensureClientUser } from "./clientUser";

beforeEach(() => {
  h.state.row = { id: "u1", email: "a@b.c", name: "王大明", status: "active", lastSessionId: null, lastLoginAt: null, loginCount: 0 };
  h.state.events = [];
  h.state.sessionId = "sess_1";
  h.state.authThrows = false;
});

describe("ensureClientUser 的登入紀錄", () => {
  it("同一個 session 翻十頁只算一次登入", async () => {
    for (let i = 0; i < 10; i++) await ensureClientUser();
    expect(h.state.row.loginCount).toBe(1);
    expect(h.state.events).toHaveLength(1);
  });

  it("換一個 session（重新登入）才再加一次", async () => {
    await ensureClientUser();
    h.state.sessionId = "sess_2";
    await ensureClientUser();
    await ensureClientUser();
    expect(h.state.row.loginCount).toBe(2);
    expect(h.state.events.map((e: any) => e.sessionId)).toEqual(["sess_1", "sess_2"]);
  });

  it("第一次登入（last_session_id 還是 NULL）一定要記到 —— `<> ?` 對 NULL 不成立，所以用 IS DISTINCT FROM", async () => {
    expect(h.state.row.lastSessionId).toBeNull();
    await ensureClientUser();
    expect(h.state.events).toHaveLength(1);
    expect(h.state.row.lastLoginAt).toBeInstanceOf(Date);
  });

  it("停權帳號回 null，也不留下登入紀錄", async () => {
    h.state.row = { ...h.state.row, status: "suspended" };
    expect(await ensureClientUser()).toBeNull();
    expect(h.state.events).toHaveLength(0);
  });

  it("⚠️ Clerk 抖動／拿不到 sessionId 時只是沒記到，不能讓客戶連 /portal 都進不去", async () => {
    h.state.authThrows = true;
    expect(await ensureClientUser()).not.toBeNull();
    h.state.authThrows = false;
    h.state.sessionId = null;
    expect(await ensureClientUser()).not.toBeNull();
    expect(h.state.events).toHaveLength(0);
  });
});
