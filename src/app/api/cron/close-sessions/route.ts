// 諮詢場次：隔天自動封場。
//
// 忘記按「結束並產摘要」是必然會發生的——諮詢完客戶要走了，教練在收東西、約下次時間，
// 沒有人會記得回頭按一下。所以這支存在的唯一目的是：
// **忘記按結束絕不能造成資料損失**，最多只是那一場的摘要沒被人工整理過。
//
// 刻意「只封場、不產 review」：沒有人整理過、沒有人勾過「客戶可見」的內容，
// 不該自動變成一份正式的諮詢紀錄躺在客戶的時間軸上。
//
// 授權同 comp-recompute：Vercel Cron 帶 Bearer $CRON_SECRET，沒設就一律拒絕。
import { autoCloseStaleSessions } from "@/lib/consultSession";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const closed = await autoCloseStaleSessions(20);
  return Response.json({ ok: true, closed });
}
