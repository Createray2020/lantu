import { describe, it, expect, vi } from "vitest";
import type React from "react";

/**
 * 學習區模組閘（2026/09/09 Ray：先關閉學習區，架設完成後再打開）。
 *
 * ⚠️ 藏入口與擋頁面是兩件事，這裡兩件都釘：
 *    頂欄不出現「學習區」＝不引導；直接打網址看到建置中說明＝真的擋住。
 *    只做前者的話，舊書籤與已經開著的分頁照樣進得去。
 */
const mod = vi.hoisted(() => ({ on: false }));

vi.mock("@/lib/platformModules", () => ({
  isModuleOn: async () => mod.on,
  moduleNotice: async () => "學習區正在建置中，課程與教材準備好之後會開放。",
}));
vi.mock("@/lib/coach", () => ({
  ensureCoach: async () => ({ id: "fc1", name: "李教練", status: "active", uiScale: 100, theme: "dark" }),
  isAdmin: async () => false,
}));
vi.mock("@/lib/learn", () => ({
  listCoursesFor: async () => [
    { id: "c1", title: "財務教練基礎", category: "必修", summary: "", coverUrl: null, trainingHours: 2, lessonCount: 3, doneCount: 0, completed: false },
  ],
}));
vi.mock("@/app/dashboard/headerProps", () => ({
  headerProps: async () => ({ isAdmin: false, uiScale: 100, theme: "dark", license: { expired: false, daysLeft: 120, until: null }, learnOn: mod.on }),
}));
vi.mock("next/navigation", () => ({
  redirect: () => { throw new Error("redirected"); },
  usePathname: () => "/dashboard/learn",
}));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));

async function render() {
  const [{ default: LearnPage }, { renderToStaticMarkup }] = await Promise.all([
    import("@/app/dashboard/learn/page"),
    import("react-dom/server"),
  ]);
  const el = await (LearnPage as unknown as () => Promise<React.ReactElement>)();
  return renderToStaticMarkup(el);
}

describe("學習區關閉時", () => {
  it("看到建置中說明，看不到任何課程", async () => {
    mod.on = false;
    const html = await render();
    expect(html).toContain("學習區建置中");
    expect(html).toContain("課程與教材準備好之後會開放");
    expect(html).not.toContain("財務教練基礎");
  });

  it("頂欄不出現學習區入口（不是 404、也不是踢回首頁）", async () => {
    mod.on = false;
    const html = await render();
    expect(html).not.toContain('href="/dashboard/learn"');
    expect(html).toContain('href="/dashboard/clients"'); // 其他分頁照舊
  });
});

describe("學習區開啟時", () => {
  it("課程列表與頂欄入口都回來", async () => {
    mod.on = true;
    const html = await render();
    expect(html).toContain("財務教練基礎");
    expect(html).toContain('href="/dashboard/learn"');
    expect(html).not.toContain("學習區建置中");
  });
});
