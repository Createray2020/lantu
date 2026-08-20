import { describe, it, expect, vi, beforeEach } from "vitest";

// 教練公開檔案的契約。這一份會直接出現在官網上，所以兩件事最重要：
// 一是教練只能改自己的（action 根本不接 coachId），二是照片與長度上限擋得住。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/coach", () => ({ ensureCoach: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/coachProfile", () => ({ saveProfile: vi.fn(), setPublished: vi.fn() }));

import { ensureCoach, isAdmin } from "@/lib/coach";
import { saveProfile, setPublished } from "@/lib/coachProfile";
import { saveMyProfileAction, setPublishedAction } from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;
const photo = (len: number) => `data:image/jpeg;base64,${"A".repeat(len)}`;

beforeEach(() => {
  vi.resetAllMocks();
  asMock(ensureCoach).mockResolvedValue({ id: "c1", status: "active" });
  asMock(isAdmin).mockResolvedValue(true);
});

describe("saveMyProfileAction", () => {
  it("存成自己的檔案（action 不接 coachId，改不到別人）", async () => {
    expect(await saveMyProfileAction({ headline: "陪你走", bio: "介紹" })).toEqual({ ok: true });
    expect(asMock(saveProfile).mock.calls[0][0]).toBe("c1");
  });

  it("未登入／未開通的帳號不能建立公開檔案", async () => {
    asMock(ensureCoach).mockResolvedValue(null);
    expect((await saveMyProfileAction({})).ok).toBe(false);

    asMock(ensureCoach).mockResolvedValue({ id: "c1", status: "pending" });
    expect(await saveMyProfileAction({}))
      .toEqual({ ok: false, error: "帳號尚未開通，無法建立公開檔案" });
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("專長去重、去空白並限量", async () => {
    await saveMyProfileAction({ specialties: [" 退休規劃 ", "退休規劃", "", "稅務規劃"] });
    expect(asMock(saveProfile).mock.calls[0][1].specialties).toEqual(["退休規劃", "稅務規劃"]);
  });

  it("照片超過 300KB 擋下（這串 base64 會跟著公開列表送給每個訪客）", async () => {
    const r = await saveMyProfileAction({ photoUrl: photo(320_000) });
    expect(r).toEqual({ ok: false, error: "照片太大（壓縮後仍超過 300KB）" });
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("非 dataURL 的照片值擋下", async () => {
    const r = await saveMyProfileAction({ photoUrl: "https://evil.example/x.jpg" });
    expect(r).toEqual({ ok: false, error: "照片格式不正確" });
  });

  it("空字串照片＝移除，不是格式錯誤", async () => {
    expect(await saveMyProfileAction({ photoUrl: "" })).toEqual({ ok: true });
    expect(asMock(saveProfile).mock.calls[0][1].photoUrl).toBeNull();
  });

  it("自我介紹超過 1000 字擋下", async () => {
    const r = await saveMyProfileAction({ bio: "字".repeat(1001) });
    expect(r).toEqual({ ok: false, error: "自我介紹太長（上限 1000 字）" });
  });

  it("年資取整並夾在合理範圍，負數視為未填", async () => {
    await saveMyProfileAction({ yearsExp: 8.6 });
    expect(asMock(saveProfile).mock.calls[0][1].yearsExp).toBe(9);
    vi.clearAllMocks();
    await saveMyProfileAction({ yearsExp: -3 });
    expect(asMock(saveProfile).mock.calls[0][1].yearsExp).toBeNull();
    vi.clearAllMocks();
    await saveMyProfileAction({ yearsExp: 999 });
    expect(asMock(saveProfile).mock.calls[0][1].yearsExp).toBe(80);
  });
});

describe("setPublishedAction", () => {
  it("只有管理員能下架", async () => {
    asMock(isAdmin).mockResolvedValue(false);
    expect(await setPublishedAction("c2", false)).toEqual({ ok: false, error: "沒有後台權限" });
    expect(setPublished).not.toHaveBeenCalled();
  });

  it("管理員可下架他人檔案", async () => {
    expect(await setPublishedAction("c2", false)).toEqual({ ok: true });
    expect(setPublished).toHaveBeenCalledWith("c2", false);
  });
});
