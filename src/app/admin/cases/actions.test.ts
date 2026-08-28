import { describe, it, expect, vi, beforeEach } from "vitest";

// 案件動作的契約：權限擋得住、明顯無效的輸入不會進 DB、失敗一律回 { ok:false, error }。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/coach", () => ({ ensureCoach: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/comp/caseRepo", () => ({
  createCase: vi.fn(), updateCase: vi.fn(), recalcCase: vi.fn(), refundCase: vi.fn(),
  createBatch: vi.fn(), markBatchPaid: vi.fn(),
}));

import { ensureCoach, isAdmin } from "@/lib/coach";
import { createBatch, createCase, markBatchPaid, refundCase } from "@/lib/comp/caseRepo";
import {
  createBatchAction, createCaseAction, markBatchPaidAction, refundCaseAction,
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
