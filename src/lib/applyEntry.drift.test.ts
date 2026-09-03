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

  it("⚠️ /apply 由 auth.protect 守，且未登入時導去教練註冊", () => {
    const proxy = R("src/proxy.ts");
    // 兩件事都要成立，少一件就會出事：
    //  · 不能是公開路由 —— 公開路由不跑 dev-browser handshake（本站是 pk_test 開發金鑰），
    //    auth() 會對「其實已登入」的人回 null，把有帳號的人送去註冊新帳號、永遠繞不出來。
    //  · 未登入的落點必須是 /sign-up（教練註冊），不是 /login —— 那裡的註冊連結是客戶註冊，
    //    新教練會辦錯身分。
    expect(proxy).toContain("isApplyEntry");
    expect(proxy).toMatch(/unauthenticatedUrl:\s*new URL\('\/sign-up'/);
    const publicBlock = proxy.slice(proxy.indexOf("isPublicRoute"), proxy.indexOf("isApiRoute"));
    expect(publicBlock, "/apply 不可以列在公開路由裡").not.toMatch(/'\/apply'/);
  });

  it("教練註冊完要落在申請頁，不是直接進教練端", () => {
    expect(R("src/app/sign-up/[[...sign-up]]/page.tsx")).toContain('fallbackRedirectUrl="/dashboard/apply"');
  });

  it("申請頁未登入時導向 /login（/sign-in 是沒有入口的孤兒頁）", () => {
    expect(R("src/app/dashboard/apply/page.tsx")).toContain("/login?redirect_url=/dashboard/apply");
  });

  it("⚠️⚠️ 客戶端首頁要有報聘入口（登入之後唯一走得到的那條路）", () => {
    // 2026/09/02 Ray 回報：「教練要報聘但是沒有路徑，只能一直被登記為客戶登入。」
    // 真因不是表單壞了——/dashboard/apply 對只有客戶身分的帳號一直是通的。
    // 真因是**指向它的連結全在登入前的官網**（LandingView 的「加入我們」、/login 頁腳兩行小字），
    // 而 `/` 對已登入的人直接 redirect 到 /portal，客戶介面裡一條都沒有。
    // 想報聘的人一註冊就落在客戶身分，然後永遠找不到入口。上面那些測試一條都不會紅。
    const portal = R("src/app/portal/page.tsx");
    expect(portal, "客戶端首頁要引入報聘入口區塊").toContain("CoachEntry");
    const entry = R("src/app/portal/CoachEntry.tsx");
    expect(entry, "報聘入口要真的連到申請頁").toMatch(/href="\/dashboard\/apply"/);
    // 頁首那顆按鈕也要在（首屏就看得到，不用捲到底）。
    expect(portal).toMatch(/href="\/dashboard\/apply"/);
  });

  it("⚠️ 待審中的人在客戶端不可以被標成「教練工作台」", () => {
    // status !== 'active' 的人進 /dashboard 只會撞到 PendingNotice。
    // 標成「工作台」等於給一顆進不去的門，使用者只會以為系統壞了。
    const portal = R("src/app/portal/page.tsx");
    expect(portal).toContain('coachState === "active"');
    expect(portal).toContain("報聘審核中");
    expect(portal).not.toMatch(/const isCoach\b/);
  });

  it("⚠️ 報聘三段進度只有一份實作（教練端與客戶端吃同一支純函式）", () => {
    // 兩邊各抄一份的話，「直接申請沒有推薦人那一關」這個條件漏掉一邊就會出現
    // 永遠灰著的「等待推薦人確認」——而畫面上完全看不出是 bug。
    expect(R("src/lib/coachApply.ts")).toContain("export function applySteps");
    expect(R("src/app/dashboard/PendingNotice.tsx")).toContain("applySteps");
    expect(R("src/app/portal/CoachEntry.tsx")).toContain("applySteps");
  });
});

describe("申請表單收得到後台審核要用的資料", () => {
  const form = R("src/app/dashboard/apply/ApplyForm.tsx");

  it("欄位都在（2026/08/31：sponsorCode 改名 introducerCode，另加動機／經歷／證照／聲明）", () => {
    // 表單自己畫的欄位
    for (const k of ["name", "phone", "introducerCode", "licenses", "consents"]) {
      expect(form, `申請表單少了 ${k}`).toContain(k);
    }
    // 自述欄是由 APPLY_TEXT_FIELDS 逐項展開的，所以它們的真身在純函式那一支。
    const lib = R("src/lib/coachApply.ts");
    for (const k of ["currentJob", "motive", "experience"]) {
      expect(lib, `自述欄少了 ${k}`).toContain(k);
    }
    expect(form).toContain("APPLY_TEXT_FIELDS");
  });

  it("報聘路線是表單的第一段（選了路線才知道要不要填推薦人）", () => {
    expect(form).toContain("APPLY_ROUTES");
    expect(form).toContain("needsIntroducer");
  });

  it("⚠️ 送出前的檢核與 server action 吃同一份純函式", () => {
    // 只擋前端等於沒擋：表單用 canSubmit/missingFields 決定按鈕能不能按，
    // server action 也必須再跑一次同一支。
    expect(form).toContain("missingFields");
    expect(R("src/app/dashboard/apply/actions.ts")).toContain("canSubmit");
  });

  it("教練推薦的申請要有人確認得了（推薦人端的入口）", () => {
    const page = R("src/app/dashboard/requests/page.tsx");
    expect(page).toContain("listPendingIntroductions");
    expect(page).toContain("報聘確認");
  });

  it("⚠️ 核准報聘一律走閘門，不是直接 status='active'", () => {
    // 舊版 approveCoach 只做 setStatus(id,'active')，職級／推薦人／期限全靠人事後補。
    const actions = R("src/app/admin/actions.ts");
    expect(actions).toContain("approveApplication");
    expect(actions).not.toMatch(/export async function approveCoach[\s\S]{0,120}setStatus\(id, "active"\)/);
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
    expect(admin).toContain("c.note");       // 舊帳號的申請資料還壓在 note 裡
    expect(admin).toContain("ReviewPanel");  // 新帳號的完整報聘表＋檢核表（推薦人印在裡面）
  });

  it("⚠️ 推薦人只有一個欄位（2026/09/03 合併）", () => {
    // 合併前 coaches 有兩欄：uplineId（組織位置）與 sponsorId（號稱業績歸屬）。
    // 後者全站沒有任何計算讀它 —— 分潤鏈 resolveChain() 只沿 uplineId 爬，連代管都是跳層做的 ——
    // 但後台有兩個獨立的編輯入口，改錯一個不會有任何提示，只會讓兩份「推薦人」默默分岔。
    // 再長出第二個欄位就是同一個坑，所以在這裡釘死。
    expect(R("src/Shared/db/schema.ts")).not.toContain("sponsor_id");
    expect(R("src/lib/comp/chain.ts")).not.toContain("sponsorId");
  });
});
