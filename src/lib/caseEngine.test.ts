import { describe, it, expect } from "vitest";
import {
  STAGES, STAGE_NO, nextStage, prevStage, addDays, diffDays, paramsFor, DEFAULT_STAGE_PARAMS, newStageRow, stageProgress, dueForClient, dueForCoach,
  overdueDays, daysToDue, completion, addWorkdays, workdaysBetween, escalationStep, normalizeFlags, type CaseRow,
} from "./caseEngine";

const base: CaseRow = { stage: "planning", status: "active", flags: [], startedAt: "2026-09-05", waitingSince: null, waitingDays: 0, pausedAt: null, closedAt: null };

describe("caseEngine 階段順序與預設值", () => {
  it("五階段對應提案書 4–8", () => {
    expect(STAGES.map((s) => STAGE_NO[s])).toEqual([4, 5, 6, 7, 8]);
    expect(nextStage("commission")).toBe("interview");
    expect(nextStage("tracking")).toBeNull();
    expect(prevStage("commission")).toBeNull();
  });
  it("預設期限：7／14／14／14／90，後台覆寫只蓋有填的", () => {
    expect(STAGES.map((s) => DEFAULT_STAGE_PARAMS[s].days)).toEqual([7, 14, 14, 14, 90]);
    expect(paramsFor("planning", { planning: { days: 21 } }).days).toBe(21);
    expect(paramsFor("planning", { planning: { days: 0 } }).days).toBe(14);
    expect(paramsFor("planning", { planning: { checklist: [] } }).checklist.length).toBe(2);
  });
  it("新階段列：預計日＝起算＋天數、清單全未勾", () => {
    const r = newStageRow("commission", "2026-09-05", paramsFor("commission"));
    expect(r.expectedDate).toBe("2026-09-12");
    expect(r.checklist.every((c) => !c.done)).toBe(true);
    expect(r.checklist.map((c) => c.k)).toEqual(["contract", "paid", "login", "next"]);
  });
});

describe("caseEngine 日期與逾期", () => {
  it("addDays／diffDays 跨月", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(diffDays("2026-01-30", "2026-02-02")).toBe(3);
  });
  it("時間軸：之前已完成、目前進行中、之後待開始；結案全部已完成", () => {
    expect(stageProgress(base, "commission")).toBe("done");
    expect(stageProgress(base, "planning")).toBe("active");
    expect(stageProgress(base, "report")).toBe("pending");
    expect(stageProgress({ stage: "planning", status: "closed" }, "planning")).toBe("done");
  });
  it("客戶端只看承諾／實際，沒承諾就不顯示預計", () => {
    expect(dueForClient({ promisedDate: null, actualDate: null })).toEqual({ kind: null, date: null });
    expect(dueForClient({ promisedDate: "2026-10-26", actualDate: null })).toEqual({ kind: "promised", date: "2026-10-26" });
    expect(dueForClient({ promisedDate: "2026-10-26", actualDate: "2026-10-20" })).toEqual({ kind: "actual", date: "2026-10-20" });
    expect(dueForCoach({ promisedDate: null, expectedDate: "2026-10-19", actualDate: null })).toBe("2026-10-19");
  });
  it("逾期：承諾優先；等待客戶不逾期；累計等待天數把到期日往後推", () => {
    const cur = { promisedDate: "2026-10-20", expectedDate: "2026-10-15", actualDate: null };
    expect(overdueDays(base, cur, "2026-10-25")).toBe(5);
    expect(overdueDays({ ...base, flags: ["waiting"] }, cur, "2026-10-25")).toBe(0);
    expect(overdueDays({ ...base, waitingDays: 4 }, cur, "2026-10-25")).toBe(1);
    expect(overdueDays({ ...base, status: "paused" }, cur, "2026-10-25")).toBe(0);
    expect(overdueDays(base, { ...cur, actualDate: "2026-10-18" }, "2026-10-25")).toBe(0);
  });
  it("daysToDue：等待中把目前這段也算進去", () => {
    const cur = { promisedDate: null, expectedDate: "2026-10-20", actualDate: null };
    expect(daysToDue(base, cur, "2026-10-17")).toBe(3);
    expect(daysToDue({ ...base, flags: ["waiting"], waitingSince: "2026-10-15" }, cur, "2026-10-17")).toBe(5);
  });
  it("完成進度：進行中那階不算", () => {
    expect(completion(base)).toEqual({ done: 2, total: 5 });
    expect(completion({ stage: "tracking", status: "closed" })).toEqual({ done: 5, total: 5 });
  });
});

describe("caseEngine 工作日與升級", () => {
  it("工作日跳過週末與假日", () => {
    // 2026-10-30 是週五
    expect(addWorkdays("2026-10-30", 1)).toBe("2026-11-02");
    expect(addWorkdays("2026-10-30", 3, new Set(["2026-11-03"]))).toBe("2026-11-05");
    expect(workdaysBetween("2026-10-30", "2026-11-04")).toBe(3);
  });
  it("升級：逾期第一天 1；3 工作日無更新 2；再 5 工作日 3；中間有更新就停住", () => {
    expect(escalationStep({ overdue: 0, escalation: 0, escalatedAt: null, lastUpdate: null, today: "2026-11-02" })).toBe(0);
    expect(escalationStep({ overdue: 1, escalation: 0, escalatedAt: null, lastUpdate: null, today: "2026-11-02" })).toBe(1);
    expect(escalationStep({ overdue: 3, escalation: 1, escalatedAt: "2026-11-02", lastUpdate: null, today: "2026-11-04" })).toBe(1);
    expect(escalationStep({ overdue: 4, escalation: 1, escalatedAt: "2026-11-02", lastUpdate: null, today: "2026-11-05" })).toBe(2);
    expect(escalationStep({ overdue: 4, escalation: 1, escalatedAt: "2026-11-02", lastUpdate: "2026-11-04", today: "2026-11-05" })).toBe(1);
    expect(escalationStep({ overdue: 12, escalation: 2, escalatedAt: "2026-11-05", lastUpdate: null, today: "2026-11-12" })).toBe(3);
  });
  it("normalizeFlags 只留四種", () => {
    expect(normalizeFlags(["overdue", "x", "waiting"])).toEqual(["overdue", "waiting"]);
    expect(normalizeFlags(null)).toEqual([]);
  });
});
