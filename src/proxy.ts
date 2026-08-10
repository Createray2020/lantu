// Next.js 16：Middleware 更名為 Proxy。Clerk 授權入口。
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// 公開路由：首頁與登入/註冊；其餘一律需登入。
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/version',
  '/api/brand(.*)', // 品牌 logo/icon 讀取：favicon、PWA、iframe app 需匿名可讀
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
