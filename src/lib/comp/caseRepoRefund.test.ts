import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 已發放案件的退費與重算（資料層）。
 *
 * 這裡守的是三條會直接吃掉錢的不變式：
 *   1. 已有 paid 列時**不重算**——舊版會為同一位受款人再 insert 一列 pending，
 *      而 partial unique `(case_id, payee_key) where status <> 'void'` 必定衝突。
 *   2. void 與 insert **同生共死**。舊版是兩趟往返：void 成功、insert 炸掉 →
 *      那批 pending 被永久標 void 而沒有新列補上，應付分潤憑空消失，
 *      畫面上只看到一個 Next digest 錯誤。neon-http 沒有互動式交易 → db.batch()。
 *   3. 退費金額與沖回列也必須同生共死，否則帳面與應付對不起來。
 */

type Row = Record<string, unknown>;
type Stmt = Record<string, unknown> & { _run: () => Row[] };
type Op = { kind: string; table: string; values: Record<string, unknown>[]; viaBatch: boolean };

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],       // 每次 select 終端依序取一組
  ops: [] as Op[],               // 真的被「執行」的寫入語句（await 或 batch）
  batches: [] as number[],       // 每次 db.batch() 送了幾句
  inBatch: false,
  insertThrows: false,
}));

vi.mock("@/Shared/db", () => {
  const nameOf = (t: unknown) => String((t as { _n?: string })?._n ?? "?");
  const stmt = (kind: string, table: string, values: Record<string, unknown>[]): Stmt => {
    const run = () => {
      state.ops.push({ kind, table, values, viaBatch: state.inBatch });
      if (kind === "insert" && state.insertThrows) throw new Error("insert 炸了");
      return [] as Row[];
    };
    const c = { _run: run } as Stmt;
    for (const k of ["where", "returning", "onConflictDoUpdate"]) c[k] = () => c;
    c.then = (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(run()).then(res, rej);
      } catch (e) {
        return Promise.reject(e).then(res, rej);
      }
    };
    return c;
  };
  const select = () => {
    const o: Record<string, unknown> = {};
    for (const k of ["from", "where", "orderBy", "innerJoin"]) o[k] = () => o;
    const take = () => state.rows.shift() ?? [];
    o.limit = () => Promise.resolve(take());
    o.then = (res: (v: unknown) => void) => Promise.resolve(take()).then(res);
    return o;
  };
  return {
    db: {
      select,
      update: (t: unknown) => ({
        set: (v: Record<string, unknown>) => stmt("update", nameOf(t), [v]),
      }),
      insert: (t: unknown) => ({
        values: (v: Record<string, unknown> | Record<string, unknown>[]) =>
          stmt("insert", nameOf(t), Array.isArray(v) ? v : [v]),
      }),
      delete: (t: unknown) => stmt("delete", nameOf(t), []),
      execute: () => Promise.resolve([]),
      batch: (items: Stmt[]) => {
        state.batches.push(items.length);
        state.inBatch = true;
        try {
          // 一句炸掉整批都不生效——真正的 batch 是一次交易。
          const out = items.map((i) => i._run());
          return Promise.resolve(out);
        } catch (e) {
          // 模擬交易回滾：把這一批已經記錄的 op 全部撤掉。
          state.ops = state.ops.filter((o) => !o.viaBatch);
          return Promise.reject(e);
        } finally {
          state.inBatch = false;
        }
      },
    },
  };
});

vi.mock("@/Shared/db/schema", () => {
  const tbl = (n: string) => new Proxy({}, { get: (_t, k) => (k === "_n" ? n : { _col: String(k) }) });
  return {
    coaches: tbl("coaches"), compBatches: tbl("comp_batches"), compCases: tbl("comp_cases"),
    compMaintenance: tbl("comp_maintenance"), compPayouts: tbl("comp_payouts"),
    compRankEvents: tbl("comp_rank_events"), compTrainingRecords: tbl("comp_training_records"),
    compTrainingSessions: tbl("comp_training_sessions"),
  };
});

vi.mock("drizzle-orm", () => {
  const f = () => ({});
  const tag = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    sqlSeen.push(strings.join(" ? "));
    void vals;
    return {};
  };
  return { and: f, desc: f, eq: f, inArray: f, isNull: f, sql: Object.assign(tag, { raw: f }) };
});
const sqlSeen = vi.hoisted(() => [] as string[]);

vi.mock("./repo", () => ({
  loadParams: async () => ({ settings: {}, ranks: [], thresholds: [] }),
  ensureActiveVersion: async () => ({ id: "v1" }),
}));
vi.mock("./chain", () => ({ resolveChain: () => ({ self: {}, chain: [], skipped: [] }) }));
vi.mock("./engine", () => ({
  splitForModule: () => ({
    lines: [{
      payeeId: "c1", name: "小陳", kind: "advisor", role: "執案", rankCode: "C1",
      promoPct: 0, execPct: 45, bonusPct: 0, totalPct: 45, amount: 27_000, trace: [],
    }],
    balanced: true, warnings: [],
  }),
}));

const Repo = await import("./caseRepo");
type PayoutLine = Parameters<typeof Repo.writePayouts>[1][number];

const CASE = {
  id: "case1", versionId: "v1", fee: 60_000, refundAmount: 0, status: "paid",
  isCompanyLead: false, promoterId: "c1", executorId: "c1", moduleCode: "",
};
const row = (status: string, key = "c1", amount = 27_000) => ({
  id: `p-${key}-${status}`, caseId: "case1", payeeId: key === "company_ops" ? null : key,
  payeeKey: key, payeeName: key, kind: "advisor", role: "執案", rankCode: "C1", amount, status,
});
const LINE = {
  payeeId: "c1", name: "小陳", kind: "advisor", role: "執案", rankCode: "C1",
  promoPct: 0, execPct: 45, bonusPct: 0, totalPct: 45, amount: 27_000, trace: [],
} as const satisfies PayoutLine;
const opsOn = (table: string) => state.ops.filter((o) => o.table === table);

beforeEach(() => {
  state.rows = [];
  state.ops = [];
  state.batches = [];
  state.inBatch = false;
  state.insertThrows = false;
  sqlSeen.length = 0;
});

describe("writePayouts", () => {
  it("已有 paid 列時整句擋下——而且一列都沒被標 void（不能再出現「void 先成功、insert 才炸」）", async () => {
    state.rows = [[row("paid")]];
    await expect(Repo.writePayouts("case1", [])).rejects.toThrow("has-paid-payouts");
    expect(state.ops).toHaveLength(0);
  });

  it("正常重算：void 與 insert 走同一個 db.batch()，不是兩趟往返", async () => {
    const lines = [LINE];
    await Repo.writePayouts("case1", lines, [row("pending")]);
    expect(state.batches).toEqual([2]);
    expect(state.ops.map((o) => o.kind)).toEqual(["update", "insert"]);
    expect(state.ops.every((o) => o.viaBatch)).toBe(true);
    expect(state.ops[0].values[0].status).toBe("void");
    expect(state.ops[1].values[0].payeeKey).toBe("c1");
  });

  it("insert 炸掉時 void 也不生效——舊列不會被標 void 而沒有新列補上", async () => {
    state.insertThrows = true;
    const lines = [LINE];
    await expect(Repo.writePayouts("case1", lines, [row("pending")])).rejects.toThrow();
    expect(state.ops).toHaveLength(0);
  });
});

describe("recalcCase", () => {
  it("已有 paid 列時不重算，也不寫任何東西，並把原因回給呼叫端", async () => {
    state.rows = [[CASE], [row("paid")]];
    const r = await Repo.recalcCase("case1");
    expect(r).toEqual({ recalculated: false, reason: "has-paid" });
    expect(state.ops).toHaveLength(0);
  });

  it("還沒發放時照常重算", async () => {
    state.rows = [[CASE], [row("pending")], []];
    const r = await Repo.recalcCase("case1");
    expect(r.recalculated).toBe(true);
    expect(state.batches).toEqual([2]);
  });
});

describe("refundCase：已發放 → 產生負數沖回列", () => {
  it("案件金額與沖回列同生共死（同一個 db.batch）", async () => {
    state.rows = [[CASE], [row("paid"), row("paid", "company_ops", 6_000)]];
    const out = await Repo.refundCase("case1", 30_000);

    expect(out.mode).toBe("reversal");
    expect(state.batches).toEqual([2]);
    expect(state.ops.every((o) => o.viaBatch)).toBe(true);

    const [upd] = opsOn("comp_cases");
    expect(upd.values[0].refundAmount).toBe(30_000);
    expect(upd.values[0].status).toBe("paid"); // 部分退費不改案件狀態

    const ins = opsOn("comp_payouts")[0].values;
    expect(ins).toHaveLength(2);
    expect(ins.map((v) => v.amount)).toEqual([-13_500, -3_000]);
    expect(ins.every((v) => v.status === "pending")).toBe(true);
    // 百分比一律 0：沖回列不參與「全鏈合計 100%」的驗算。
    expect(ins.every((v) => v.totalPct === 0 && v.promoPct === 0 && v.execPct === 0)).toBe(true);
    // 唯一鍵：payeeKey 與原列不同。
    expect(ins.map((v) => v.payeeKey)).toEqual(["c1:refund:1", "company_ops:refund:1"]);
  });

  it("全額退費：案件標 refunded，沖回金額等於原本發出去的全部", async () => {
    state.rows = [[CASE], [row("paid")]];
    await Repo.refundCase("case1", 60_000);
    expect(opsOn("comp_cases")[0].values[0].status).toBe("refunded");
    expect(opsOn("comp_payouts")[0].values[0].amount).toBe(-27_000);
  });

  it("退費金額往上調時只沖回增量，不會重複沖回已經沖過的部分", async () => {
    // 已退 20,000，現在調到 30,000 → 只沖回 10,000 那一段。
    state.rows = [
      [{ ...CASE, refundAmount: 20_000 }],
      [row("paid"), { ...row("paid"), id: "rev1", payeeKey: "c1:refund:1", amount: -9_000, status: "pending" }],
    ];
    await Repo.refundCase("case1", 30_000);
    const ins = opsOn("comp_payouts")[0].values;
    expect(ins).toHaveLength(1);
    expect(ins[0].amount).toBe(-4_500);          // 27,000 × (10,000/60,000)
    expect(ins[0].payeeKey).toBe("c1:refund:2"); // 序號接續，不撞第一次那列
  });

  it("退費金額沒有往上調時只更新案件，不產生空的沖回列", async () => {
    state.rows = [[{ ...CASE, refundAmount: 30_000 }], [row("paid")]];
    const out = await Repo.refundCase("case1", 30_000);
    expect(out.lines).toEqual([]);
    expect(state.batches).toEqual([]);
    expect(opsOn("comp_payouts")).toHaveLength(0);
    expect(opsOn("comp_cases")).toHaveLength(1);
  });
});

describe("refundCase：還沒發放 → 照舊依實收重算", () => {
  it("沒有 paid 列時走重算路徑，不產生沖回列", async () => {
    state.rows = [
      [{ ...CASE, status: "closed" }], [row("pending")],   // refundCase
      [{ ...CASE, status: "closed", refundAmount: 30_000 }], [row("pending")], [], // recalcCase
    ];
    const out = await Repo.refundCase("case1", 30_000);
    expect(out.mode).toBe("recalc");
    expect(out.lines).toEqual([]);
    const inserted = opsOn("comp_payouts").filter((o) => o.kind === "insert").flatMap((o) => o.values);
    expect(inserted).toHaveLength(1);
    expect(inserted.every((v) => (v.amount as number) >= 0)).toBe(true);
    expect(inserted.every((v) => !String(v.payeeKey).includes(":refund:"))).toBe(true);
  });
});

describe("發放批次", () => {
  it("已退費的案件只擋正數列，負數沖回列必須進得來（否則錢永遠收不回來）", async () => {
    state.rows = [[{ id: "b1", period: "2026-09", payoutDate: null, status: "draft" }], []];
    await Repo.createBatch("2026-09", "2026-09-05");
    expect(sqlSeen.some((s) => s.includes("<> 'refunded'") && s.includes("< 0"))).toBe(true);
  });
});
