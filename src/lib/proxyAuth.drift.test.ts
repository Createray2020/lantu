import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ⚠️ 未登入導向不可以繞過 Clerk 的 dev-browser handshake（2026/08/25 事故）。
 *
 * 這站用的是開發金鑰 pk_test：session 要先跑一趟 handshake 才建立得起來。
 * 曾經把 proxy 寫成「`auth()` 拿不到 userId 就自己 NextResponse.redirect 到 /login」，
 * 結果 handshake 永遠不會發生 —— 瀏覽器端的 Clerk 認為已登入、把人送回受保護頁，
 * middleware 又說 signed-out 再導去 /login，**新註冊的教練當場卡進無限迴圈**。
 * 線上證據：`x-clerk-auth-reason: dev-browser-missing` ＋ `x-clerk-auth-status: signed-out`。
 *
 * 正解是 `auth.protect({ unauthenticatedUrl })`：handshake 仍由 Clerk 處理，
 * 只有真的未登入才吃我們指定的導向。
 *
 * 這支測試不驗行為驗寫法 —— 迴圈只在「真的有人用新帳號登入」時才會發生，
 * 任何自動化測試都不會紅，只有使用者會卡住。
 */
const SRC = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
/** 只看實際程式碼：註解裡就寫著「不可以 NextResponse.redirect」，不剝掉的話這支測試會咬自己。 */
const CODE = SRC.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("proxy 的未登入處理", () => {
  it("用 auth.protect 的 unauthenticatedUrl，不自己 redirect", () => {
    expect(CODE).toContain("unauthenticatedUrl");
    expect(CODE, "自己導向會吃掉 dev-browser handshake，新帳號會卡進無限迴圈").not.toContain("NextResponse.redirect");
  });

  it("導向的是 /login 並帶回原路徑", () => {
    expect(CODE).toMatch(/\/login\?redirect_url=/);
  });

  it("API 路由維持 auth.protect()（不導向 HTML 登入頁）", () => {
    expect(CODE).toContain("isApiRoute");
  });

  it("教練申請的公開入口還在（未登入要進得了 /apply → /sign-up）", () => {
    expect(CODE).toMatch(/'\/apply'/);
  });
});
