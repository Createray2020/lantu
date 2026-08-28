import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 教練端寫入動作的契約：**任何失敗都要以 { ok:false, error } 回傳，不准 throw**。
 *
 * 為什麼這件事值得一支測試守著：Next 在正式環境會把 server action 丟出的錯誤訊息
 * 換成一串沒有意義的 digest，畫面上就只剩「操作失敗，請重試」——
 * 而真正的原因（使用期限到期、客戶數已滿）恰恰是使用者唯一需要知道的事，
 * 不知道就會一直重試，重試一百次也不會成功。
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guard", () => ({
  requireWritableCoach: vi.fn(),
  requireClientQuota: vi.fn(),
}));
vi.mock("@/lib/clients", () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  setClientStatus: vi.fn(),
}));
vi.mock("@/lib/plans", () => ({
  createPlan: vi.fn(),
  clonePlan: vi.fn(),
  updatePlanMeta: vi.fn(),
  deletePlan: vi.fn(),
  updatePlanData: vi.fn(),
  getPlan: vi.fn(),
}));
vi.mock("@/lib/reviews", () => ({
  createReview: vi.fn(),
  updateReview: vi.fn(),
  deleteReview: vi.fn(),
  createActionItem: vi.fn(),
  setActionItemDone: vi.fn(),
  deleteActionItem: vi.fn(),
}));
vi.mock("@/lib/revisions", () => ({ logRevision: vi.fn(), restoreRevision: vi.fn() }));
vi.mock("@/lib/notes", () => ({
  addNote: vi.fn(), deleteNote: vi.fn(), setNoteVisible: vi.fn(), listNotes: vi.fn(),
}));
vi.mock("@/lib/consultSession", () => ({
  startSession: vi.fn(), endSession: vi.fn(), saveSessionRecord: vi.fn(),
  pendingDraft: vi.fn(), discardDraft: vi.fn(), openSession: vi.fn(), listSessions: vi.fn(),
}));

import { requireWritableCoach, requireClientQuota } from "@/lib/guard";
import * as Clients from "@/lib/clients";
import * as Plans from "@/lib/plans";
import * as Reviews from "@/lib/reviews";
import {
  createClientAction, updateClientAction, archiveClientAction,
  createPlanAction, clonePlanAction, deletePlanAction, updatePlanMetaAction,
  createReviewAction, updateReviewAction, deleteReviewAction,
  createActionItemAction, setActionItemDoneAction, deleteActionItemAction,
} from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

/** 具名錯誤（guard 丟的就是這種）：message 本來就是寫給人看的中文。 */
function namedError(name: string, message: string) {
  const e = new Error(message);
  e.name = name;
  return e;
}

const LOCKED = "使用期限已到期，目前為唯讀。請聯繫管理員延長期限。";

beforeEach(() => {
  vi.clearAllMocks();
  asMock(requireWritableCoach).mockResolvedValue({ id: "coach1", name: "教練甲" });
  asMock(requireClientQuota).mockResolvedValue(undefined);
  asMock(Clients.createClient).mockResolvedValue("client1");
  asMock(Plans.createPlan).mockResolvedValue({ ok: true, planId: "plan1" });
  asMock(Plans.clonePlan).mockResolvedValue("plan2");
});

// 每一支「原本是 Promise<void> + throw」的動作，逐一確認新的回傳形狀。
const VOID_ACTIONS: [string, () => Promise<{ ok: boolean }>][] = [
  ["updateClientAction", () => updateClientAction("c1", { name: "王小明" })],
  ["archiveClientAction", () => archiveClientAction("c1")],
  ["updatePlanMetaAction", () => updatePlanMetaAction("c1", "p1", { status: "final" })],
  ["deletePlanAction", () => deletePlanAction("c1", "p1")],
  ["createReviewAction", () => createReviewAction("c1", { date: "2026-08-01", type: "review" })],
  ["updateReviewAction", () => updateReviewAction("c1", "r1", { summary: "改一下" })],
  ["deleteReviewAction", () => deleteReviewAction("c1", "r1")],
  ["createActionItemAction", () => createActionItemAction("c1", { title: "補資料" })],
  ["setActionItemDoneAction", () => setActionItemDoneAction("c1", "i1", true)],
  ["deleteActionItemAction", () => deleteActionItemAction("c1", "i1")],
];

describe("教練端寫入動作：成功時回 { ok:true }", () => {
  it.each(VOID_ACTIONS)("%s", async (_name, run) => {
    await expect(run()).resolves.toEqual({ ok: true });
  });

  it("createPlanAction／clonePlanAction 回新版本 id", async () => {
    expect(await createPlanAction("c1", "王小明")).toEqual({ ok: true, id: "plan1" });
    expect(await clonePlanAction("p1")).toEqual({ ok: true, id: "plan2" });
  });

  it("createClientAction 回新客戶 id", async () => {
    expect(await createClientAction({ name: "王小明" } as Clients.ClientInput))
      .toEqual({ ok: true, id: "client1" });
  });
});

describe("使用期限到期：回傳理由，不是 throw", () => {
  beforeEach(() => {
    asMock(requireWritableCoach).mockRejectedValue(namedError("LicenseLockedError", LOCKED));
  });

  it.each(VOID_ACTIONS)("%s 把鎖定原因原文帶回畫面", async (_name, run) => {
    await expect(run()).resolves.toEqual({ ok: false, error: LOCKED });
  });

  it("createPlanAction／clonePlanAction 也一樣", async () => {
    expect(await createPlanAction("c1", "王小明")).toEqual({ ok: false, error: LOCKED });
    expect(await clonePlanAction("p1")).toEqual({ ok: false, error: LOCKED });
  });

  it("createClientAction 也一樣，而且不會碰資料層", async () => {
    expect(await createClientAction({ name: "王小明" } as Clients.ClientInput))
      .toEqual({ ok: false, error: LOCKED });
    expect(Clients.createClient).not.toHaveBeenCalled();
  });
});

describe("客戶數已滿：額度訊息要看得到", () => {
  it("createClientAction 回上限說明並且不建立客戶", async () => {
    asMock(requireClientQuota).mockRejectedValue(namedError("QuotaFullError", "客戶數已達上限 20 位"));
    expect(await createClientAction({ name: "王小明" } as Clients.ClientInput))
      .toEqual({ ok: false, error: "客戶數已達上限 20 位" });
    expect(Clients.createClient).not.toHaveBeenCalled();
  });
});

describe("非具名的例外不外洩技術訊息", () => {
  it("forbidden 換成看得懂的中文", async () => {
    asMock(requireWritableCoach).mockRejectedValue(new Error("forbidden"));
    const r = await archiveClientAction("c1");
    expect(r.ok).toBe(false);
    expect(r).not.toEqual({ ok: false, error: "forbidden" });
    expect((r as { error: string }).error).toContain("權限");
  });

  it("資料層的英文例外換成可行動的一句話", async () => {
    asMock(Reviews.createReview).mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    const r = await createReviewAction("c1", { date: "2026-08-01", type: "review" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).not.toContain("duplicate key");
    expect((r as { error: string }).error).toContain("再試");
  });
});

describe("資料層回 { ok:false } 時原文傳給畫面", () => {
  it("createPlanAction 帶回資料層的理由", async () => {
    asMock(Plans.createPlan).mockResolvedValue({ ok: false, error: "這一年已經有版本了" });
    expect(await createPlanAction("c1", "王小明"))
      .toEqual({ ok: false, error: "這一年已經有版本了" });
  });
});
