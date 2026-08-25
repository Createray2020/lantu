// Next.js 16：Middleware 更名為 Proxy。Clerk 授權入口。
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// 公開路由：首頁與登入/註冊；其餘一律需登入。
const isPublicRoute = createRouteMatcher([
  '/',
  '/home', // 官網 landing 常駐公開路由（登入後也能回來看，不跳轉）
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/client/sign-in(.*)', // 客戶端登入入口
  '/client/sign-up(.*)', // 客戶端申請帳號入口
  // 客戶端頁面：middleware 不強制導向（會導到教練 /sign-in）；改由頁面內 ensureClientUser
  // 自行守門並導向 /client/sign-in，避免客戶被丟到教練登入。
  '/portal(.*)',
  '/coaches(.*)', // 官網公開教練頁：訪客要看得到，才有對外招客的意義
  // 官網公開試算：未登入就能玩完整人生護照。全程純前端計算、不寫任何後端資料
  // （所以不構成個資蒐集），按存檔才導去註冊。見 lib/passportDraft.ts。
  '/passport(.*)',
  // 官網公開試算（企業主版）：十題自我檢核。同樣全程純前端計算、不寫任何後端資料，
  // 按「開始規劃」才導去註冊。這是企業主客群的入場門，地位等同人生護照。
  '/bizcheck',
  '/join', // 招募頁：對外公開，訪客要看得到
  '/login', // 登入身分選擇頁（官網只有一顆登入，教練/客戶在這裡分流）
  '/api/version',
  '/api/brand(.*)', // 品牌 logo/icon 讀取：favicon、PWA、iframe app 需匿名可讀
  // 收支資債細類字典與教育費用參數：iframe app 一載入就抓，客戶端未登入頁面也會用到。
  // 內容是設定值而非客戶資料，公開讀取無虞。
  '/api/finance-categories',
  // Vercel Cron：帶的是 Bearer CRON_SECRET 不是 Clerk session，
  // 走 auth.protect() 會被 401。路由自己驗 CRON_SECRET，沒設就一律拒絕。
  '/api/cron(.*)',
]);

// API 路由不導向：把一個 fetch 導去 HTML 登入頁，呼叫端只會拿到看不懂的 200，
// 比乾脆的 401/404 更難查。頁面才導向。
const isApiRoute = createRouteMatcher(['/api(.*)', '/trpc(.*)']);

// 教練申請的對外短網址。**刻意不是公開路由**：
// 公開路由 clerkMiddleware 直接 return、不跑 dev-browser handshake，
// 於是頁面裡的 auth() 對「其實已登入」的人也拿不到 userId，就把他判成沒帳號、
// 送去 Clerk 的「Create your account」——已經有帳號的人在那裡永遠繞不出來
// （2026/08/25 錄影實錄：已登入的客戶帳號按「直接送出教練申請」後被丟去註冊頁）。
// 交給 auth.protect 就對了：它先完成 handshake，真的沒登入才吃 unauthenticatedUrl。
const isApplyEntry = createRouteMatcher(['/apply']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  if (isApiRoute(req)) {
    await auth.protect();
    return;
  }

  // 申請入口：沒帳號的人要去教練註冊（不是 /login——那裡的註冊連結是**客戶**註冊，
  // 新教練會辦錯身分）；已登入的人由 /apply 自己導去 /dashboard/apply。
  if (isApplyEntry(req)) {
    await auth.protect({ unauthenticatedUrl: new URL('/sign-up', req.url).toString() });
    return;
  }

  // 未登入的頁面請求 → 導去 /login 並帶回原本要去的位置。
  //
  // 為什麼要改掉預設行為：`auth.protect()` 對未登入者是「改寫成 404」，使用者看到的
  // 是一片找不到頁面，完全看不出「你只是登出了」。2026/08/22 一次部署把 session 洗掉，
  // 整個後台就變成 404 —— 系統其實好好的，但從畫面上完全判斷不出來。
  //
  // ⚠️⚠️ 但這件事**一定要交給 auth.protect 的 unauthenticatedUrl，不可以自己
  //      `auth()` 拿不到 userId 就 NextResponse.redirect**（2026/08/25 這樣寫過，
  //      新註冊的教練當場卡進無限迴圈）：
  //      這站的 Clerk 是開發金鑰 pk_test，session 要先跑一趟 **dev-browser handshake**
  //      才建立得起來。handshake 還沒跑的請求，middleware 看到的是
  //      `x-clerk-auth-reason: dev-browser-missing` ＋ `x-clerk-auth-status: signed-out`；
  //      自己把人導走的話 handshake 永遠不會發生，而瀏覽器端的 Clerk 認為已經登入、
  //      又把人送回受保護頁 → 導去 /login → 再送回來 → 無限迴圈。
  //      `auth.protect()` 內部會先完成 handshake，只有真的未登入才吃 unauthenticatedUrl。
  const back = req.nextUrl.pathname + req.nextUrl.search;
  await auth.protect({
    // /login 只接受站內路徑（它自己也會再驗一次 startsWith('/')）。
    unauthenticatedUrl: new URL(`/login?redirect_url=${encodeURIComponent(back)}`, req.url).toString(),
  });
});

export const config = {
  matcher: [
    // 跳過 Next 內部與靜態檔，除非出現在查詢參數
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // 一律對 API 路由執行
    '/(api|trpc)(.*)',
  ],
};
