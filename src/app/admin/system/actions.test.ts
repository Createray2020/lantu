import { describe, it, expect, vi, beforeEach } from "vitest";

// 制度設定存檔的契約：權限擋得住、明顯錯誤的參數擋在寫入之前、
// 失敗一律以 { ok:false, error } 回傳而不是丟例外（否則畫面靜默失敗）。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/coach", () => ({ ensureCoach: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/comp/repo", () => ({
  saveSettings: vi.fn(),
  saveRanks: vi.fn(),
  saveModules: vi.fn(),
  saveThresholds: vi.fn(),
  saveVersionMeta: vi.fn(),
  loadParams: vi.fn(),
  createVersion: vi.fn(),
  publishVersion: vi.fn(),
}));

import { ensureCoach, isAdmin } from "@/lib/coach";
import { loadParams, saveModules, saveRanks, saveSettings, saveThresholds } from "@/lib/comp/repo";
import {
  clearAllAction, loadV4Action, saveModulesAction, saveRanksAction, saveSettingsAction,
  saveThresholdsAction,
} from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;
const V = "ver-1";

beforeEach(() => {
  // resetAllMocks 而不是 clearAllMocks：clear 只清呼叫紀錄、不清 mockRejectedValue，
  // 上一個測試裝的「拋錯」實作會漏到下一個測試。
  vi.resetAllMocks();
  asMock(ensureCoach).mockResolvedValue({ id: "admin1", role: "admin" });
  asMock(isAdmin).mockResolvedValue(true);
  asMock(loadParams).mockResolvedValue({ settings: {}, ranks: [], thresholds: [], modules: [] });
});

describe("權限", () => {
  it("非管理員一律擋下，且不碰資料層", async () => {
    asMock(isAdmin).mockResolvedValue(false);
    const r = await saveSettingsAction(V, { splitPromoPct: 30 });
    expect(r).toEqual({ ok: false, error: "沒有後台權限" });
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe("saveSettingsAction", () => {
  it("正常存檔", async () => {
    const s = { splitPromoPct: 30, splitExecPct: 60 };
    expect(await saveSettingsAction(V, s)).toEqual({ ok: true });
    expect(saveSettings).toHaveBeenCalledWith(V, s);
  });

  it("推廣端＋執案端超過 100% 時擋在寫入之前（否則公司營運會變負數）", async () => {
    const r = await saveSettingsAction(V, { splitPromoPct: 60, splitExecPct: 60 });
    expect(r.ok).toBe(false);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("留空（未設定）不會被當成 0 而觸發檢核", async () => {
    expect(await saveSettingsAction(V, {})).toEqual({ ok: true });
    expect(saveSettings).toHaveBeenCalledWith(V, {});
  });

  it("資料層拋錯時轉成可讀訊息而不是例外", async () => {
    asMock(saveSettings).mockRejectedValue(new Error("version-archived"));
    const r = await saveSettingsAction(V, {});
    expect(r).toEqual({ ok: false, error: "已封存的版本不可編輯（它是舊案分潤的依據）" });
  });
});

describe("saveRanksAction", () => {
  it("重新編號 seq 後寫入（拖曳排序的結果要真的存進去）", async () => {
    await saveRanksAction(V, [
      { code: "B", seq: 9, promoPct: 20, execPct: 40 },
      { code: "A", seq: 3, promoPct: 10, execPct: 20 },
    ]);
    expect(saveRanks).toHaveBeenCalledWith(V, [
      { code: "B", seq: 1, promoPct: 20, execPct: 40 },
      { code: "A", seq: 2, promoPct: 10, execPct: 20 },
    ], "");
  });

  it("帶模塊代號時只覆寫該模塊那一組表", async () => {
    await saveRanksAction(V, [{ code: "C1", seq: 1, promoPct: 10, execPct: 20 }], "LEC");
    expect(asMock(saveRanks).mock.calls[0][2]).toBe("LEC");
  });

  it("代號重複時擋下 —— 引擎全部以 code 查表，重複會靜默算錯人", async () => {
    const r = await saveRanksAction(V, [{ code: "C1", seq: 1 }, { code: "C1", seq: 2 }]);
    expect(r).toEqual({ ok: false, error: "職級代號重複" });
    expect(saveRanks).not.toHaveBeenCalled();
  });

  it("代號空白時擋下", async () => {
    const r = await saveRanksAction(V, [{ code: "  ", seq: 1 }]);
    expect(r).toEqual({ ok: false, error: "職級代號不可空白" });
  });
});

describe("saveModulesAction", () => {
  it("代號轉大寫、重新編號後寫入", async () => {
    expect(await saveModulesAction(V, [
      { code: " spot ", seq: 9, name: " 單點諮詢 " },
    ])).toEqual({ ok: true });
    expect(asMock(saveModules).mock.calls[0][1]).toEqual([
      { code: "SPOT", seq: 1, name: "單點諮詢" },
    ]);
  });

  it("代號重複／空白／沒名稱都擋在寫入之前（代號是案件與職級表的參照鍵）", async () => {
    expect((await saveModulesAction(V, [{ code: "A", seq: 1, name: "x" }, { code: "a", seq: 2, name: "y" }])).ok).toBe(false);
    expect((await saveModulesAction(V, [{ code: "", seq: 1, name: "x" }])).ok).toBe(false);
    expect((await saveModulesAction(V, [{ code: "A", seq: 1, name: " " }])).ok).toBe(false);
    expect(saveModules).not.toHaveBeenCalled();
  });
});

describe("saveThresholdsAction", () => {
  it("沒選目標職級的空列不寫入", async () => {
    await saveThresholdsAction(V, "promotion_a", [
      { kind: "promotion_a", toCode: "C2", cases: 1 },
      { kind: "promotion_a", toCode: "" },
    ]);
    expect(saveThresholds).toHaveBeenCalledWith(V, "promotion_a", [
      { kind: "promotion_a", toCode: "C2", cases: 1 },
    ]);
  });
});

describe("loadV4Action", () => {
  it("空白制度：帶入辦法的模塊、職級與三種門檻", async () => {
    expect(await loadV4Action(V)).toEqual({ ok: true });
    expect(asMock(saveSettings).mock.calls[0][1].splitExecPct).toBe(60);
    expect(asMock(saveModules).mock.calls[0][1].map((m: { code: string }) => m.code))
      .toEqual(["FULL", "SPOT"]);
    expect(asMock(saveRanks).mock.calls[0][1]).toHaveLength(7);
    const kinds = asMock(saveThresholds).mock.calls.map((c) => c[1]);
    expect(kinds).toEqual(["promotion_a", "promotion_b", "tenure"]);
  });

  it("已自訂的數值不被覆蓋", async () => {
    asMock(loadParams).mockResolvedValue({ settings: { payoutDay: 20 }, ranks: [], thresholds: [], modules: [] });
    await loadV4Action(V);
    expect(asMock(saveSettings).mock.calls[0][1].payoutDay).toBe(20);
  });
});

describe("clearAllAction", () => {
  it("參數、模塊、職級、三種門檻全部清空", async () => {
    expect(await clearAllAction(V)).toEqual({ ok: true });
    expect(saveSettings).toHaveBeenCalledWith(V, {});
    expect(saveModules).toHaveBeenCalledWith(V, []);
    expect(saveRanks).toHaveBeenCalledWith(V, []);
    expect(asMock(saveThresholds).mock.calls.map((c) => c[1]))
      .toEqual(["promotion_a", "promotion_b", "tenure"]);
  });
});
