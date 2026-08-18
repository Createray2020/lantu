import { describe, it, expect, vi, beforeEach } from "vitest";

// 後台動作的契約測試：確保「存檔」真的把使用者選的職級／上線送進 DB 層，
// 且任何失敗都以 { ok:false, error } 回傳（而不是丟例外讓 UI 靜默失敗）。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/brand", () => ({ saveBrand: vi.fn() }));
vi.mock("@/lib/coach", () => ({
  ensureCoach: vi.fn(),
  isAdmin: vi.fn(),
  setCoachOrg: vi.fn(),
  setCoachStatus: vi.fn(),
}));

import { ensureCoach, isAdmin, setCoachOrg, setCoachStatus } from "@/lib/coach";
import { updateOrg, approveCoach, suspendCoach } from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(ensureCoach).mockResolvedValue({ id: "admin1", role: "admin" });
  asMock(isAdmin).mockResolvedValue(true);
  // setCoachOrg 現在會回 { ok } —— 上線鏈的環狀檢查失敗時要讓 updateOrg 轉成畫面看得到的錯誤。
  asMock(setCoachOrg).mockResolvedValue({ ok: true });
  asMock(setCoachStatus).mockResolvedValue(undefined);
});

describe("updateOrg", () => {
  it("把選到的職級與上線寫進 DB 層", async () => {
    const res = await updateOrg("c1", { orgRank: "manager", uplineId: "boss" });
    expect(res).toEqual({ ok: true });
    expect(setCoachOrg).toHaveBeenCalledWith("c1", "manager", "boss");
  });

  it("沒選上線時存成 null", async () => {
    await updateOrg("c1", { orgRank: "member", uplineId: "" });
    expect(setCoachOrg).toHaveBeenCalledWith("c1", "member", null);
  });

  it("上線選到自己時視為無上線（避免自我循環）", async () => {
    await updateOrg("c1", { orgRank: "member", uplineId: "c1" });
    expect(setCoachOrg).toHaveBeenCalledWith("c1", "member", null);
  });

  it("會形成組織環時不寫 DB，把資料層的錯誤原樣回報", async () => {
    asMock(setCoachOrg).mockResolvedValue({ ok: false, error: "會形成組織環（該教練已在你的下線）" });
    const res = await updateOrg("c1", { orgRank: "manager", uplineId: "downline1" });
    expect(res).toEqual({ ok: false, error: "會形成組織環（該教練已在你的下線）" });
  });

  it("非法職級不寫 DB，回傳錯誤讓畫面顯示", async () => {
    const res = await updateOrg("c1", { orgRank: "superuser", uplineId: "" });
    expect(res).toEqual({ ok: false, error: "職級不正確" });
    expect(setCoachOrg).not.toHaveBeenCalled();
  });

  it("非管理員被擋下並回傳可讀錯誤", async () => {
    asMock(isAdmin).mockResolvedValue(false);
    const res = await updateOrg("c1", { orgRank: "manager", uplineId: "" });
    expect(res).toEqual({ ok: false, error: "沒有後台權限" });
    expect(setCoachOrg).not.toHaveBeenCalled();
  });

  it("DB 失敗時回傳錯誤而非丟例外", async () => {
    asMock(setCoachOrg).mockRejectedValue(new Error("connection lost"));
    const res = await updateOrg("c1", { orgRank: "owner", uplineId: "" });
    expect(res).toEqual({ ok: false, error: "connection lost" });
  });
});

describe("帳號狀態動作", () => {
  it("核准開通寫 active", async () => {
    expect(await approveCoach("c1")).toEqual({ ok: true });
    expect(setCoachStatus).toHaveBeenCalledWith("c1", "active");
  });

  it("停權失敗會回傳錯誤", async () => {
    asMock(setCoachStatus).mockRejectedValue(new Error("boom"));
    expect(await suspendCoach("c1")).toEqual({ ok: false, error: "boom" });
  });
});
