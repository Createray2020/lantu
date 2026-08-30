import { describe, it, expect, vi, beforeEach } from "vitest";

// 教練端「複製一份給自己」。
//
// 這支 action 存在的唯一理由是補一個洞：lib/templates.ts 的 copyTemplateToCoach()
// 只驗 `status === 'active'`，**不驗使用期限**。所以這裡守的第一件事就是
// 「期限到期的教練不能從範本長出新客戶」——那是全站唯讀鎖的一部分。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guard")>("@/lib/guard");
  return { ...actual, requireWritableCoach: vi.fn() };
});
vi.mock("@/lib/templates", () => ({ copyTemplateToCoach: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireWritableCoach, LicenseLockedError, QuotaFullError } from "@/lib/guard";
import { copyTemplateToCoach } from "@/lib/templates";
import { copyTemplateAction } from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  asMock(requireWritableCoach).mockResolvedValue({ id: "co1", status: "active" });
  asMock(copyTemplateToCoach).mockResolvedValue({ ok: true, clientId: "new1" });
});

describe("copyTemplateAction", () => {
  it("正常複製：帶著登入者自己的 id 進資料層，不吃呼叫端傳的教練 id", async () => {
    expect(await copyTemplateAction("t1")).toEqual({ ok: true, clientId: "new1" });
    expect(copyTemplateToCoach).toHaveBeenCalledWith("co1", "t1");
  });

  it("成功後要 revalidate 客戶清單，新客戶才會立刻出現在那一頁", async () => {
    await copyTemplateAction("t1");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/clients");
  });

  // ⚠️ 這一題是這個檔案的重點。少了 requireWritableCoach()，
  //    期限到期的教練照樣複製得出客戶，唯讀鎖就破了。
  it("使用期限到期：擋在資料層之前，一個字都不會寫進資料庫", async () => {
    asMock(requireWritableCoach).mockRejectedValue(new LicenseLockedError());
    const r = await copyTemplateAction("t1");
    expect(r.ok).toBe(false);
    expect(copyTemplateToCoach).not.toHaveBeenCalled();
  });

  it("到期的理由要原樣給人看，不能變成一句「複製失敗」", async () => {
    const err = new LicenseLockedError();
    asMock(requireWritableCoach).mockRejectedValue(err);
    expect(await copyTemplateAction("t1")).toEqual({ ok: false, error: err.message });
  });

  it("額度滿：資料層回的訊息原樣往上送（那是使用者做得完的事）", async () => {
    asMock(copyTemplateToCoach).mockResolvedValue({ ok: false, error: new QuotaFullError(30).message });
    const r = await copyTemplateAction("t1");
    expect(r).toEqual({ ok: false, error: new QuotaFullError(30).message });
    // 失敗就不該 revalidate——沒有任何東西變了
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("未開通／非教練被 requireCoach 擋下時回 false，不會把例外丟成 Next 的 digest 亂碼", async () => {
    asMock(requireWritableCoach).mockRejectedValue(new Error("forbidden"));
    const r = await copyTemplateAction("t1");
    expect(r).toEqual({ ok: false, error: "複製失敗，請重試。" });
  });
});
