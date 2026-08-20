// 收支資債細類 + 教育費用參數：iframe app（public/lantu-app.html）載入時抓一次。
// 公開（見 proxy.ts）：類別名稱與學費參數都不是客戶資料，且 app 在登入前的客戶端也會用到。
// 兩份都有 unstable_cache（tag: finance-categories / edu-costs），後台一存就即時生效，
// 所以這裡可以放心給瀏覽器短快取。
import { getCategoryPayload } from "@/lib/financeCategories";
import { getEduCosts } from "@/lib/eduCosts";

export const dynamic = "force-dynamic";

export async function GET() {
  const [cats, edu] = await Promise.all([getCategoryPayload(), getEduCosts()]);
  return Response.json(
    { cats, edu },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
