// 品牌方形 icon：供 favicon 與 PWA manifest。
// 有上傳 → 回該 PNG bytes；沒上傳 → 導回 public 的預設 icon。
// 公開（見 proxy.ts）＝匿名可打，所以一定要快取：
// 舊版是 no-store + force-dynamic，瀏覽器每開一個分頁、PWA 每次啟動都會觸發一次 DB 查詢，
// 而且任何人都能無限次觸發。改成可快取（logo 換掉時由 saveBrandLogo revalidateTag）。
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
      // content-type 硬編 image/png：唯一寫入點(saveBrandLogo)有 PNG 白名單，
      // 但這裡不該去信任 dataURL 自己宣告的 mime，否則多一個寫入點就是同源 stored XSS。
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
