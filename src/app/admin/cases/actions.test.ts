import { describe, it, expect, vi, beforeEach } from "vitest";

// 案件動作的契約：權限擋得住、明顯無效的輸入不會進 DB、失敗一律回 { ok:false, error }。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/coach", () => ({ ensureCoach: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/comp/caseRepo", () => ({
  createCase: vi.fn(), updateCase: vi.fn(), recalcCase: vi.fn(), refundCase: vi.fn(),
  createBatch: vi.fn(), markBatchPaid: vi.fn(),
}));

import { ensureCoach, isAdmin } from "@/lib/coach";
import { createBatch, createCase, markBatchPaid, recalcCase, refundCase } from "@/lib/comp/caseRepo";
import {
  createBatchAction, createCaseAction, markBatchPaidAction, recalcCaseAction, refundCaseAction,
} from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  asMock(ensureCoach).mockResolvedValue({ id: "admin1", role: "admin" });
  asMock(isAdmin).mockResolvedValue(true);
});

const ok = { clientName: "王小明", fee: 60_000, executorId: "c1" };

describe("createCaseAction", () => {
  it("正常登錄", async () => {
    expect(await createCaseAction(ok)).toEqual({ ok: true });
    expect(createCase).toHaveBeenCalled();
  });

  it("非管理員擋下且不進資料層", async () => {
    asMock(isAdmin).mockResolvedValue(false);
    expect(await createCaseAction(ok)).toEqual({ ok: false, error: "沒有後台權限" });
    expect(createCase).not.toHaveBeenCalled();
  });

  it("沒選執案教練／沒填客戶／顧問費為 0 都擋下", async () => {
    expect((await createCaseAction({ ...ok, executorId: "" })).ok).toBe(false);
    expect((await createCaseAction({ ...ok, clientName: "  " })).ok).toBe(false);
    expect((await createCaseAction({ ...ok, fee: 0 })).ok).toBe(false);
    expect(createCase).not.toHaveBeenCalled();
  });

  it("客戶姓名前後空白會被修掉（否則同一人會被當成兩個個案）", async () => {
    await createCaseAction({ ...ok, clientName: "  王小明  " });
    expect(asMock(createCase).mock.calls[0][0].clientName).toBe("王小明");
  });
});

describe("refundCaseAction", () => {
  it("負數退費視為 0", async () => {
    await refundCaseAction("case1", -500);
    expect(refundCase).toHaveBeenCalledWith("case1", 0);
  });
});

describe("recalcCaseAction", () => {
  it("正常重算回 ok", async () => {
    asMock(recalcCase).mockResolvedValue({ recalculated: true });
    expect(await recalcCaseAction("case1")).toEqual({ ok: true });
  });

  it("已發放的案件：不能安靜地什麼都不做，要回一個看得懂的錯誤", async () => {
    // 資料層對已發放的案件是「不重算」而不是丟例外——動作層必須把它翻成訊息，
    // 否則管理員按下「重算分潤」只會看到成功提示，卻什麼都沒變。
    asMock(recalcCase).mockResolvedValue({ recalculated: false, reason: "has-paid" });
    expect(await recalcCaseAction("case1")).toEqual({
      ok: false, error: "這筆案件的分潤已經發放，不能重算；要退費請用「產生沖回」。",
    });
  });
});

describe("批次", () => {
  it("已發放的批次不能再收案，錯誤訊息看得懂", async () => {
    asMock(createBatch).mockRejectedValue(new Error("batch-paid"));
    expect(await createBatchAction("2026-08", "2026-09-05"))
      .toEqual({ ok: false, error: "該月批次已發放，不能再收案" });
  });

  it("標記發放帶入操作者，供稽核", async () => {
    await markBatchPaidAction("b1");
    expect(markBatchPaid).toHaveBeenCalledWith("b1", "admin1");
  });
});
