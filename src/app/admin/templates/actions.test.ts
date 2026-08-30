import { describe, it, expect, vi, beforeEach } from "vitest";

// 後台範本 actions。守四件事：
//   1. 每一支都先過管理員閘（真正的底線在 lib/templates.ts 的 assertAdmin()，
//      這裡是同一件事再擋一次，理由見 actions.ts 檔頭）。
//   2. action 層沒有偷偷繞過資料層（每一支都真的呼叫對應的函式）。
//   3. 明顯壞掉的輸入在進資料層之前就擋掉（空名稱、離譜的年度）。
//   4. 內容自動存檔**不 revalidate 內容頁**——打字時重新渲染會把 iframe 重掛、游標跳掉。
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/coach", () => ({ ensureCoach: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/templates", () => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  purgeTemplate: vi.fn(),
  setTemplateArchived: vi.fn(),
  reorderTemplates: vi.fn(),
  addTemplatePlan: vi.fn(),
  updateTemplatePlan: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  addTemplatePlan,
  createTemplate,
  purgeTemplate,
  setTemplateArchived,
  reorderTemplates,
  updateTemplate,
  updateTemplatePlan,
} from "@/lib/templates";
import {
  addTemplatePlanAction,
  createTemplateAction,
  purgeTemplateAction,
  setTemplateArchivedAction,
  reorderTemplatesAction,
  saveTemplatePlanAction,
  updateTemplateAction,
} from "./actions";

const asMock = (f: unknown) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  asMock(ensureCoach).mockResolvedValue({ id: "admin1", status: "active" });
  asMock(isAdmin).mockResolvedValue(true);
  asMock(createTemplate).mockResolvedValue("t1");
  asMock(addTemplatePlan).mockResolvedValue("p1");
});

// ⚠️ 範本是全公司共用的展示素材：一位普通教練改得動它，等於改得動每個人的畫面。
describe("管理員閘", () => {
  it("非管理員：七支全部擋下，資料層一支都沒被呼叫到", async () => {
    asMock(isAdmin).mockResolvedValue(false);
    const calls = [
      createTemplateAction({ name: "x" }),
      updateTemplateAction("t1", { name: "y" }),
      setTemplateArchivedAction("t1", true),
      purgeTemplateAction("t1"),
      reorderTemplatesAction(["a", "b"]),
      addTemplatePlanAction("t1", 2026),
      saveTemplatePlanAction("p1", { a: 1 }),
    ];
    for (const r of await Promise.all(calls)) {
      expect(r).toEqual({ ok: false, error: "沒有後台權限" });
    }
    for (const fn of [createTemplate, updateTemplate, setTemplateArchived, purgeTemplate, reorderTemplates, addTemplatePlan, updateTemplatePlan]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("建立與編輯", () => {
  it("建立成功回新範本的 id", async () => {
    expect(await createTemplateAction({ name: "雙薪育兒家庭" })).toEqual({ ok: true, id: "t1" });
  });

  it("名稱前後空白會被修掉，不會建出一份叫「 」的範本", async () => {
    await createTemplateAction({ name: "  單身上班族  " });
    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: "單身上班族" }));
  });

  it("空名稱擋在資料層之前——清單上出現一列沒有標題的東西，誰都認不出那是什麼", async () => {
    expect(await createTemplateAction({ name: "   " })).toEqual({ ok: false, error: "請填範本名稱" });
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it("改名稱同樣不准清空", async () => {
    expect(await updateTemplateAction("t1", { name: "" })).toEqual({ ok: false, error: "請填範本名稱" });
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("沒帶 name 的局部更新（例如只改客群標籤）不受名稱檢查影響", async () => {
    expect(await updateTemplateAction("t1", { templateLabel: "35 歲、兩個小孩" })).toEqual({ ok: true });
    expect(updateTemplate).toHaveBeenCalledWith("t1", { templateLabel: "35 歲、兩個小孩" });
  });

  it("資料層丟 forbidden（非管理員）時翻成中文，不是原始字串", async () => {
    asMock(createTemplate).mockRejectedValue(new Error("forbidden"));
    expect(await createTemplateAction({ name: "x" })).toEqual({ ok: false, error: "沒有後台權限" });
  });
});

describe("下架與排序", () => {
  it("下架是狀態切換、不是刪除，並讓教練端清單一起更新", async () => {
    expect(await setTemplateArchivedAction("t1", true)).toEqual({ ok: true });
    expect(setTemplateArchived).toHaveBeenCalledWith("t1", true);
    expect(purgeTemplate, "下架不可以順手真刪").not.toHaveBeenCalled();
    // 剛下架的範本不該還留在別人的清單上
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/clients");
  });

  it("重新上架走同一支，只是換一個布林", async () => {
    expect(await setTemplateArchivedAction("t1", false)).toEqual({ ok: true });
    expect(setTemplateArchived).toHaveBeenCalledWith("t1", false);
  });

  it("永久刪除是另一支——按錯一顆按鈕不會讓整份範本消失", async () => {
    expect(await purgeTemplateAction("t1")).toEqual({ ok: true });
    expect(purgeTemplate).toHaveBeenCalledWith("t1");
  });

  it("重排把整串順序一次送出（不是逐筆送，中途斷掉會留下兩份同號）", async () => {
    await reorderTemplatesAction(["a", "b", "c"]);
    expect(reorderTemplates).toHaveBeenCalledWith(["a", "b", "c"]);
  });
});

describe("新增年度版本", () => {
  it("成功回 planId，讓前端直接跳進去編", async () => {
    expect(await addTemplatePlanAction("t1", 2026)).toEqual({ ok: true, planId: "p1" });
    expect(addTemplatePlan).toHaveBeenCalledWith("t1", 2026, null);
  });

  it("年度是唯一鍵的一部分，不是自由文字：離譜的值擋在資料層之前", async () => {
    for (const bad of [0, 26, 99999, Number.NaN]) {
      const r = await addTemplatePlanAction("t1", bad);
      expect(r.ok).toBe(false);
    }
    expect(addTemplatePlan).not.toHaveBeenCalled();
  });

  it("找不到範本（或那個 id 其實是一般客戶）時給看得懂的話", async () => {
    asMock(addTemplatePlan).mockRejectedValue(new Error("template-not-found"));
    expect(await addTemplatePlanAction("nope", 2026)).toEqual({
      ok: false,
      error: "找不到這份範本（可能已經下架了）",
    });
  });
});

describe("內容自動存檔", () => {
  it("寫回範本內容", async () => {
    const data = { profile: { name: "示範" } };
    expect(await saveTemplatePlanAction("p1", data)).toEqual({ ok: true });
    expect(updateTemplatePlan).toHaveBeenCalledWith("p1", data);
  });

  // ⚠️ 這一題守的是「打字時游標會不會跳掉」：revalidate 會讓整頁重新渲染、
  //    iframe 重掛，使用者正在填的欄位就失焦了。
  it("存檔不 revalidate 任何路徑", async () => {
    await saveTemplatePlanAction("p1", { a: 1 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("格式不對時回看得懂的理由（資料層的 bad-plan-data）", async () => {
    asMock(updateTemplatePlan).mockRejectedValue(new Error("bad-plan-data"));
    expect(await saveTemplatePlanAction("p1", null)).toEqual({
      ok: false,
      error: "這份規劃內容的格式不對，沒有存進去",
    });
  });
});
