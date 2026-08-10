import type { MetadataRoute } from "next";

// PWA manifest（安裝到主畫面）。icon 指向動態品牌 icon，可被後台上傳的 logo 取代。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "嵐途 LAN TU · 全方位財務規劃",
    short_name: "嵐途",
    description: "理解自己・做出選擇・走向未來",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#081a2b",
    theme_color: "#0d2b45",
    icons: [
      { src: "/api/brand/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/brand/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/brand/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
