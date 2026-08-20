import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「已經有規劃了，要覆蓋嗎？」這道確認。
 *
 * 沒有它會怎樣：一個已經做完規劃的人，在官網隨手玩一次試算、按下存檔，
 * plan.data 就被整份換成護照骨架。不會報錯、不會有提示，資料就沒了。
 * 所以這裡測的不是「有沒有跳確認視窗」，而是「在沒拿到明確同意前，一個字都不准寫」。
 */
const state = vi.hoisted(() => ({
  clientRows: [] as unknown[],
  planRows: [] as unknown[],
  writes: [] as string[],
}));

vi.mock("@/Shared/db", () => {
  let calls = 0;
  return {
    db: {
      select: () => {
        calls++;
        const o: Record<string, unknown> = {};
        for (const k of ["from", "where", "orderBy", "innerJoin"]) o[k] = () => o;
        o.limit = () => Promise.resolve(calls === 1 ? state.clientRows : state.planRows);
        return o;
      },
      update: () => ({ set: () => ({ where: () => { state.writes.push("update"); return Promise.resolve(); } }) }),
      insert: () => ({
        values: () => {
          state.writes.push("insert");
          return { returning: () => Promise.resolve([{ id: "new-plan" }]) };
        },
      }),
    },
  };
});
vi.mock("./revisions", () => ({ logRevision: async () => { state.writes.push("revision"); } }));

const { savePassport } = await import("./clientPlan");
const { emptyPassport } = await import("./passport");

const user = { id: "u1", name: "小明", email: null, status: "active", createdAt: new Date() };

beforeEach(() => { state.clientRows = []; state.planRows = []; state.writes = []; });

describe("savePassport 的覆蓋確認", () => {
  it("已有護照份、又沒帶 overwrite → 回 needs-confirm，且完全不寫入", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [{ id: "p1", data: {}, updatedAt: new Date("2026-08-01T00:00:00Z") }];

    const res = await savePassport(user, emptyPassport());

    expect(res.status).toBe("needs-confirm");
    if (res.status === "needs-confirm") {
      expect(res.existingUpdatedAt).toBe("2026-08-01T00:00:00.000Z");
    }
    // 最重要的一條：一個寫入都沒有發生
    expect(state.writes).toEqual([]);
  });

  it("帶了 overwrite → 才真的寫進去，並留一筆版本紀錄", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [{ id: "p1", data: {}, updatedAt: new Date() }];

    const res = await savePassport(user, emptyPassport(), { overwrite: true });

    expect(res.status).toBe("saved");
    expect(state.writes).toContain("update");
    // 覆蓋掉的舊內容要能回得去，所以一定要記一版
    expect(state.writes).toContain("revision");
  });

  it("還沒有任何護照份 → 直接建立，不需要確認", async () => {
    state.clientRows = [{ id: "c1" }];
    state.planRows = [];

    const res = await savePassport(user, emptyPassport());

    expect(res.status).toBe("saved");
    expect(state.writes).toContain("insert");
  });
});
