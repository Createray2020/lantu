// 全組織品牌讀取：頂欄 / 報告書 / iframe app 皆 fetch 此路由套用 logo。
// 公開（見 proxy.ts）；非敏感資料。
// getBrand() 本身有 unstable_cache（tag: brand），上傳/移除 logo 時 revalidateTag 讓它即時生效，
// 所以這裡可以放心給瀏覽器短快取，不必每次導頁都打 2 趟 DB＋重傳數 MB base64。
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function GET() {
  const brand = await getBrand();
  return Response.json(brand, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
