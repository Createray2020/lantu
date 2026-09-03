/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 「核准報聘那一刻要一次寫齊」的測試。
 *
 * 2026/08/31 之前核准只做 `status='active'`，職級／推薦人／期限全靠人事後補 ——
 * 補漏的代價是「開通了卻沒定級、沒設期限」的帳號默默累積（上線前盤點時 15 位裡有 8 位未定級）。
 * 這裡釘住三件事：閘門擋得住、該帶的有帶、不該蓋的沒蓋。
 */

const h = vi.hoisted(() => {
  const T = {
    coaches: { _n: "coaches", id: { name: "id" } },
    coachApplications: { _n: "coach_applications", coachId: { name: "coach_id" }, introducerId: { name: "introducer_id" }, introducerState: { name: "introducer_state" }, reviewChecks: { name: "review_checks" }, submittedAt: { name: "submitted_at" } },
    coachApplySettings: { _n: "coach_apply_settings", id: { name: "id" } },
    coachDisplayName: { name: "display_name" },
  };
  const state: any = { coaches: [] as any[], apps: [] as any[], settings: [] as any[], updates: [] as any[] };
  const pick = (name: string) =>
    name === "coaches" ? state.coaches : name === "coach_applications" ? state.apps : state.settings;
  const db = {
    select: () => ({
      from: (t: any) => {
        const rows = () => pick(t?._n);
        const c: any = {
          where: () => c,
          innerJoin: () => c,
          orderBy: () => Promise.resolve(rows()),
          limit: () => Promise.resolve(rows()),
          then: (res: any, rej: any) => Promise.resolve(rows()).then(res, rej),
        };
        return c;
      },
    }),
    insert: (t: any) => ({
      values: (v: any) => {
        pick(t?._n).push(v);
        const c: any = { returning: () => Promise.resolve([{ ...v }]), onConflictDoUpdate: () => c, then: (r: any) => Promise.resolve().then(r) };
        return c;
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        state.updates.push({ table: t?._n, ...v });
        const c: any = { where: () => c, returning: () => Promise.resolve([{}]), then: (r: any) => Promise.resolve().then(r) };
        return c;
      },
    }),
  };
  return { T, state, db };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col: col?.name, val }),
  and: (...xs: any[]) => ({ and: xs }),
  desc: (x: any) => x,
  count: () => ({}),
  sql: () => ({}),
}));
vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("@/Shared/db/schema", () => h.T);
// 發號另有 codes.test.ts 守著，這裡只要確認核准時有叫它。
// ⚠️ mock 工廠會被提升到檔頭，所以 spy 必須用 vi.hoisted 建（直接寫 const 會 ReferenceError）。
const m = vi.hoisted(() => ({ ensureCoachCode: vi.fn(async () => "FC2609001") }));
vi.mock("./coach", () => ({ ensureCoachCode: m.ensureCoachCode }));
const ensureCoachCode = m.ensureCoachCode;

import { approveApplication } from "./coachApplyStore";
import { todayISO, addPeriod } from "./license";

const S = h.state;

beforeEach(() => {
  S.coaches = [];
  S.apps = [];
  S.settings = [];
  S.updates = [];
  ensureCoachCode.mockClear();
});

const coachRow = (over: any = {}) => ({
  id: "u1",
  status: "pending",
  rankCode: null,
  uplineId: null,
  licenseUntil: null,
  ...over,
});

const appRow = (over: any = {}) => ({
  coachId: "u1",
  route: "referral",
  introducerId: "up1",
  introducerState: "confirmed",
  reviewChecks: { credential: "2026-08-31", payment: "2026-08-31" },
  ...over,
});

const coachUpdate = () => S.updates.find((u: any) => u.table === "coaches");

describe("核准報聘", () => {
  it("推薦人還沒確認就核准不了，而且一個字都沒寫進 DB", async () => {
    S.coaches = [coachRow()];
    S.apps = [appRow({ introducerState: "pending" })];
    const r = await approveApplication("u1", "admin1");
    expect(r.ok).toBe(false);
    expect(S.updates).toHaveLength(0);
    expect(ensureCoachCode).not.toHaveBeenCalled();
  });

  it("必勾項目沒勾完也核准不了", async () => {
    S.coaches = [coachRow()];
    S.apps = [appRow({ reviewChecks: {} })];
    const r = await approveApplication("u1", "admin1");
    expect(r.ok).toBe(false);
    expect(S.updates).toHaveLength(0);
  });

  it("通過閘門就一次帶齊：C1、推薦人（組織位置）＝申請時填的推薦人、期限一年，並發編號", async () => {
    S.coaches = [coachRow()];
    S.apps = [appRow()];
    const r = await approveApplication("u1", "admin1");
    expect(r.ok).toBe(true);
    const u = coachUpdate();
    expect(u.status).toBe("active");
    expect(u.rankCode).toBe("C1");
    expect(u.uplineId).toBe("up1");
    expect(u.licenseUntil).toBe(addPeriod(todayISO(), "year", 1));
    expect(ensureCoachCode).toHaveBeenCalledWith("u1");
  });

  it("⚠️ 已經設過的職級／推薦人／期限不會被蓋掉（停權後再核准也不會被降回 C1）", async () => {
    S.coaches = [coachRow({ rankCode: "S2", uplineId: "boss", licenseUntil: "2030-01-01" })];
    S.apps = [appRow()];
    const r = await approveApplication("u1", "admin1");
    const u = coachUpdate();
    // 三個欄位連寫都不寫（不是寫回同一個值）——寫回去也是一次真的 UPDATE，
    // 會蓋掉別人在這幾秒內剛改好的值。
    expect(u.rankCode).toBeUndefined();
    expect(u.uplineId).toBeUndefined();
    expect(u.licenseUntil).toBeUndefined();
    expect(u.status).toBe("active");
    expect(r.ok && r.applied.rankCode).toBe("S2");
  });

  it("⚠️ 自我推薦不會做出指向自己的推薦人環", async () => {
    S.coaches = [coachRow()];
    S.apps = [appRow({ introducerId: "u1" })];
    await approveApplication("u1", "admin1");
    const u = coachUpdate();
    expect(u.uplineId).toBeUndefined();
  });

  it("⚠️ 沒有申請表的舊帳號照樣核准得了（檢核表不回頭套用在他們身上）", async () => {
    S.coaches = [coachRow()];
    S.apps = [];
    const r = await approveApplication("u1", "admin1");
    expect(r.ok).toBe(true);
    expect(coachUpdate().status).toBe("active");
    // 沒有推薦人可綁，但職級與期限的預設值照樣補上（這正是舊帳號會漏掉的兩件事）。
    expect(coachUpdate().rankCode).toBe("C1");
  });

  it("找不到人就回錯誤，不會憑空建一列", async () => {
    S.coaches = [];
    const r = await approveApplication("nobody", "admin1");
    expect(r.ok).toBe(false);
    expect(S.updates).toHaveLength(0);
  });
});
