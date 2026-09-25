import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_NAV, LOGIN_ID, MAX_ITEMS, isSafeExternalUrl, itemProblem, sanitizeNav, visibleNav, type NavItem,
} from "@/lib/siteNav";

// 官網頂欄（後台可編輯，2026/09/26）。
const ext = (p: Partial<NavItem> = {}): NavItem => ({
  id: "x1", text: "近期講座", kind: "ext", href: "https://www.accupass.com/event/1", newTab: true,
  style: "text", on: true, mobile: false, ...p,
});

describe("外部網址只收 https", () => {
  it.each([
    ["https://www.accupass.com/event/1", true],
    ["https://line.me/R/ti/p/%40088janyq", true],
    ["http://example.com", false],
    ["javascript:alert(1)", false],
    ["JavaScript:alert(1)", false],
    ["https://", false],
    ["https://localhost", false],
    ["https://a b.com", false],
    ["data:text/html,<script>", false],
  ])("%s → %s", (u, ok) => expect(isSafeExternalUrl(u)).toBe(ok));
});

describe("sanitizeNav", () => {
  it("沒有資料＝預設頂欄（與改版前相同）", () => {
    expect(sanitizeNav(null)).toEqual(DEFAULT_NAV);
    expect(sanitizeNav(undefined).map((i) => i.text)).toEqual(["認識教練", "登入", "免費試算"]);
  });

  it("危險網址與不在白名單的站內路徑整項丟掉，其他項目保留", () => {
    const out = sanitizeNav([
      ext({ id: "a", href: "javascript:alert(1)" }),
      ext({ id: "b" }),
      { id: "c", text: "壞站內", kind: "int", href: "/admin", style: "text", on: true },
    ]);
    expect(out.map((i) => i.id)).toEqual(["b", LOGIN_ID]);
  });

  it("登入一定存在、一定顯示、一定連 /login；只有文字、樣式、位置跟著存", () => {
    const out = sanitizeNav([
      { id: LOGIN_ID, text: "會員登入", kind: "ext", href: "https://evil.example.com", on: false, style: "primary" },
      ext({ id: "b" }),
    ]);
    const login = out.find((i) => i.id === LOGIN_ID)!;
    expect(out[0].id).toBe(LOGIN_ID);
    expect(login).toMatchObject({ text: "會員登入", href: "/login", kind: "int", on: true, locked: true, style: "primary" });
    // 整個被刪掉也會補回來
    expect(sanitizeNav([ext()]).some((i) => i.id === LOGIN_ID)).toBe(true);
  });

  it("文字截在 10 字、重複 id 只留一個、最多 8 項", () => {
    const many = Array.from({ length: 12 }, (_, i) => ext({ id: `i${i}`, text: `項目${i}一二三四五六七八九` }));
    const out = sanitizeNav([...many, ext({ id: "i0" })]);
    expect(out.length).toBe(MAX_ITEMS);
    expect(out[0].text.length).toBeLessThanOrEqual(10);
    expect(new Set(out.map((i) => i.id)).size).toBe(out.length);
  });

  it("站內頁面不開新分頁；關掉的項目不出現在官網", () => {
    const out = sanitizeNav([{ id: "c", text: "教練", kind: "int", href: "/coaches", newTab: true, on: false }]);
    expect(out[0].newTab).toBe(false);
    expect(visibleNav(out).map((i) => i.id)).toEqual([LOGIN_ID]);
  });
});

describe("itemProblem 給後台看得懂的提示", () => {
  it("沒填文字、網址不對都會說清楚", () => {
    expect(itemProblem(ext({ text: " " }))).toMatch(/顯示文字/);
    expect(itemProblem(ext({ href: "www.abc.com" }))).toMatch(/https:\/\//);
    expect(itemProblem(ext())).toBeNull();
  });
});

describe("官網頂欄接線", () => {
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  it("官網首頁用 SiteHeader，不再自己寫死頂欄", () => {
    expect(src("components/LandingView.tsx")).toContain("<SiteHeader />");
  });
  it("存檔 action 只認後台權限", () => {
    expect(src("app/admin/site-nav/actions.ts")).toMatch(/isAdmin\(me\)/);
  });
  it("後台導覽有入口", () => {
    expect(src("app/admin/AdminNav.tsx")).toContain('"/admin/site-nav"');
  });
});
