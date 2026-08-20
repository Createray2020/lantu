import { describe, it, expect, vi, beforeEach } from "vitest";

// 在公開教練頁選教練：入口換了，但「教練接受才掛上」的雙向確認沒有變。
// 這裡要守的是：不能靠改 id 指定未上架或已停權的對象。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/clientUser", () => ({ ensureClientUser: vi.fn() }));
vi.mock("@/lib/coachLink", () => ({ requestCoachLink: vi.fn() }));
vi.mock("@/lib/coachProfile", () => ({ getPublicCoach: vi.fn() }));

import { ensureClientUser } from "@/lib/clientUser";
import { requestCoachLink } from "@/lib/coachLink";
import { getPublicCoach } from "@/lib/coachProfile";
import { pickCoachAction } from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  asMock(ensureClientUser).mockResolvedValue({ id: "cu1" });
  asMock(getPublicCoach).mockResolvedValue({ id: "co1", name: "小陳" });
  asMock(requestCoachLink).mockResolvedValue({ ok: true });
});

describe("pickCoachAction", () => {
  it("正常送出連結申請（仍走雙向確認）", async () => {
    expect(await pickCoachAction("co1")).toEqual({ ok: true });
    expect(requestCoachLink).toHaveBeenCalledWith({ id: "cu1" }, "co1");
  });

  it("未登入時要求先登入，不碰資料層", async () => {
    asMock(ensureClientUser).mockResolvedValue(null);
    expect(await pickCoachAction("co1")).toEqual({ ok: false, error: "請先登入或註冊客戶帳號" });
    expect(requestCoachLink).not.toHaveBeenCalled();
  });

  it("指定未上架／已停權／不存在的教練會被擋下", async () => {
    asMock(getPublicCoach).mockResolvedValue(null);
    expect(await pickCoachAction("hidden")).toEqual({ ok: false, error: "找不到這位教練" });
    expect(requestCoachLink).not.toHaveBeenCalled();
  });

  it("已經有教練時把資料層的錯誤原樣回報", async () => {
    asMock(requestCoachLink).mockResolvedValue({ ok: false, error: "你已經連結教練了" });
    expect(await pickCoachAction("co1")).toEqual({ ok: false, error: "你已經連結教練了" });
  });
});
