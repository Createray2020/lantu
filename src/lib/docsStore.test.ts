/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 簽署引擎的資料層：啟動冪等、順序簽署、全員簽完才鎖 final hash、拒簽、作廢後可重啟。
 * 用一個會真的照 where 過濾的記憶體 db（eq/and/or/ne/inArray），不是只錄 updates。
 */
const h = vi.hoisted(() => {
  const col = (table: string) => new Proxy({ _n: table } as any, { get: (t, p) => (p === "_n" ? t._n : typeof p === "string" ? { name: p, table } : undefined) });
  const T: any = {
    docTemplates: col("doc_templates"),
    docSets: col("doc_sets"),
    docInstances: col("doc_instances"),
    docSigners: col("doc_signers"),
    signatures: col("signatures"),
    siteSettings: col("site_settings"),
    docTasks: col("doc_tasks"),
    coaches: col("coaches"),
    coachDisplayName: { name: "name" },
  };
  const state: Record<string, any[]> = {};
  const reset = () => { for (const k of ["doc_templates", "doc_sets", "doc_instances", "doc_signers", "signatures", "site_settings", "doc_tasks", "coaches"]) state[k] = []; };
  reset();
  const test = (p: any, row: any): boolean => {
    if (!p) return true;
    switch (p.op) {
      case "eq": return row[p.col] === p.val;
      case "ne": return row[p.col] !== p.val;
      case "in": return p.vals.includes(row[p.col]);
      case "and": return p.xs.every((x: any) => test(x, row));
      case "or": return p.xs.some((x: any) => test(x, row));
      case "false": return false;
      default: return true;
    }
  };
  const UNIQUE: Record<string, string[]> = { doc_instances: ["caseType", "caseId", "templateKey"], signatures: ["ownerKind", "ownerId"], site_settings: ["key"], doc_sets: ["kind", "ref"] };
  const conflictOf = (table: string, v: any) => {
    const u = UNIQUE[table];
    if (!u) return null;
    return state[table].find((r) => u.every((k) => r[k] === v[k]) && (table !== "doc_instances" || r.status !== "void")) ?? null;
  };
  const defaults = (table: string, v: any) => ({
    id: crypto.randomUUID(),
    ...(table === "doc_templates" ? { enabled: true, version: 1, required: true, useSeal: true, signDays: null, note: "" } : {}),
    ...(table === "doc_instances" ? { status: "pending", required: true, finalHash: null, completedAt: null, expiresAt: null, signedHtml: null } : {}),
    ...(table === "doc_signers" ? { status: "pending", consentAt: null, signatureImg: null, signedAt: null, hashAtSign: null, label: "", displayName: "", remindCount: 0, lastRemindedAt: null } : {}),
    ...(table === "doc_tasks" ? { deadline: null, note: "" } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...v,
  });
  const db: any = {
    select: (fields?: any) => ({
      from: (t: any) => {
        let pred: any = null;
        let order: any[] = [];
        const rows = () => {
          const out = state[t._n].filter((r) => test(pred, r));
          for (const o of [...order].reverse()) out.sort((a, b) => (a[o.name] < b[o.name] ? -1 : a[o.name] > b[o.name] ? 1 : 0) * (o.dir === "desc" ? -1 : 1));
          return fields ? out.map((r) => Object.fromEntries(Object.entries(fields).map(([k, c]: any) => [k, r[c.name]]))) : out.map((r) => ({ ...r }));
        };
        const c: any = {
          where: (p: any) => { pred = p; return c; },
          orderBy: (...os: any[]) => { order = os; return c; },
          limit: (n: number) => Promise.resolve(rows().slice(0, n)),
          then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
        };
        return c;
      },
    }),
    insert: (t: any) => ({
      values: (v: any) => {
        const list = Array.isArray(v) ? v : [v];
        let mode: "throw" | "nothing" | { set: any } = "throw";
        const run = () => {
          const out: any[] = [];
          for (const x of list) {
            const hit = conflictOf(t._n, x);
            if (hit) {
              if (mode === "throw") throw new Error("unique violation " + t._n);
              if (mode === "nothing") continue;
              Object.assign(hit, mode.set);
              out.push(hit);
              continue;
            }
            const row = defaults(t._n, x);
            state[t._n].push(row);
            out.push({ ...row });
          }
          return out;
        };
        const c: any = {
          onConflictDoNothing: () => { mode = "nothing"; return c; },
          onConflictDoUpdate: ({ set }: any) => { mode = { set }; return c; },
          returning: () => Promise.resolve(run()),
          then: (res: any, rej: any) => Promise.resolve().then(run).then(res, rej),
        };
        return c;
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        let pred: any = null;
        const run = () => {
          const hit = state[t._n].filter((r) => test(pred, r));
          hit.forEach((r) => { for (const [k, x] of Object.entries(v)) r[k] = x && typeof x === "object" && (x as any).op === "inc" ? (r[k] ?? 0) + 1 : x; });
          return hit.map((r) => ({ ...r }));
        };
        const c: any = { where: (p: any) => { pred = p; return c; }, returning: () => Promise.resolve(run()), then: (res: any, rej: any) => Promise.resolve().then(run).then(res, rej) };
        return c;
      },
    }),
    delete: (t: any) => ({ where: (p: any) => { state[t._n] = state[t._n].filter((r) => !test(p, r)); return Promise.resolve(); } }),
    batch: (xs: any[]) => Promise.all(xs),
  };
  return { T, state, db, reset };
});

vi.mock("drizzle-orm", () => ({
  eq: (c: any, val: any) => ({ op: "eq", col: c.name, val }),
  ne: (c: any, val: any) => ({ op: "ne", col: c.name, val }),
  inArray: (c: any, vals: any[]) => ({ op: "in", col: c.name, vals }),
  and: (...xs: any[]) => ({ op: "and", xs }),
  or: (...xs: any[]) => ({ op: "or", xs }),
  asc: (x: any) => ({ name: x.name, dir: "asc" }),
  desc: (x: any) => ({ name: x.name, dir: "desc" }),
  // sweepExpired 的日期比較在記憶體 db 裡一律不成立（不讓測試裡的待簽被掃成逾期）；remind_count + 1 走 inc。
  sql: (strs: TemplateStringsArray) => { const t = String(strs.join("")); return t.includes("+") ? { op: "inc" } : t.includes("<") || t.includes("is not null") ? { op: "false" } : { op: "true" }; },
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: any) => fn, updateTag: () => {} }));
vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => h.T);

import { startSigning, consentAndSign, declineSign, voidInstance, saveTemplate, saveSet, listMyInstances, countMyPending, caseProgress, getInstance, saveSignature, getSignature, latestEnabledTemplate, setTemplateEnabled, remindInstance, reopenInstance, listDocTodos, createDocTask, listDocTasks, hasReminderFor } from "./docsStore";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const S = h.state;

beforeEach(() => h.reset());

async function seedTraining() {
  const t = await saveTemplate({ category: "training", name: "實習教練合作約定書", html: "<h1>{{title}}</h1><p>甲方 {{member.name}}</p>{{sign:member:1}}{{sign:company:2}}", signers: [{ role: "member", seq: 1, label: "申請人" }, { role: "company", seq: 2 }], signDays: 14 }, "admin");
  const t2 = await saveTemplate({ category: "training", name: "保密同意書", html: "<p>保密</p>", signers: [{ role: "member", seq: 1 }], required: false }, "admin");
  await saveSet("training_item", "item-train", [t.key, t2.key]);
  return { t, t2 };
}
const ctx = { member: { coachId: "u1", name: "小美" }, company: { coachId: "boss", name: "Ray" } };
const start = () => startSigning({ caseType: "training", caseId: "enr-1", setKind: "training_item", setRef: "item-train", vars: { title: "合作約定", "member.name": "小美" }, ctx, createdBy: "admin" });

describe("範本版本化", () => {
  it("同 key 再存＝新版本，舊版列不動；latestEnabled 拿最新啟用版", async () => {
    const v1 = await saveTemplate({ category: "training", name: "A", html: "v1 {{sign:member:1}}", signers: [{ role: "member", seq: 1 }] }, null);
    const v2 = await saveTemplate({ key: v1.key, category: "training", name: "A", html: "v2 {{sign:member:1}}", signers: [{ role: "member", seq: 1 }] }, null);
    expect(v2.version).toBe(2);
    expect(S.doc_templates).toHaveLength(2);
    expect((await latestEnabledTemplate(v1.key))?.html).toContain("v2");
    await setTemplateEnabled(v2.id, false);
    expect((await latestEnabledTemplate(v1.key))?.html).toContain("v1");
  });
  it("壞範本存不進去", async () => {
    await expect(saveTemplate({ category: "training", name: "", html: "", signers: [] }, null)).rejects.toThrow();
  });
});

describe("啟動簽署", () => {
  it("依組合產實例與簽署人、帶變數、算雜湊、設期限；再按一次不重產", async () => {
    await seedTraining();
    const r1 = await start();
    expect(r1.ok && r1.created).toBe(2);
    expect(S.doc_instances).toHaveLength(2);
    expect(S.doc_signers).toHaveLength(3);
    const main = S.doc_instances.find((i) => i.title === "實習教練合作約定書")!;
    expect(main.htmlSnapshot).toContain("甲方 小美");
    expect(main.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(main.expiresAt).toBeTruthy();
    const r2 = await start();
    expect(r2.ok && r2.created).toBe(0);
    expect(S.doc_instances).toHaveLength(2);
  });
  it("缺簽署人（公司代表沒指定）→ 擋下，一份都不產", async () => {
    await seedTraining();
    const r = await startSigning({ caseType: "training", caseId: "enr-1", setKind: "training_item", setRef: "item-train", vars: {}, ctx: { member: ctx.member }, createdBy: null });
    expect(r.ok).toBe(false);
    expect(S.doc_instances).toHaveLength(0);
  });
  it("組合是空的 → noTemplates（呼叫端可直接開通）", async () => {
    const r = await start();
    expect(r.ok && r.noTemplates).toBe(true);
  });
});

describe("簽署流程", () => {
  it("順序：公司代表還沒輪到；申請人簽完→公司簽→completed、簽名貼進快照、final hash", async () => {
    await seedTraining();
    await start();
    const main = S.doc_instances.find((i) => i.title === "實習教練合作約定書")!;
    const base = { instanceId: main.id, consent: true, signatureImg: PNG, hashSeen: main.hash, saveAsDefault: false, ip: "1.2.3.4", ua: "test" };

    const early = await consentAndSign({ ...base, me: { coachId: "boss" } });
    expect(early.ok).toBe(false);
    expect(!early.ok && early.error).toContain("還沒輪到");

    const noConsent = await consentAndSign({ ...base, me: { coachId: "u1" }, consent: false });
    expect(noConsent.ok).toBe(false);

    const stale = await consentAndSign({ ...base, me: { coachId: "u1" }, hashSeen: "deadbeef" });
    expect(stale.ok).toBe(false);

    const s1 = await consentAndSign({ ...base, me: { coachId: "u1" }, saveAsDefault: true });
    expect(s1.ok && s1.completed).toBe(false);
    expect(await getSignature({ kind: "coach", id: "u1" })).toBe(PNG);
    expect(await countMyPending({ coachId: "boss" })).toBe(1);

    const again = await consentAndSign({ ...base, me: { coachId: "u1" } });
    expect(!again.ok && again.error).toContain("已經簽過");

    const s2 = await consentAndSign({ ...base, me: { coachId: "boss" } });
    expect(s2.ok && s2.completed).toBe(true);
    const done = (await getInstance(main.id))!;
    expect(done.status).toBe("completed");
    expect(done.finalHash).toBeTruthy();
    expect(done.finalHash).not.toBe(done.hash);
    // 原始快照不動（hash／hash_at_sign 對得回來）；簽名貼在 signedHtml
    expect(done.htmlSnapshot).not.toContain("sign-img");
    expect(done.signedHtml).toContain('data-slot="member:1"><img class="sign-img"');
    expect(done.signedHtml).toContain("Ray　");
    expect(await voidInstance(main.id, "x")).toMatchObject({ ok: false }); // 已完成不能作廢
    expect(done.signers.every((s) => s.status === "signed" && s.hashAtSign === main.hash)).toBe(true);
  });

  it("非簽署人不能簽", async () => {
    await seedTraining();
    await start();
    const r = await consentAndSign({ instanceId: S.doc_instances[0].id, me: { coachId: "stranger" }, consent: true, signatureImg: PNG, hashSeen: S.doc_instances[0].hash, saveAsDefault: false, ip: null, ua: null });
    expect(!r.ok && r.error).toContain("不是這份文件的簽署人");
  });

  it("拒簽 → declined；作廢後可重新啟動產新一份", async () => {
    await seedTraining();
    await start();
    const main = S.doc_instances.find((i) => i.title === "實習教練合作約定書")!;
    const d = await declineSign(main.id, { coachId: "u1" }, "條款有誤");
    expect(d.ok).toBe(true);
    expect((await getInstance(main.id))!.status).toBe("declined");
    expect(caseProgress(S.doc_instances).anyDeclined).toBe(true);
    const blocked = await start();
    expect(blocked.ok && blocked.created).toBe(0); // declined 仍占著 key，不會默默重產
    await voidInstance(main.id, "重擬");
    const re = await start();
    expect(re.ok && re.created).toBe(1);
    expect(S.doc_instances.filter((i) => i.title === "實習教練合作約定書")).toHaveLength(2);
  });

  it("caseProgress 只看必簽；我的文件清單不含 void", async () => {
    await seedTraining();
    await start();
    const main = S.doc_instances.find((i) => i.title === "實習教練合作約定書")!;
    const opt = S.doc_instances.find((i) => i.title === "保密同意書")!;
    await voidInstance(opt.id, "x"); // 選簽的那份作廢（待簽狀態可以作廢）
    expect(caseProgress(S.doc_instances)).toMatchObject({ required: 1, done: 0, allDone: false });
    main.status = "completed";
    expect(caseProgress(S.doc_instances).allDone).toBe(true);
    expect((await listMyInstances({ coachId: "u1" })).map((i) => i.title)).toEqual(["實習教練合作約定書"]);
  });
});

describe("簽名檔", () => {
  it("存、覆蓋、壞圖擋下", async () => {
    await saveSignature({ kind: "client_user", id: "cu1" }, PNG);
    await saveSignature({ kind: "client_user", id: "cu1" }, PNG);
    expect(S.signatures).toHaveLength(1);
    await expect(saveSignature({ kind: "coach", id: "c" }, "data:image/jpeg;base64,xx")).rejects.toThrow();
  });
});

describe("催簽、延長、待辦", () => {
  it("教練催客戶：記一次、一天內不重複；被催的那一位 hasReminderFor＝true", async () => {
    await seedTraining();
    await start();
    const main = S.doc_instances.find((i) => i.title === "實習教練合作約定書")!;
    // 現在輪到 u1（成員）；公司代表 boss 來催
    const r1 = await remindInstance(main.id, { coachId: "boss" });
    expect(r1.ok).toBe(true);
    expect(r1.reminded).toEqual(["小美"]);
    const r2 = await remindInstance(main.id, { coachId: "boss" });
    expect(!r2.ok && r2.error).toContain("今天已經");
    expect(await hasReminderFor({ coachId: "u1" })).toBe(true);
    expect(await hasReminderFor({ coachId: "boss" })).toBe(false);
    // 輪到自己的人不能催別人
    const r3 = await remindInstance(main.id, { coachId: "u1" });
    expect(r3.ok).toBe(false);
    // 外人不能催
    expect((await remindInstance(main.id, { coachId: "stranger" })).ok).toBe(false);
  });

  it("逾期→延長回待簽；待簽太久進待辦（依 nudgeDays）；拒簽進待辦", async () => {
    await seedTraining();
    await start();
    const main = S.doc_instances.find((i) => i.title === "實習教練合作約定書")!;
    main.status = "expired";
    const re = await reopenInstance(main.id, 10, { coachId: "boss" });
    expect(re.ok && re.expiresAt).toBeTruthy();
    expect(S.doc_instances.find((i) => i.id === main.id)!.status).toBe("pending");
    // 剛建立：不算卡住
    expect((await listDocTodos()).length).toBe(0);
    // 建立時間倒退 8 天 → stale（預設 7 天）
    main.createdAt = new Date(Date.now() - 8 * 86_400_000);
    const todos = await listDocTodos();
    expect(todos.map((t) => t.kind)).toEqual(["stale"]);
    expect(todos[0].waitingOn).toBe("小美");
    // 只看某位教練身上的
    expect((await listDocTodos({ coachId: "stranger" })).length).toBe(0);
    expect((await listDocTodos({ coachId: "u1" })).length).toBe(1);
    // 拒簽
    await declineSign(main.id, { coachId: "u1" }, "x");
    expect((await listDocTodos()).map((t) => t.kind)).toEqual(["declined"]);
  });
});

describe("補簽任務", () => {
  it("一份範本×一批教練：各產一份 coach_doc 實例、簽署人＝本人；進度表算得出完成數；不碰任何權限", async () => {
    S.coaches.push({ id: "a1", name: "阿一", email: "a@x", code: "FC1", status: "active" }, { id: "a2", name: "阿二", email: null, code: null, status: "active" }, { id: "boss", name: "Ray", email: null, code: null, status: "active" });
    const t = await saveTemplate({ category: "training", name: "保密同意書 v2", html: "<p>{{member.name}} 保密</p>{{sign:member:1}}", signers: [{ role: "member", seq: 1 }] }, "boss");
    const r = await createDocTask({ templateKey: t.key, coachIds: ["a1", "a2"], deadline: "2026-12-31" }, "boss");
    expect(r.ok && r.created).toBe(2);
    const insts = S.doc_instances.filter((i) => i.caseType === "coach_doc");
    expect(insts).toHaveLength(2);
    expect(insts[0].htmlSnapshot).toContain("阿一 保密");
    expect(insts.every((i) => i.expiresAt === "2026-12-31")).toBe(true);
    expect(await countMyPending({ coachId: "a1" })).toBe(1);
    // 阿一簽完
    const mine = insts.find((i) => i.htmlSnapshot.includes("阿一"))!;
    const s1 = await consentAndSign({ instanceId: mine.id, me: { coachId: "a1" }, consent: true, signatureImg: PNG, hashSeen: mine.hash, saveAsDefault: false, ip: null, ua: null });
    expect(s1.ok && s1.completed).toBe(true);
    const tasks = await listDocTasks();
    expect(tasks[0]).toMatchObject({ total: 2, done: 1 });
    expect(tasks[0].rows.map((x) => [x.name, x.status])).toEqual([["阿一", "completed"], ["阿二", "pending"]]);
    // 同一位再被另一個任務指定同一份文件：case_id 帶任務 id，不會撞唯一索引
    const r2 = await createDocTask({ templateKey: t.key, coachIds: ["a1"], deadline: null }, "boss");
    expect(r2.ok && r2.created).toBe(1);
    expect(S.coaches.find((c) => c.id === "a1").status).toBe("active");
  });
});
