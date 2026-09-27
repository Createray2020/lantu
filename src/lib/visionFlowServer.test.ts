import { describe, it, expect } from "vitest";
import { normCheckin } from "./consultSession";
import { flowActionsOf } from "./flowActions";

/** 願景處理流程：回訪對帳落表與客戶端行動清單的純函式。 */
describe("normCheckin：只收三種等級，數字欄壞掉不會炸", () => {
  it("正常資料原樣收下", () => {
    const c = normCheckin({ grade: "partial", actual: 1200000, planned: 1500000, ratio: 0.8, cnt: { done: 1, partial: 2 }, total: 3, at: "2026-09-27T00:00:00Z" });
    expect(c).not.toBeNull();
    expect(c!.grade).toBe("partial");
    expect(c!.cnt.done).toBe(1);
    expect(c!.at).toBe("2026-09-27T00:00:00Z");
  });
  it("等級不對或不是物件 → null；planned 缺就 null、不是 0", () => {
    expect(normCheckin({ grade: "great" })).toBeNull();
    expect(normCheckin("done")).toBeNull();
    expect(normCheckin(null)).toBeNull();
    const c = normCheckin({ grade: "done", actual: "x", cnt: { done: "3" } });
    expect(c!.actual).toBe(0);
    expect(c!.planned).toBeNull();
    expect(c!.cnt.done).toBe(0);
  });
});

describe("flowActionsOf：只在執行期之後才給客戶看，且只列啟用中的動作", () => {
  const base = { actions: [
    { id: "a1", on: true, cat: "income", name: "晉升", getMonthly: 12000, lane: "income-work" },
    { id: "a2", on: false, cat: "regular", payMonthly: 5000 },
    { id: "a3", cat: "expense", getMonthly: 3000, status: { state: "done" } },
    { cat: "lump", payLump: 100000 },
  ] };
  it("沒有 c.flow → 空；流程還在 S5A → 空", () => {
    expect(flowActionsOf(base)).toEqual([]);
    expect(flowActionsOf({ ...base, flow: { step: "S5A" } })).toEqual([]);
  });
  it("S7：列出啟用且有 id 的，lane 沒填就依類別推，狀態預設 planned", () => {
    const rows = flowActionsOf({ ...base, flow: { step: "S7" } });
    expect(rows.map((r) => r.id)).toEqual(["a1", "a3"]);
    expect(rows[0].laneLabel).toBe("收入·工作");
    expect(rows[0].amount).toBe("+12,000／月");
    expect(rows[0].state).toBe("planned");
    expect(rows[1].lane).toBe("expense");
    expect(rows[1].amount).toBe("−3,000／月");
    expect(rows[1].state).toBe("done");
    expect(rows[1].name).toBe("刪減支出");
  });
});
