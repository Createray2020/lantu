import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { claimPath, maskName, parseClaimCode, formatClaimCode, shareJoinUrl, afterAuthPath, isJoinCode, joinCodeFrom, joinPath, redeemPath } from "./joinFlow";

describe("邀請碼跨過註冊流程（2026/10/29 徐醫師事故）", () => {
  it("邀請連結回來改走 /portal/redeem；其他路徑照舊；壞碼不算", () => {
    expect(afterAuthPath("/portal/join?code=ynhcjvftei8wsc")).toBe("/portal/claim?code=ynhcjvftei8wsc");
    expect(claimPath()).toBe("/portal/claim");
    expect(afterAuthPath("/portal/passport?restore=1")).toBe("/portal/passport?restore=1");
    expect(afterAuthPath(undefined)).toBeUndefined();
    expect(joinCodeFrom("/portal/join?code=<script>")).toBeNull();
    expect(isJoinCode("abc")).toBe(false);
    expect(redeemPath("abc123")).toBe("/portal/claim?code=abc123");
    expect(shareJoinUrl("https://x.com", "abc123")).toBe("https://x.com/portal/join?code=abc123&openExternalBrowser=1");
    expect(joinPath("abc123", true)).toBe("/portal/join?code=abc123&done=1");
  });
});

describe("開通碼格式", () => {
  it("客戶編號-6 位數；容錯全形、空白、各種連字號、沒打連字號；月份不對、位數不對都不收", () => {
    expect(parseClaimCode("2610008-483921")).toEqual({ clientCode: "2610008", pin: "483921" });
    expect(parseClaimCode(" 2610008 — 483921 ")).toEqual({ clientCode: "2610008", pin: "483921" });
    expect(parseClaimCode("２６１０００８－４８３９２１")).toEqual({ clientCode: "2610008", pin: "483921" });
    expect(parseClaimCode("2610008483921")).toEqual({ clientCode: "2610008", pin: "483921" });
    expect(parseClaimCode("26101000-483921")).toEqual({ clientCode: "26101000", pin: "483921" });
    expect(parseClaimCode("2613008-483921")).toBeNull();
    expect(parseClaimCode("2610008-48392")).toBeNull();
    expect(parseClaimCode("FC2610008-483921")).toBeNull();
    expect(formatClaimCode("2610008", "000123")).toBe("2610008-000123");
  });
  it("確認頁的名字只露頭尾", () => {
    expect(maskName("徐浩恩")).toBe("徐○恩");
    expect(maskName("王明")).toBe("王○");
    expect(maskName("歐陽娜娜")).toBe("歐○○娜");
    expect(maskName(null)).toBe("");
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
    expect(R("src/app/portal/join/page.tsx")).toContain("redirect(claimPath(code))");
    expect(R("src/proxy.ts")).toContain("'/portal/claim'");
    // 綁定只發生在認領頁按「確認接上」：confirmClaimAction 清 cookie＋redeemInvite
    const act = R("src/app/portal/claim/actions.ts");
    expect(act).toContain("delete(JOIN_COOKIE)");
    expect(act).toContain("redeemInvite(code, user)");
  });
});
