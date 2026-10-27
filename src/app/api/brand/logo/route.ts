// 品牌橫式 logo（後台上傳的那一張）：給 Clerk 登入／註冊卡片當 logoImageUrl。
// 跟 /api/brand/icon 同一個做法：公開可讀、可快取、content-type 硬編 image/png（寫入點有白名單，
// 不信任 dataURL 自己宣告的 mime）。沒上傳 → 404，ClerkProvider 那邊就不帶 logo。
import { getBrand, parseDataUrl } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function GET() {
  const brand = await getBrand();
  const parsed = parseDataUrl(brand.logoUrl);
  if (!parsed) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300" } });
  return new Response(new Uint8Array(parsed.bytes), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
