import { describe, it, expect, vi, beforeEach } from "vitest";

// 在公開教練頁選教練：入口換了，但「教練接受才掛上」的雙向確認沒有變。
// 這裡要守的是：不能靠改 id 指定未上架或已停權的對象。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/clientUser", () => ({ ensureClientUser: vi.fn() }));
vi.mock("@/lib/coachLink", () => ({ requestCoachLink: vi.fn(), findCoachByCode: vi.fn() }));
vi.mock("@/lib/coachProfile", () => ({ getPublicCoach: vi.fn() }));

import { ensureClientUser } from "@/lib/clientUser";
import { findCoachByCode, requestCoachLink } from "@/lib/coachLink";
import { getPublicCoach } from "@/lib/coachProfile";
import { PICK_BLOCKED_MESSAGE } from "@/lib/license";
import { pickCoachAction, pickCoachByCodeAction } from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  asMock(ensureClientUser).mockResolvedValue({ id: "cu1" });
  asMock(getPublicCoach).mockResolvedValue({ id: "co1", name: "小陳", pickable: true, code: "FC2609001" });
  asMock(findCoachByCode).mockResolvedValue({ id: "co9", name: "阿義", title: null, code: "FC2609009" });
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

// ── 派案閘（2026/08/24 Ray 拍板）──────────────────────────────
// C 階教練照常出現在教練頁，但不能從卡片直接指定；要指定只能輸入完整教練編號。
describe("pickCoachAction 的派案閘", () => {
  it("C 階（pickable=false）從卡片點選會被伺服器端擋下", async () => {
    asMock(getPublicCoach).mockResolvedValue({ id: "c3", name: "阿義", pickable: false, code: "FC2609009" });
    expect(await pickCoachAction("c3")).toEqual({ ok: false, error: PICK_BLOCKED_MESSAGE });
    expect(requestCoachLink).not.toHaveBeenCalled();
  });

  it("按鈕不見不等於叫不動：前端沒送的請求，server action 自己也要擋", async () => {
    asMock(getPublicCoach).mockResolvedValue({ id: "c3", name: "阿義", pickable: false, code: null });
    const r = await pickCoachAction("c3");
    expect(r.ok).toBe(false);
  });
});

describe("pickCoachByCodeAction", () => {
  it("用編號指定：不看職級，C 階也送得出去", async () => {
    expect(await pickCoachByCodeAction("fc2609009")).toEqual({ ok: true, coachName: "阿義" });
    expect(requestCoachLink).toHaveBeenCalledWith({ id: "cu1" }, "co9");
  });

  it("查無此編號時給看得懂的錯誤，不建任何申請", async () => {
    asMock(findCoachByCode).mockResolvedValue(null);
    const r = await pickCoachByCodeAction("FC2609999");
    expect(r.ok).toBe(false);
    expect(requestCoachLink).not.toHaveBeenCalled();
  });

  it("未登入時要求先登入，不去查編號", async () => {
    asMock(ensureClientUser).mockResolvedValue(null);
    expect(await pickCoachByCodeAction("FC2609009")).toEqual({ ok: false, error: "請先登入或註冊客戶帳號" });
    expect(findCoachByCode).not.toHaveBeenCalled();
  });

  it("已經連結別的教練時把資料層的錯誤原樣回報", async () => {
    asMock(requestCoachLink).mockResolvedValue({ ok: false, error: "你已經連結教練了" });
    expect(await pickCoachByCodeAction("FC2609009")).toEqual({ ok: false, error: "你已經連結教練了" });
  });
});
