import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 「新進教練申請」這條動線的漂移測試。
 *
 * 2026/08/25 盤查發現：申請流程的每一頁都在（/sign-up → /dashboard/apply → 後台核准），
 * 但**全站沒有任何一個連結指向它**——只有知道網址的人進得來，而且畫面上完全看不出來
 * 少了什麼。這種「頁面還在、路斷了」的壞法，功能測試一條都不會紅。
 *
 * 所以這裡驗的是整條鏈的接點，一段一段釘住。
 */

const R = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("申請入口的每一段都要接得上", () => {
  it("招募頁 /join 有一顆通往 /apply 的按鈕", () => {
    expect(R("src/app/join/page.tsx")).toMatch(/href="\/apply"/);
  });

  it("登入頁也給得出直接申請的路（不是只有客戶註冊）", () => {
    expect(R("src/app/login/page.tsx")).toMatch(/href="\/apply"/);
  });

  it("/apply 會依登入狀態分岔到註冊或申請頁", () => {
    const src = R("src/app/apply/page.tsx");
    expect(src).toContain("/dashboard/apply");
    expect(src).toContain("/sign-up");
  });

  it("⚠️ /apply 必須是公開路由", () => {
    // 不公開的話未登入者會先被丟去 /login，而那裡的註冊連結是**客戶**註冊：
    // 新教練會辦成客戶帳號，然後永遠找不到申請頁。
    expect(R("src/proxy.ts")).toMatch(/'\/apply'/);
  });

  it("教練註冊完要落在申請頁，不是直接進教練端", () => {
    expect(R("src/app/sign-up/[[...sign-up]]/page.tsx")).toContain('fallbackRedirectUrl="/dashboard/apply"');
  });

  it("申請頁未登入時導向 /login（/sign-in 是沒有入口的孤兒頁）", () => {
    expect(R("src/app/dashboard/apply/page.tsx")).toContain("/login?redirect_url=/dashboard/apply");
  });
});

describe("申請表單收得到後台審核要用的資料", () => {
  const form = R("src/app/dashboard/apply/ApplyForm.tsx");

  it("四個欄位都在", () => {
    for (const k of ["name", "phone", "currentJob", "sponsorCode"]) {
      expect(form, `申請表單少了 ${k}`).toContain(k);
    }
  });

  it("⚠️ 自填姓名寫 display_name，不是 coaches.name", () => {
    // coaches.name 是 Clerk 鏡像，ensureCoach() 每次導頁都會蓋回去——
    // 寫錯欄位的話，申請人填的名字會在他第一次登入後憑空消失。
    const coach = R("src/lib/coach.ts");
    expect(coach).toMatch(/displayName: selfName/);
    expect(coach).not.toMatch(/name: selfName/);
  });

  it("後台名冊印得出申請資料與推薦人", () => {
    const admin = R("src/app/admin/page.tsx");
    expect(admin).toContain("c.note");
    expect(admin).toContain("c.sponsorId");
  });
});
