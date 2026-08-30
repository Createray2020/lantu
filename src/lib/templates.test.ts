/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 共用示範範本（第四把尺）的邊界測試。
 *
 * 這一題的風險不在「功能做不做得出來」，而在**範本是第四種存取語意**：
 * 跨租戶可見。做錯的樣子不是畫面壞掉，是某位教練默默看到／改到不該碰的東西。
 * 所以這支測試守的是四條線：
 *
 *   1. 範本不進 ownedClient() / readableClient() / usedClientCount()。
 *      而且是「**就算 coach_id 被誤設成某位教練**也一樣」——這正是把排除條件
 *      寫成明文（而不是靠 coach_id=null 剛好選不到）的唯一理由。
 *   2. 管理端四支都自己驗 admin，不相信呼叫端。
 *   3. 複製要先過額度，擋下時**一個字都不寫、也不吃掉客戶編號**。
 *   4. 複製出來的是一位正常客戶（有編號、is_template=false、coach_id＝我），
 *      而範本本身沒有編號。
 *
 * 這裡的 mock 讓 where 條件**真的求值**（同 track.test.ts）：no-op 的 mock
 * 對「查詢有沒有帶排除條件」一律會通過，那等於什麼都沒守。
 */

const h = vi.hoisted(() => {
  const store: any = { clients: [], plans: [], comp_versions: [], comp_ranks: [] };
  const calls: any = { allocCode: 0, inserts: [], updates: [], deletes: [] };

  const camel = (c: string) => c.replace(/_([a-z])/g, (_m: string, x: string) => x.toUpperCase());
  const get = (row: any, col: string) => (row[col] !== undefined ? row[col] : row[camel(col)]);

  const evalCond = (c: any, row: any): boolean => {
    if (!c) return true;
    switch (c.__op) {
      case "and": return c.parts.every((p: any) => evalCond(p, row));
      case "or": return c.parts.some((p: any) => evalCond(p, row));
      // 這些測試裡沒有任何共同執案關係 → readableClient 的 EXISTS 一律 false，
      // 讀取範圍就等於「只有主責」，範本的排除條件照原樣驗得到。
      case "exists": return false;
      case "eq": return get(row, c.col) === c.val;
      case "ne": return get(row, c.col) !== c.val;
      case "inArray": {
        // val 可能是陣列，也可能是一個子查詢（updateTemplatePlan 用它把範圍鎖在
        // 範本底下的 plan）。子查詢就地展開成 id 陣列再比。
        const vals = Array.isArray(c.val)
          ? c.val
          : (c.val?.__rows?.() ?? []).map((r: any) => (typeof r === "object" ? Object.values(r)[0] : r));
        return vals.includes(get(row, c.col));
      }
      default: return true;
    }
  };

  const tableOf = (t: any) => t?.[Symbol.for("drizzle:Name")] ?? t?._n;

  const sortRows = (rows: any[], specs: any[]) =>
    specs.length === 0 ? rows : [...rows].sort((a, b) => {
      for (const s of specs) {
        if (!s?.col) continue;
        const va = get(a, s.col) ?? 0, vb = get(b, s.col) ?? 0;
        const d = va < vb ? -1 : va > vb ? 1 : 0;
        if (d) return s.dir === "desc" ? -d : d;
      }
      return 0;
    });

  const project = (rows: any[], proj: any) => {
    if (!proj) return rows;
    // 聚合（count()）：整批只回一列。
    if (Object.values<any>(proj).some((v) => v?.__agg)) {
      const out: any = {};
      for (const [k, v] of Object.entries<any>(proj)) out[k] = v?.__agg ? rows.length : undefined;
      return [out];
    }
    return rows.map((r) => {
      const out: any = {};
      for (const [k, v] of Object.entries<any>(proj)) {
        if (v && typeof v === "object" && !("name" in v)) out[k] = r;   // 整張表（join 形狀）
        else out[k] = get(r, v?.name ?? k);
      }
      return out;
    });
  };

  const db = {
    select: (proj?: any) => ({
      from: (t: any) => {
        let cond: any = null;
        let order: any[] = [];
        const rows = () => project(sortRows((store[tableOf(t)] ?? []).filter((r: any) => evalCond(cond, r)), order), proj);
        const c: any = {
          where: (x: any) => { cond = x; return c; },
          orderBy: (...s: any[]) => { order = s; return c; },
          innerJoin: () => c,
          leftJoin: () => c,
          limit: (n: number) => Promise.resolve(rows().slice(0, n)),
          then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
          // 子查詢（inArray(col, db.select()…)）要能被同步展開才驗得到範圍條件。
          __rows: rows,
        };
        return c;
      },
    }),
    // 寫入在呼叫當下就落到 store 並記錄（同 consultSessionSplit.test.ts 的假 db）：
    // 這些測試問的是「有沒有寫」與「寫了什麼」，不是交易的時序。
    insert: (t: any) => ({
      values: (v: any) => {
        const vals = Array.isArray(v) ? v : [v];
        calls.inserts.push({ table: tableOf(t), values: vals });
        (store[tableOf(t)] ??= []).push(...vals.map((x: any) => ({ ...x })));
        const c: any = { _run: () => [{ id: "new" }], returning: () => Promise.resolve([{ id: vals[0]?.id ?? "new" }]) };
        c.then = (res: any, rej: any) => Promise.resolve([{ id: "new" }]).then(res, rej);
        return c;
      },
    }),
    update: (t: any) => ({
      set: (v: any) => ({
        where: (cond: any) => {
          const hit = (store[tableOf(t)] ?? []).filter((r: any) => evalCond(cond, r));
          calls.updates.push({ table: tableOf(t), values: v, matched: hit.length });
          for (const r of hit) Object.assign(r, v);
          const c: any = { _run: () => hit };
          c.then = (res: any, rej: any) => Promise.resolve(hit).then(res, rej);
          return c;
        },
      }),
    }),
    delete: (t: any) => ({
      where: (cond: any) => {
        const table = tableOf(t);
        const hit = (store[table] ?? []).filter((r: any) => evalCond(cond, r));
        calls.deletes.push({ table, matched: hit.length });
        store[table] = (store[table] ?? []).filter((r: any) => !hit.includes(r));
        const c: any = { _run: () => hit };
        c.then = (res: any, rej: any) => Promise.resolve(hit).then(res, rej);
        return c;
      },
    }),
    batch: (items: any[]) => Promise.resolve(items.map((i) => i._run?.() ?? [])),
  };

  return { store, calls, db };
});

vi.mock("drizzle-orm", () => ({
  and: (...parts: any[]) => ({ __op: "and", parts: parts.filter(Boolean) }),
  or: (...parts: any[]) => ({ __op: "or", parts: parts.filter(Boolean) }),
  exists: () => ({ __op: "exists" }),
  eq: (col: any, val: any) => ({ __op: "eq", col: col?.name, val }),
  ne: (col: any, val: any) => ({ __op: "ne", col: col?.name, val }),
  inArray: (col: any, val: any) => ({ __op: "inArray", col: col?.name, val }),
  asc: (c: any) => ({ col: c?.name, dir: "asc" }),
  desc: (c: any) => ({ col: c?.name, dir: "desc" }),
  count: () => ({ __agg: true }),
  sql: Object.assign(() => ({ __sql: true }), { raw: () => ({ __sql: true }) }),
}));

vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("./snapshot", () => ({
  newCaseData: () => ({ profile: { name: "空白" } }),
  planSnapshot: () => ({ healthGrade: "B", netWorth: 0 }),
}));
// 發號是唯一「不在 batch 裡、而且會消耗流水號」的寫入 —— 數它被呼叫幾次。
vi.mock("./codeAlloc", () => ({
  allocCode: async () => { h.calls.allocCode += 1; return `260800${h.calls.allocCode}`; },
}));

const ME = "coach-me";
const state: any = { me: null, admin: false };
vi.mock("./coach", () => ({
  ensureCoach: async () => state.me,
  isAdmin: async (c: any) => !!c && c.status === "active" && state.admin,
}));

const T1 = "tpl-1";
const T2 = "tpl-2";
const MINE = "client-mine";

/** 一列範本：coach_id / client_user_id 都是 null、code 也是 null。 */
const template = (id: string, over: any = {}) => ({
  id, coachId: null, clientUserId: null, isTemplate: true, code: null,
  name: "雙薪育兒家庭", templateLabel: "雙薪育兒", templateOrder: 0,
  lifeStage: "育兒", birthDate: "1988-05-05", tags: ["示範"], contact: {},
  source: null, status: "active", createdAt: new Date("2026-08-01"), updatedAt: new Date("2026-08-01"),
  ...over,
});

const plan = (id: string, clientId: string, over: any = {}) => ({
  id, clientId, year: 2026, track: "coach", label: "2026 示範版", status: "active",
  basedOnDate: "2026-08-01", healthGrade: "A", netWorth: 8_000_000,
  data: { profile: { name: "示範" }, assets: [{ v: 1 }] },
  createdAt: new Date("2026-08-01"), updatedAt: new Date("2026-08-01"), ...over,
});

function seed() {
  h.calls.allocCode = 0; h.calls.inserts = []; h.calls.updates = []; h.calls.deletes = [];
  state.me = { id: ME, status: "active", rankCode: null, clientCapOverride: null };
  state.admin = false;
  h.store.comp_versions = [];
  h.store.comp_ranks = [];
  h.store.clients = [
    { id: MINE, coachId: ME, clientUserId: null, isTemplate: false, code: "2608001", name: "王大明", status: "active", tags: [], contact: {}, lifeStage: "新婚", birthDate: null, templateLabel: null, templateOrder: 0, createdAt: new Date("2026-08-02"), updatedAt: new Date("2026-08-02") },
    template(T1, { templateOrder: 1, name: "退休前十年", templateLabel: "退休前", updatedAt: new Date("2026-08-03") }),
    template(T2, { templateOrder: 0 }),
  ];
  h.store.plans = [plan("p-mine", MINE, { healthGrade: "C", netWorth: 1_000_000 }), plan("p-t1", T1), plan("p-t2", T2)];
}

beforeEach(() => { vi.resetModules(); seed(); });

describe("⚠️ 範本不進兩把舊尺（就算 coach_id 被誤設成某位教練）", () => {
  /**
   * 這一組是整題的支點。
   * 範本的 coach_id 本來是 null，所以「不會被 eq(coachId, me) 選中」是**剛好安全**。
   * 這裡刻意把一列範本的 coach_id 設成 ME —— 最可能的來源是「把既有客戶轉成範本」
   * 時忘了清 coach_id —— 然後驗四件事：他讀不到、寫不到、看不到、也不佔他的額度。
   */
  function misassign() {
    h.store.clients.find((c: any) => c.id === T1).coachId = ME;
  }

  it("列表看不到（誤設 coach_id 的範本不會混進客戶清單）", async () => {
    misassign();
    const { listClientsForCoach } = await import("./clients");
    const rows = await listClientsForCoach(ME);
    expect(rows.map((r) => r.id)).toEqual([MINE]);
  });

  it("getClient（寫入用）與 getClientForRead（讀取用）都拿不到", async () => {
    misassign();
    const { getClient, getClientForRead } = await import("./clients");
    expect(await getClient(ME, T1)).toBeNull();
    expect(await getClientForRead(ME, T1)).toBeNull();
    // 自己真正的客戶不受影響（排除條件不能連正常客戶一起擋掉）
    expect(await getClient(ME, MINE)).not.toBeNull();
  });

  it("⚠️ 改不動：updateClient 直接 forbidden，範本一個欄位都沒被寫到", async () => {
    misassign();
    const { updateClient } = await import("./clients");
    await expect(updateClient(ME, T1, { name: "被改壞的展示" })).rejects.toThrow("forbidden");
    expect(h.calls.updates).toEqual([]);
    expect(h.store.clients.find((c: any) => c.id === T1).name).toBe("退休前十年");
  });

  it("⚠️ 不佔額度：usedClientCount 不算範本", async () => {
    misassign();
    const { usedClientCount } = await import("./quota");
    expect(await usedClientCount(ME)).toBe(1); // 只有 MINE
  });

  it("封存的客戶照舊不算（原本的規則沒有被新條件弄壞）", async () => {
    h.store.clients.push({ id: "old", coachId: ME, isTemplate: false, status: "archived", name: "舊客戶" });
    const { usedClientCount } = await import("./quota");
    expect(await usedClientCount(ME)).toBe(1);
  });
});

describe("讀取端：全體教練看到同一份，而且明確唯讀", () => {
  it("listTemplates 依 templateOrder 排，並帶最新一份規劃的摘要", async () => {
    const { listTemplates } = await import("./templates");
    const rows = await listTemplates();
    expect(rows.map((r) => r.id)).toEqual([T2, T1]); // order 0 在前
    expect(rows[0]).toMatchObject({ templateLabel: "雙薪育兒", lifeStage: "育兒", healthGrade: "A", netWorth: 8_000_000 });
    // 一般客戶不會混進來
    expect(rows.some((r) => r.id === MINE)).toBe(false);
  });

  // ── 下架＝可回復的隱藏（2026/08/30 Ray 拍板）─────────────────────
  it("下架之後教練端的清單就看不到它了", async () => {
    const { setTemplateArchived, listTemplates } = await import("./templates");
    state.admin = true;
    await setTemplateArchived(T1, true);
    expect((await listTemplates()).map((r) => r.id), "已下架的還留在教練端清單上").toEqual([T2]);
  });

  it("後台帶 includeArchived 才看得到已下架的（不然沒有路徑可以重新上架）", async () => {
    const { setTemplateArchived, listTemplates } = await import("./templates");
    state.admin = true;
    await setTemplateArchived(T1, true);
    const all = await listTemplates({ includeArchived: true });
    expect(all.map((r) => r.id)).toEqual([T2, T1]);
    expect(all.find((r) => r.id === T1)?.status).toBe("archived");
  });

  it("重新上架就回來了——內容一個字都沒少（沒有任何 delete）", async () => {
    const { setTemplateArchived, listTemplates } = await import("./templates");
    state.admin = true;
    await setTemplateArchived(T1, true);
    await setTemplateArchived(T1, false);
    expect((await listTemplates()).map((r) => r.id)).toEqual([T2, T1]);
    expect(h.calls.deletes, "下架／上架都不該碰 delete").toEqual([]);
    expect(h.store.plans.filter((p: any) => p.clientId === T1)).toHaveLength(1);
  });

  it("⚠️ 永久刪除只准對「已下架」的那一列動手——還在上架的什麼都不會發生", async () => {
    const { purgeTemplate } = await import("./templates");
    state.admin = true;
    await purgeTemplate(T1);                       // T1 還是 active
    expect(h.calls.deletes[0].matched, "上架中的範本被一鍵刪掉了").toBe(0);
    expect(h.store.clients.some((c: any) => c.id === T1)).toBe(true);
  });

  it("先下架、再永久刪除，才真的刪得掉", async () => {
    const { setTemplateArchived, purgeTemplate } = await import("./templates");
    state.admin = true;
    await setTemplateArchived(T1, true);
    await purgeTemplate(T1);
    expect(h.store.clients.some((c: any) => c.id === T1)).toBe(false);
  });

  it("getTemplateForRead 回 readOnly:true 與規劃內容", async () => {
    const { getTemplateForRead } = await import("./templates");
    const t = await getTemplateForRead(T1);
    expect(t?.readOnly).toBe(true);
    expect(t?.client.id).toBe(T1);
    expect(t?.plans.map((p) => p.id)).toEqual(["p-t1"]);
    expect(t?.plans[0].data).toBeTruthy();
  });

  it("⚠️ 範本 API 不能拿來讀一般客戶（拿客戶 id 打進來回 null）", async () => {
    const { getTemplateForRead } = await import("./templates");
    // 否則這把跨租戶的尺就變成「任何教練都讀得到任何一位客戶」。
    expect(await getTemplateForRead(MINE)).toBeNull();
  });
});

describe("管理端：每一支自己驗 admin", () => {
  it("非 admin 呼叫五支都被擋，而且什麼都沒寫", async () => {
    const T = await import("./templates");
    state.admin = false;
    await expect(T.createTemplate({ name: "偷加的" })).rejects.toThrow("forbidden");
    await expect(T.updateTemplate(T1, { name: "偷改的" })).rejects.toThrow("forbidden");
    await expect(T.setTemplateArchived(T1, true)).rejects.toThrow("forbidden");
    await expect(T.purgeTemplate(T1)).rejects.toThrow("forbidden");
    await expect(T.reorderTemplates([T1, T2])).rejects.toThrow("forbidden");
    expect(h.calls.inserts).toEqual([]);
    expect(h.calls.updates).toEqual([]);
    expect(h.calls.deletes).toEqual([]);
    expect(h.store.clients).toHaveLength(3);
  });

  it("沒登入（ensureCoach 回 null）一樣被擋", async () => {
    state.me = null; state.admin = true;
    const { purgeTemplate } = await import("./templates");
    await expect(purgeTemplate(T1)).rejects.toThrow("forbidden");
    expect(h.calls.deletes).toEqual([]);
  });

  it("⚠️ 範本不發客戶編號（allocCode 一次都不會被呼叫），code 留 null", async () => {
    state.admin = true;
    const { createTemplate } = await import("./templates");
    const id = await createTemplate({ name: "首購族", templateLabel: "首購", templateOrder: 3 });
    expect(h.calls.allocCode, "範本發了編號就會吃掉當月流水號，還會印在報告書表頭上").toBe(0);
    const row = h.store.clients.find((c: any) => c.id === id);
    expect(row.code ?? null).toBeNull();
    expect(row).toMatchObject({ isTemplate: true, coachId: null, clientUserId: null, templateLabel: "首購", templateOrder: 3 });
    // 同時建好第一份規劃，否則後台進去是空白頁、沒東西可編輯
    expect(h.calls.inserts.filter((i: any) => i.table === "plans")).toHaveLength(1);
  });

  it("管理端寫入帶著 is_template 護欄：拿一般客戶的 id 打進來改不到／刪不掉", async () => {
    state.admin = true;
    const { updateTemplate, setTemplateArchived, purgeTemplate } = await import("./templates");
    await updateTemplate(MINE, { name: "被範本 API 改掉的真客戶" });
    expect(h.calls.updates[0].matched, "範本 API 改到了一位真實客戶").toBe(0);
    await setTemplateArchived(MINE, true);
    expect(h.calls.updates[1].matched, "範本 API 封存了一位真實客戶").toBe(0);
    await purgeTemplate(MINE);
    expect(h.calls.deletes[0].matched, "範本 API 刪掉了一位真實客戶連同他的規劃").toBe(0);
    expect(h.store.clients.find((c: any) => c.id === MINE).name).toBe("王大明");
  });

  it("reorderTemplates 依序寫回 templateOrder", async () => {
    state.admin = true;
    const { reorderTemplates, listTemplates } = await import("./templates");
    await reorderTemplates([T1, T2]);
    expect((await listTemplates()).map((r) => r.id)).toEqual([T1, T2]);
  });
});

describe("複製成自己的客戶", () => {
  it("⚠️ 額度滿：擋下、回 {ok:false}，而且不留半成品（連編號都沒發）", async () => {
    // 上限 1 位，名下已經有 1 位正常客戶 → 滿。
    state.me.clientCapOverride = 1;
    const { copyTemplateToCoach } = await import("./templates");
    const r = await copyTemplateToCoach(ME, T1);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/上限/);
    expect(h.calls.inserts, "額度擋下時不該有任何寫入").toEqual([]);
    expect(h.calls.allocCode, "額度擋下卻發了號＝客戶編號從此跳號，事後查不出來").toBe(0);
    expect(h.store.clients).toHaveLength(3);
  });

  it("⚠️ 範本不佔額度：上限 2、名下 1 位＋兩份範本，仍然複製得出來", async () => {
    state.me.clientCapOverride = 2;
    const { copyTemplateToCoach } = await import("./templates");
    // 兩份範本若被算進 usedClientCount，這裡就會是 3/2 ＝ 滿。
    const r = await copyTemplateToCoach(ME, T1);
    expect(r.ok).toBe(true);
  });

  it("複製出來的是一位正常客戶：有編號、is_template=false、coach_id＝我", async () => {
    const { copyTemplateToCoach } = await import("./templates");
    const r = await copyTemplateToCoach(ME, T1);
    expect(r.ok).toBe(true);
    const row = h.store.clients.find((c: any) => c.id === (r as any).clientId);
    expect(row).toMatchObject({ coachId: ME, isTemplate: false, templateLabel: null, clientUserId: null });
    expect(row.code, "複製出來的是真客戶，一定要有編號").toBeTruthy();
    expect(h.calls.allocCode).toBe(1);
    // 看得出來源：名稱與 tags 都標記
    expect(row.name).toBe("退休前十年（範本複製）");
    expect(row.tags).toContain("範本複製");
  });

  it("規劃逐份複製，而且是深拷貝（不會跟範本共用同一個物件）", async () => {
    const { copyTemplateToCoach } = await import("./templates");
    const r = await copyTemplateToCoach(ME, T1);
    const copied = h.calls.inserts.find((i: any) => i.table === "plans").values;
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ clientId: (r as any).clientId, year: 2026, track: "coach", healthGrade: "A", netWorth: 8_000_000 });
    const src = h.store.plans.find((p: any) => p.id === "p-t1");
    expect(copied[0].data).toEqual(src.data);
    expect(copied[0].data).not.toBe(src.data);
    (copied[0].data as any).assets[0].v = 999;
    expect(src.data.assets[0].v, "改複製出來的那份不可以動到範本").toBe(1);
  });

  it("複製出來的客戶從此只受第一把尺管轄（讀得到、也算進額度）", async () => {
    const { copyTemplateToCoach } = await import("./templates");
    const r = await copyTemplateToCoach(ME, T1);
    const { getClient } = await import("./clients");
    const { usedClientCount } = await import("./quota");
    expect(await getClient(ME, (r as any).clientId)).not.toBeNull();
    expect(await usedClientCount(ME)).toBe(2);
  });

  it("範本不存在／已下架 → {ok:false}，不是丟例外", async () => {
    const { copyTemplateToCoach } = await import("./templates");
    const r = await copyTemplateToCoach(ME, "no-such-template");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("找不到") });
    expect(h.calls.allocCode).toBe(0);
  });

  it("⚠️ 一般客戶的 id 不能當範本複製（否則等於跨教練偷客戶）", async () => {
    const { copyTemplateToCoach } = await import("./templates");
    const r = await copyTemplateToCoach(ME, MINE);
    expect(r.ok).toBe(false);
    expect(h.calls.inserts).toEqual([]);
  });

  it("只能複製給自己：coachId 不是登入者本人時擋下", async () => {
    const { copyTemplateToCoach } = await import("./templates");
    const r = await copyTemplateToCoach("coach-other", T1);
    expect(r.ok).toBe(false);
    expect(h.calls.inserts).toEqual([]);
  });

  it("停權中的教練複製不了", async () => {
    state.me.status = "suspended";
    const { copyTemplateToCoach } = await import("./templates");
    expect((await copyTemplateToCoach(ME, T1)).ok).toBe(false);
  });
});

// ── 後台填內容的兩支（updateTemplatePlan / addTemplatePlan）──────────────
// 這兩支是「後台建了範本卻沒路徑填內容」那個缺口的補丁。它們是唯二能寫到
// 範本 plans 的路徑，所以邊界要跟其他管理端函式一樣硬。
describe("後台填範本內容", () => {
  it("非 admin 一律擋下，而且一個欄位都沒被寫到", async () => {
    state.admin = false;
    const T = await import("./templates");
    await expect(T.updateTemplatePlan("p-t1", { profile: { name: "x" } })).rejects.toThrow("forbidden");
    await expect(T.addTemplatePlan(T1, 2026)).rejects.toThrow("forbidden");
    expect(h.calls.updates).toEqual([]);
    expect(h.calls.inserts).toEqual([]);
  });

  it("updateTemplatePlan 的 WHERE 必須把範圍鎖在範本底下的 plan", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/templates.ts", "utf8");
    const body = src.slice(src.indexOf("export async function updateTemplatePlan"));
    const fn = body.slice(0, body.indexOf("\n}\n") + 2);
    // 拿一般客戶的 planId 打進來時什麼都改不到——這是這支函式最重要的一行。
    // ⚠️ 這裡刻意驗「逐字寫 is_template」而不是「呼叫第四把尺」：那把尺是跨租戶的
    //    可見範圍，clientScope.drift.test.ts 要求它一次都不准出現在寫入路徑上。
    expect(fn).toContain("eq(clients.isTemplate, true)");
    expect(fn).toContain("inArray(");
    expect(fn).toContain("assertAdmin()");
  });

  it("data 不是物件就擋下，不會只更新快照", async () => {
    state.admin = true;
    const T = await import("./templates");
    for (const bad of [null, undefined, "x", 42, [1, 2]]) {
      await expect(T.updateTemplatePlan("p-t1", bad)).rejects.toThrow("bad-plan-data");
    }
    expect(h.calls.updates).toEqual([]);
  });

  it("內容與快照一起寫，而且不碰 plan_revisions（範本沒有歷史版本的語意）", async () => {
    state.admin = true;
    const T = await import("./templates");
    await T.updateTemplatePlan("p-t1", { profile: { name: "示範", age: 40 } });
    expect(h.calls.updates.length).toBe(1);
    const set = h.calls.updates[0].values;
    expect("healthGrade" in set).toBe(true);
    expect("netWorth" in set).toBe(true);
    expect(h.calls.inserts.filter((i: any) => i.table === "plan_revisions")).toEqual([]);
  });

  it("addTemplatePlan 拿一般客戶的 id 進來會找不到範本，不會替他長出一份規劃", async () => {
    state.admin = true;
    const T = await import("./templates");
    await expect(T.addTemplatePlan(MINE, 2026)).rejects.toThrow("template-not-found");
    expect(h.calls.inserts).toEqual([]);
  });
});
