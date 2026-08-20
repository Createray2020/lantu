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
  '/join', // 招募頁：對外公開，訪客要看得到
  '/api/version',
  '/api/brand(.*)', // 品牌 logo/icon 讀取：favicon、PWA、iframe app 需匿名可讀
  // 收支資債細類字典與教育費用參數：iframe app 一載入就抓，客戶端未登入頁面也會用到。
  // 內容是設定值而非客戶資料，公開讀取無虞。
  '/api/finance-categories',
  // Vercel Cron：帶的是 Bearer CRON_SECRET 不是 Clerk session，
  // 走 auth.protect() 會被 401。路由自己驗 CRON_SECRET，沒設就一律拒絕。
  '/api/cron(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // 跳過 Next 內部與靜態檔，除非出現在查詢參數
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // 一律對 API 路由執行
    '/(api|trpc)(.*)',
  ],
};
