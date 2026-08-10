// 全組織品牌讀取：頂欄 / 報告書 / React header 皆 fetch 此路由套用 logo。
// 公開（見 proxy.ts）；非敏感資料。永不快取，改了即時生效。
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function GET() {
  const brand = await getBrand();
  return Response.json(brand, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
