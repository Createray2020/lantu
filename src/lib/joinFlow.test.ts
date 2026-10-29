import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shareJoinUrl, afterAuthPath, isJoinCode, joinCodeFrom, joinPath, redeemPath } from "./joinFlow";

describe("邀請碼跨過註冊流程（2026/10/29 徐醫師事故）", () => {
  it("邀請連結回來改走 /portal/redeem；其他路徑照舊；壞碼不算", () => {
    expect(afterAuthPath("/portal/join?code=ynhcjvftei8wsc")).toBe("/portal/redeem?code=ynhcjvftei8wsc");
    expect(afterAuthPath("/portal/passport?restore=1")).toBe("/portal/passport?restore=1");
    expect(afterAuthPath(undefined)).toBeUndefined();
    expect(joinCodeFrom("/portal/join?code=<script>")).toBeNull();
    expect(isJoinCode("abc")).toBe(false);
    expect(redeemPath("abc123")).toBe("/portal/redeem?code=abc123");
    expect(shareJoinUrl("https://x.com", "abc123")).toBe("https://x.com/portal/join?code=abc123&openExternalBrowser=1");
    expect(joinPath("abc123", true)).toBe("/portal/join?code=abc123&done=1");
  });
});

describe("流程掛點（drift）", () => {
  const R = (p: string) => readFileSync(p, "utf8");
  it("proxy：/portal/redeem 在公開路由判斷之前就 auth.protect；結果頁 done=1 不寫 cookie", () => {
    const s = R("src/proxy.ts");
    expect(s.indexOf("isRedeem(req)")).toBeGreaterThan(-1);
    expect(s.indexOf("isRedeem(req)")).toBeLessThan(s.indexOf("isPublicRoute(req)) return"));
    expect(s).toMatch(/get\('done'\) === '1'/);
  });
  it("客戶註冊／登入頁用 afterAuthPath；首頁／護照／setup 都會補兌換；join 頁已登入一律交給 redeem", () => {
    for (const p of ["src/app/client/sign-up/[[...sign-up]]/page.tsx", "src/app/client/sign-in/[[...sign-in]]/page.tsx"]) expect(R(p)).toContain("forceRedirectUrl={afterAuthPath(back)}");
    for (const p of ["src/app/portal/page.tsx", "src/app/portal/passport/page.tsx", "src/app/portal/setup/page.tsx"]) expect(R(p)).toContain("await redirectIfPendingJoin()");
    expect(R("src/app/portal/join/page.tsx")).toContain('if (sp.done !== "1") redirect(redeemPath(code))');
    expect(R("src/app/portal/redeem/route.ts")).toContain("JOIN_COOKIE");
  });
});
