import { describe, it, expect, vi, beforeEach } from "vitest";

// 客戶端問卷的契約，重點在權限：
// 案件歸屬必須在伺服器端重查，不能相信前端傳來的 caseId——
// 少了這道，任何登入者改個 id 就能讀寫別人的案件。
// 題目同理：前端根本不送，伺服器自己從生效版制度設定取。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/clientUser", () => ({ ensureClientUser: vi.fn() }));
vi.mock("@/lib/comp/survey", () => ({ submitSurvey: vi.fn(), questionsOf: vi.fn() }));
vi.mock("@/lib/comp/repo", () => ({ ensureActiveVersion: vi.fn(), loadParams: vi.fn() }));

const whereMock = vi.fn();
vi.mock("@/Shared/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => whereMock() }),
        }),
      }),
    }),
  },
}));

import { ensureClientUser } from "@/lib/clientUser";
import { submitSurvey, questionsOf } from "@/lib/comp/survey";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { submitClientSurveyAction } from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;
const input = {
  caseId: "case1",
  answers: ["  答一  ", "", "答三"],
  marketingOptIn: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  asMock(ensureClientUser).mockResolvedValue({ id: "cu1" });
  whereMock.mockResolvedValue([{ id: "case1" }]);
  asMock(ensureActiveVersion).mockResolvedValue({ id: "v1" });
  asMock(loadParams).mockResolvedValue({ settings: {} });
  asMock(questionsOf).mockReturnValue(["制度題一", "制度題二", "制度題三"]);
});

describe("submitClientSurveyAction", () => {
  it("案件屬於本人時提交成功，答案前後空白會被修掉", async () => {
    expect(await submitClientSurveyAction(input)).toEqual({ ok: true });
    const arg = asMock(submitSurvey).mock.calls[0][0];
    expect(arg.answers).toEqual(["答一", "", "答三"]);
    expect(arg.submittedBy).toBe("client");
    expect(arg.submitterId).toBe("cu1");
  });

  it("題目一律由伺服器取，前端塞不進去（勾了見證同意的那筆會對外展示）", async () => {
    // 舊介面允許呼叫端夾帶 questions；現在多餘的鍵不會有任何作用。
    const spoof = { ...input, questions: ["我是自己編的題目"] } as Parameters<typeof submitClientSurveyAction>[0];
    expect(await submitClientSurveyAction(spoof)).toEqual({ ok: true });
    const arg = asMock(submitSurvey).mock.calls[0][0];
    expect(arg.questions).toEqual(["制度題一", "制度題二", "制度題三"]);
  });

  it("案件不屬於本人時擋下，且不碰資料層", async () => {
    whereMock.mockResolvedValue([]);
    expect(await submitClientSurveyAction(input))
      .toEqual({ ok: false, error: "找不到這筆服務紀錄" });
    expect(submitSurvey).not.toHaveBeenCalled();
  });

  it("未登入時擋下", async () => {
    asMock(ensureClientUser).mockResolvedValue(null);
    expect(await submitClientSurveyAction(input)).toEqual({ ok: false, error: "請先登入" });
    expect(submitSurvey).not.toHaveBeenCalled();
  });

  it("全部留白不算回收（否則按一下就結案了）", async () => {
    const r = await submitClientSurveyAction({ ...input, answers: ["", "   ", ""] });
    expect(r).toEqual({ ok: false, error: "請至少回答一題" });
    expect(submitSurvey).not.toHaveBeenCalled();
  });

  it("已退費／作廢的案件由資料層擋下並轉成可讀訊息", async () => {
    asMock(submitSurvey).mockRejectedValue(new Error("case-closed-invalid"));
    expect(await submitClientSurveyAction(input))
      .toEqual({ ok: false, error: "這筆服務已退費或作廢，無法填寫" });
  });
});
