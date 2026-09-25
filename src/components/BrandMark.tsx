// 嵐途品牌標誌（方形 icon）。全站頂欄、登入頁、過場畫面共用這一顆。
//
// ⚠️ 讀的是後台「品牌設定」上傳的 icon（/api/brand/icon，沒上傳時退回 public 的預設圖），
//    不要再在各頁寫死一份 SVG：2026/09/25 以前 12 個地方各自畫了一個「L＋弧線」，
//    後台換了 logo，官網左上角卻永遠是舊的（Ray 回報）。
// 刻意用純 <img>、不是 client component：server 頁面也能直接用，而且 icon 有快取，不會每頁打 DB。
export default function BrandMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/api/brand/icon"
      alt="嵐途"
      width={size}
      height={size}
      className={`rounded-xl object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
