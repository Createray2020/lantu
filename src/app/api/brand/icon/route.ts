// 品牌方形 icon：供 favicon 與 PWA manifest。
// 有上傳 → 回該 PNG bytes；沒上傳 → 導回 public 的預設 icon。
// 公開（見 proxy.ts）。永不快取。
import { getBrand, parseDataUrl } from "@/lib/brand";

export const dynamic = "force-dynamic";

const DEFAULT_ICON = "/brand-default-icon.png";

export async function GET(req: Request) {
  const brand = await getBrand();
  const parsed = parseDataUrl(brand.iconUrl);
  if (!parsed) {
    return Response.redirect(new URL(DEFAULT_ICON, req.url), 307);
  }
  return new Response(new Uint8Array(parsed.bytes), {
    headers: {
      "content-type": parsed.mime || "image/png",
      "cache-control": "no-store, max-age=0",
    },
  });
}
