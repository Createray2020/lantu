import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 回復（rollback）的兩條不變式。
 *
 * 這兩條都不是「功能」而是「安全性」：壞掉的時候不會報錯，只會安靜地
 * 讓使用者失去資料 or 讓別人寫進你的規劃。所以一定要有測試守著。
 */

const state = vi.hoisted(() => ({
  revision: null as null | { id: string; planId: string; clientId: string; track: string; data: unknown },
  updates: [] as { planId: string; data: unknown }[],
  logged: [] as { planId: string; editorType: string; data: unknown }[],
}));

vi.mock("@/Shared/db", () => {
  const chain = (rows: unknown[]) => {
    const o: Record<string, unknown> = {};
    for (const k of ["from", "innerJoin", "where", "orderBy", "limit"]) {
      o[k] = () => (k === "limit" ? Promise.resolve(rows) : o);
    }
    // await 沒有 .limit() 的鏈時也要能解析
    (o as { then?: unknown }).then = (res: (v: unknown) => void) => res(rows);
    return o;
  };
  return {
    db: {
      select: () => chain(state.revision ? [state.revision] : []),
      update: () => ({
        set: (v: { data: unknown }) => ({
          where: () => {
            state.updates.push({ planId: state.revision?.planId ?? "?", data: v.data });
            return Promise.resolve();
          },
        }),
      }),
      insert: () => ({
        values: (v: { planId: string; editorType: string; data: unknown }) => {
          state.logged.push(v);
          return Promise.resolve();
        },
      }),
    },
  };
});

vi.mock("./snapshot", () => ({ planSnapshot: () => ({ healthGrade: "B", netWorth: 1 }) }));

const { restoreRevision } = await import("./revisions");

beforeEach(() => {
  state.revision = null;
  state.updates = [];
  state.logged = [];
});

describe("restoreRevision", () => {
  it("擋跨 plan 回復：revisionId 屬於別份 plan 時不能寫入", async () => {
    state.revision = { id: "r1", planId: "PLAN-B", clientId: "c1", track: "coach", data: { x: 1 } };
    const res = await restoreRevision("PLAN-A", "r1", { type: "coach", id: "u", name: "教練" });
    expect(res.ok).toBe(false);
    // 最重要的是「沒有寫進去」，不是錯誤訊息長什麼樣
    expect(state.updates).toHaveLength(0);
    expect(state.logged).toHaveLength(0);
  });

  it("找不到版本時不寫入", async () => {
    state.revision = null;
    const res = await restoreRevision("PLAN-A", "nope", { type: "client", id: "u", name: "客戶" });
    expect(res.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it("回復本身也記一筆新版本——否則被跳過的那幾版會變成回不去的孤兒", async () => {
    state.revision = { id: "r1", planId: "PLAN-A", clientId: "c1", track: "client", data: { hello: "old" } };
    const res = await restoreRevision("PLAN-A", "r1", { type: "client", id: "u1", name: "小明" });
    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data).toEqual({ hello: "old" });
    expect(state.logged).toHaveLength(1);
    // 記的是「誰按下回復」，不是原作者
    expect(state.logged[0].editorType).toBe("client");
    expect(state.logged[0].data).toEqual({ hello: "old" });
  });
});
