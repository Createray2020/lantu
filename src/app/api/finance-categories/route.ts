// 收支資債細類 + 教育費用參數 + 企業稅務法規常數：iframe app（public/lantu-app.html）載入時抓一次。
// 公開（見 proxy.ts）：類別名稱、學費參數與稅率都不是客戶資料，且 app 在登入前的客戶端也會用到。
// 三份都有 unstable_cache（tag: finance-categories / edu-costs / biz-tax），後台一存就即時生效，
// 所以這裡可以放心給瀏覽器短快取。
import { getCategoryPayload } from "@/lib/financeCategories";
import { getEduCosts } from "@/lib/eduCosts";
import { getBizTaxPayload } from "@/lib/bizTaxParams";
import { getInsProductPayload } from "@/lib/insProducts";
import { getAnDefaultPayload } from "@/lib/anDefaults";

export const dynamic = "force-dynamic";

export async function GET() {
  // an＝分析頁模組的全平台預設順序（後台 /admin/analysis 維護）。
  // 搭這班車而不是另開一支 API：iframe 本來就在載入時抓這一包、抓到再 render()，
  // 多開一支等於多一次往返，還要多維護一條公開路由。
  const [cats, edu, biz, ins, an] = await Promise.all([
    getCategoryPayload(), getEduCosts(), getBizTaxPayload(), getInsProductPayload(), getAnDefaultPayload(),
  ]);
  return Response.json(
    { cats, edu, biz, ins, an },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
