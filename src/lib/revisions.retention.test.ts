import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * plan_revisions 的保留策略（Ray 2026/08 拍板）。
 *
 * 這張表 13 MB / 2,287 列全部只來自 23 份規劃（單份最高 740 版），佔整個資料庫的一半，
 * 週成長 3.5 倍——而前端是 700ms debounce 自動存檔，絕大多數版本內容根本一模一樣。
 * 最要命的是它**沒有任何可觀察的症狀**：listRevisions/listClientTimeline 都有 limit，
 * 查詢永遠不會變慢，直到 Neon 的 512 MB 撞牆為止。
 *
 * 兩條規則：
 *   1. 內容 hash 與上一版相同 → 整個跳過，不寫。
 *   2. 真的寫入之後 → 刪掉該 planId 最近 200 列以外的。
 *
 * ⚠️ 第 2 條**只在這次真的有寫入時**才跑，而且只針對那一個 planId：
 *    Ray 要的是「只對新產生的生效、不做一次性清理」。沒有人再編輯的規劃一列都不會被動到。
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  /** 每次終端（.limit() 或 await）依序取一組 */
  rows: [] as unknown[][],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deletes: 0,
  deleteThrows: false,
  /** 每一次 sql`...` 的樣板：用來釘住「保留 200 列、依 created_at desc、限定 plan_id」 */
  sql: [] as { text: string; vals: unknown[] }[],
}));

vi.mock("@/Shared/db", () => {
  const chain = (rows: () => unknown[]): Row => {
    const o: Record<string, unknown> = {};
    for (const k of ["from", "innerJoin", "where", "orderBy"]) o[k] = () => o;
    o.limit = () => Promise.resolve(rows());
    o.then = (res: (v: unknown) => void) => Promise.resolve(rows()).then(res);
    return o;
  };
  const next = () => state.rows.shift() ?? [];
  return {
    db: {
      select: () => chain(next),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          state.inserts.push(v);
          return Promise.resolve([]);
        },
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => {
            state.updates.push(v);
            return Promise.resolve([]);
          },
        }),
      }),
      delete: () => ({
        where: () => {
          state.deletes++;
          return state.deleteThrows
            ? Promise.reject(new Error("delete 掛了"))
            : Promise.resolve([]);
        },
      }),
    },
  };
});

vi.mock("@/Shared/db/schema", () => {
  const tbl = (n: string) => new Proxy({}, { get: (_t, k) => (k === "_n" ? n : { _col: String(k) }) });
  return { planRevisions: tbl("plan_revisions"), plans: tbl("plans") };
});

vi.mock("drizzle-orm", () => {
  const f = () => ({});
  const tag = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    state.sql.push({ text: strings.join(" ? "), vals });
    return {};
  };
  return { and: f, desc: f, eq: f, sql: Object.assign(tag, { raw: f }) };
});

vi.mock("./snapshot", () => ({ planSnapshot: () => ({ healthGrade: "B", netWorth: 1 }) }));

const { logRevision, revisionHash, restoreRevision, MAX_REVISIONS_PER_PLAN } =
  await import("./revisions");

const DATA = { goals: [{ name: "退休", amount: 3_000_000 }], year: 2026 };

beforeEach(() => {
  state.rows = [];
  state.inserts = [];
  state.updates = [];
  state.deletes = 0;
  state.deleteThrows = false;
  state.sql = [];
});

describe("內容 hash 去重", () => {
  it("上一版的 hash 一樣就整個跳過——不寫、也不清理", async () => {
    state.rows = [[{ dataHash: revisionHash(DATA) }]];
    await logRevision("p1", "coach", "u1", "教練", { ...DATA });
    expect(state.inserts).toHaveLength(0);
    // 沒有寫入就不該清理：不然「只讀不寫」的頁面也會把舊版本刪掉。
    expect(state.deletes).toBe(0);
  });

  it("內容改了就寫，而且把 hash 一起存進去", async () => {
    state.rows = [[{ dataHash: revisionHash(DATA) }]];
    const changed = { ...DATA, year: 2027 };
    await logRevision("p1", "coach", "u1", "教練", changed);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].dataHash).toBe(revisionHash(changed));
    expect(state.inserts[0].planId).toBe("p1");
    expect(state.inserts[0].data).toEqual(changed);
  });

  it("舊列沒有 hash（欄位是後來才加的、既有 2,287 列都是 null）→ 照寫，不會漏版本", async () => {
    state.rows = [[{ dataHash: null }]];
    await logRevision("p1", "coach", "u1", "教練", DATA);
    expect(state.inserts).toHaveLength(1);
  });

  it("這份規劃還沒有任何版本時照寫", async () => {
    state.rows = [[]];
    await logRevision("p1", "client", "c1", "客戶", DATA);
    expect(state.inserts).toHaveLength(1);
  });

  it("hash 只看內容，不看物件identity；內容不同必然不同 hash", () => {
    expect(revisionHash({ a: 1 })).toBe(revisionHash({ a: 1 }));
    expect(revisionHash({ a: 1 })).not.toBe(revisionHash({ a: 2 }));
    // undefined 不會炸（plans.ts 提過 logRevision(..., undefined) 這條路）
    expect(typeof revisionHash(undefined)).toBe("string");
  });
});

describe("保留 200 版", () => {
  it("上限是 200", () => {
    expect(MAX_REVISIONS_PER_PLAN).toBe(200);
  });

  it("真的寫入之後才清理，且清理只針對這一個 planId、只留最近 200 列", async () => {
    state.rows = [[{ dataHash: "不一樣" }]];
    await logRevision("PLAN-A", "coach", "u1", "教練", DATA);
    expect(state.inserts).toHaveLength(1);
    expect(state.deletes).toBe(1);

    const del = state.sql.at(-1)!;
    // 語意：該 plan 依 created_at 新→舊排序，跳過前 200 列，其餘刪掉。
    expect(del.text).toContain("plan_id =");
    expect(del.text).toContain("order by created_at desc");
    expect(del.text).toContain("offset");
    expect(del.vals).toContain("PLAN-A");
    expect(del.vals).toContain(MAX_REVISIONS_PER_PLAN);
  });

  it("被去重跳過的那一次不會觸發清理——舊資料只在該份規劃真的被再編輯時才收斂", async () => {
    const h = revisionHash(DATA);
    state.rows = [[{ dataHash: h }], [{ dataHash: h }]];
    await logRevision("PLAN-A", "coach", "u1", "教練", DATA);
    await logRevision("PLAN-A", "coach", "u1", "教練", DATA);
    expect(state.deletes).toBe(0);
  });
});

describe("清理／記錄失敗都不能擋住存檔", () => {
  it("清理丟例外時 logRevision 仍然正常結束，而且版本已經寫進去了", async () => {
    state.rows = [[{ dataHash: "不一樣" }]];
    state.deleteThrows = true;
    await expect(
      logRevision("PLAN-A", "coach", "u1", "教練", DATA),
    ).resolves.toBeUndefined();
    expect(state.inserts).toHaveLength(1);
  });

  it("整段掛掉（連讀上一版都失敗）也只是記 log，不往上丟", async () => {
    state.rows = [];
    const boom = { get toJSON(): never { throw new Error("序列化炸了"); } };
    await expect(
      logRevision("PLAN-A", "coach", "u1", "教練", boom),
    ).resolves.toBeUndefined();
  });
});

describe("去重不會弄壞「回復到某一版」", () => {
  it("回復到內容不同的舊版：plan 被寫回去，而且照樣記一筆新版本", async () => {
    state.rows = [
      [{ id: "r1", planId: "PLAN-A", clientId: "c1", track: "coach", data: { hello: "old" } }], // getRevision
      [{ dataHash: revisionHash({ hello: "new" }) }],                                           // logRevision 讀上一版
    ];
    const res = await restoreRevision("PLAN-A", "r1", { type: "coach", id: "u1", name: "教練" });
    expect(res.ok).toBe(true);
    expect(state.updates[0].data).toEqual({ hello: "old" });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].data).toEqual({ hello: "old" });
  });

  it("回復到「跟目前最新版一模一樣」的版本：不多記一列，但 plan 內容照樣寫回去（沒有資料損失）", async () => {
    const same = { hello: "same" };
    state.rows = [
      [{ id: "r1", planId: "PLAN-A", clientId: "c1", track: "coach", data: same }],
      [{ dataHash: revisionHash(same) }],
    ];
    const res = await restoreRevision("PLAN-A", "r1", { type: "coach", id: "u1", name: "教練" });
    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data).toEqual(same);
    expect(state.inserts).toHaveLength(0);
  });
});
