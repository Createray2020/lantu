/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 推薦來源標記（2026/10/20）。
 * 守三件事：① 碼要是 active 教練才寫；② first-touch——列上已有來源就不覆蓋；③ 它只碰 client_users 的三個欄位，
 * 不建 coach_link_requests、不動 clients.coach_id（歸屬那條路完全不碰）。
 */
const h = vi.hoisted(() => {
  const state: any = {
    coach: { id: "c1", name: "林教練", title: null, code: "FC2609002", status: "active" } as any,
    row: { id: "u1", referrerCoachId: null as string | null, referrerCode: null as string | null, referredAt: null as Date | null },
    updates: [] as any[],
    inserts: [] as any[],
  };
  const db = {
    select: () => ({
      from: (t: any) => ({
        where: () => {
          const q: any = {
            limit: async () => (t?._n === "coaches" && state.coach ? [state.coach] : []),
            then: (res: any, rej: any) => Promise.resolve(t?._n === "client_users" ? [{ n: state.row.referrerCoachId ? 1 : 0 }] : []).then(res, rej),
          };
          return q;
        },
      }),
    }),
    update: (t: any) => ({
      set: (s: any) => ({
        where: () => ({
          returning: async () => {
            state.updates.push({ table: t?._n, set: s });
            if (state.row.referrerCoachId) return [];           // WHERE referrer_coach_id IS NULL 沒命中
            state.row = { ...state.row, ...s };
            return [{ id: "u1" }];
          },
        }),
      }),
    }),
    insert: (t: any) => ({ values: (v: any) => { state.inserts.push({ table: t?._n, v }); return Promise.resolve(); } }),
  };
  return { state, db };
});
vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => ({
  clientUsers: { _n: "client_users", id: { name: "id" }, referrerCoachId: { name: "referrer_coach_id" } },
  coaches: { _n: "coaches", id: { name: "id" }, code: { name: "code" }, status: { name: "status" }, title: { name: "title" } },
  coachLinkRequests: { _n: "coach_link_requests" },
  clients: { _n: "clients" },
  coachDisplayName: { name: "name" },
}));

import { attachReferral, countReferred, referralPath, REF_COOKIE } from "./referral";

beforeEach(() => {
  h.state.row = { id: "u1", referrerCoachId: null, referrerCode: null, referredAt: null };
  h.state.updates = []; h.state.inserts = [];
  h.state.coach = { id: "c1", name: "林教練", title: null, code: "FC2609002", status: "active" };
});

describe("推薦來源", () => {
  it("連結帶的是正規化後的教練編號", () => {
    expect(referralPath("fc2609002")).toBe("/r/FC2609002");
    expect(REF_COOKIE).toBe("lantu_ref");
  });
  it("有效碼：寫三欄、只動 client_users、不建任何連結申請", async () => {
    const r = await attachReferral("u1", "FC2609002");
    expect(r?.coachId).toBe("c1");
    expect(h.state.row.referrerCode).toBe("FC2609002");
    expect(h.state.updates.map((u: any) => u.table)).toEqual(["client_users"]);
    expect(h.state.inserts).toEqual([]);
  });
  it("first-touch：列上已有來源就不覆蓋", async () => {
    h.state.row.referrerCoachId = "c0"; h.state.row.referrerCode = "FC2501001";
    const r = await attachReferral("u1", "FC2609002");
    expect(r).toBeNull();
    expect(h.state.row.referrerCode).toBe("FC2501001");
  });
  it("碼無效（查不到 active 教練）：什麼都不寫", async () => {
    h.state.coach = null;
    const r = await attachReferral("u1", "FC9999999");
    expect(r).toBeNull();
    expect(h.state.updates).toEqual([]);
  });
  it("countReferred 回數字", async () => {
    h.state.row.referrerCoachId = "c1";
    expect(await countReferred("c1")).toBe(1);
  });
});
