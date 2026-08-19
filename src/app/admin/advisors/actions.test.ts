import { describe, it, expect, vi, beforeEach } from "vitest";

// 顧問動作的契約：職級是分潤的基礎，任何人工調整都必須留下原因與紀錄。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/coach", () => ({ ensureCoach: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/Shared/db", () => ({
  db: { update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) }) },
}));
vi.mock("@/lib/comp/caseRepo", () => ({
  listAdvisors: vi.fn(), listCases: vi.fn(), listTrainingRecords: vi.fn(),
  saveMaintenance: vi.fn(), setAdvisorRank: vi.fn(),
  toAdvisorRows: (r: unknown) => r, toCaseRows: (r: unknown) => r,
}));
vi.mock("@/lib/comp/repo", () => ({ ensureActiveVersion: vi.fn(), loadParams: vi.fn() }));

import { ensureCoach, isAdmin } from "@/lib/coach";
import { listAdvisors, listCases, listTrainingRecords, saveMaintenance, setAdvisorRank } from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { V4_PRESET } from "@/lib/comp/preset";
import { recomputeAllAction, setRankAction } from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  asMock(ensureCoach).mockResolvedValue({ id: "admin1", role: "admin" });
  asMock(isAdmin).mockResolvedValue(true);
  asMock(ensureActiveVersion).mockResolvedValue({ id: "v1" });
  asMock(loadParams).mockResolvedValue(V4_PRESET);
  asMock(listAdvisors).mockResolvedValue([]);
  asMock(listCases).mockResolvedValue([]);
  asMock(listTrainingRecords).mockResolvedValue([]);
});

describe("setRankAction", () => {
  it("沒填原因就不給改", async () => {
    const r = await setRankAction("c1", "S2", "   ");
    expect(r).toEqual({ ok: false, error: "手動調整職級要填異動原因" });
    expect(setAdvisorRank).not.toHaveBeenCalled();
  });

  it("有原因時寫入並標記為人工異動", async () => {
    expect(await setRankAction("c1", "S2", "同業招募核定")).toEqual({ ok: true });
    expect(setAdvisorRank).toHaveBeenCalledWith("c1", "S2", "manual", "admin1", "同業招募核定");
  });

  it("非管理員擋下", async () => {
    asMock(isAdmin).mockResolvedValue(false);
    expect((await setRankAction("c1", "S2", "理由")).ok).toBe(false);
    expect(setAdvisorRank).not.toHaveBeenCalled();
  });
});

describe("recomputeAllAction", () => {
  it("A 軌達標者自動晉升並寫入維持資格快照", async () => {
    asMock(listAdvisors).mockResolvedValue([
      { id: "c1", name: "小陳", status: "active", rankCode: "C1", uplineId: null,
        hireDate: "2024-01-01", initialCases: 0, initialFees: 0 },
    ]);
    asMock(listCases).mockResolvedValue([
      { id: "k1", executorId: "c1", promoterId: "c1", clientId: "cl1", clientName: "A",
        fee: 60_000, refundAmount: 0, caseYear: new Date().getUTCFullYear(),
        paidAt: "2026-01-01", surveyAt: "2026-01-05", status: "closed" },
    ]);
    const r = await recomputeAllAction(new Date().getUTCFullYear());
    expect(r.ok).toBe(true);
    expect(setAdvisorRank).toHaveBeenCalledWith("c1", "C2", "auto_a", "admin1", expect.any(String));
    expect(saveMaintenance).toHaveBeenCalled();
  });

  it("開啟人工複核時不自動改職級，只更新維持資格", async () => {
    asMock(loadParams).mockResolvedValue({
      ...V4_PRESET,
      settings: { ...V4_PRESET.settings, promoManualReview: true },
    });
    asMock(listAdvisors).mockResolvedValue([
      { id: "c1", status: "active", rankCode: "C1", uplineId: null, hireDate: "2024-01-01",
        initialCases: 5, initialFees: 300_000 },
    ]);
    asMock(listCases).mockResolvedValue([]);
    await recomputeAllAction(2026);
    expect(setAdvisorRank).not.toHaveBeenCalled();
    expect(saveMaintenance).toHaveBeenCalled();
  });

  it("待審核（非 active）的帳號不列入重算", async () => {
    asMock(listAdvisors).mockResolvedValue([
      { id: "p1", status: "pending", rankCode: "C1", uplineId: null, initialCases: 99, initialFees: 999_999 },
    ]);
    const r = await recomputeAllAction(2026);
    expect(r.ok).toBe(true);
    expect(setAdvisorRank).not.toHaveBeenCalled();
    expect(asMock(saveMaintenance).mock.calls[0][0]).toEqual([]);
  });
});
