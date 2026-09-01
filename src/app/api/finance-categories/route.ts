// 收支資債細類 + 教育費用參數 + 生育費用參數 + 企業稅務法規常數：iframe app（public/lantu-app.html）載入時抓一次。
// 公開（見 proxy.ts）：類別名稱、學費參數與稅率都不是客戶資料，且 app 在登入前的客戶端也會用到。
// 每一份都有 unstable_cache（tag: finance-categories / edu-costs / birth-costs / biz-tax / ins-products / an-defaults），
// 後台一存伺服器端就即時生效，所以這裡可以放心給短快取。
// ⚠️ 但 max-age 是**邊緣快取**（Vercel CDN 會照這個數字 HIT，updateTag 打不到它）——
//    2026/08/25 實測：後台存完，這支 API 仍會回舊值直到 age 超過 max-age。
//    原本是 300 秒，對「後台改完想馬上看到」太久；降成 60 秒。
//    降這個數字幾乎不花成本：回源時 unstable_cache 還在，根本不會多打 DB。
import { getCategoryPayload } from "@/lib/financeCategories";
import { getEduCosts } from "@/lib/eduCosts";
import { getBirthCostPayload } from "@/lib/birthCosts";
import { getBizTaxPayload } from "@/lib/bizTaxParams";
import { getInsProductPayload } from "@/lib/insProducts";
import { getAnDefaultPayload } from "@/lib/anDefaults";
import { getClientDashPayload } from "@/lib/clientDashStore";

export const dynamic = "force-dynamic";

export async function GET() {
  // an＝分析頁模組的全平台預設順序（後台 /admin/analysis 維護）。
  // 搭這班車而不是另開一支 API：iframe 本來就在載入時抓這一包、抓到再 render()，
  // 多開一支等於多一次往返，還要多維護一條公開路由。
  // dash＝客戶財務儀表板的顯示開關（後台 /admin/client-view 維護）。同上，搭同一班車。
  const [cats, edu, biz, ins, an, birth, dash] = await Promise.all([
    getCategoryPayload(), getEduCosts(), getBizTaxPayload(), getInsProductPayload(), getAnDefaultPayload(),
    getBirthCostPayload(), getClientDashPayload(),
  ]);
  return Response.json(
    { cats, edu, biz, ins, an, birth, dash },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=3600" } },
  );
}
