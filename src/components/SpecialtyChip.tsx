/**
 * 專長色塊。官網卡片、首頁浮層、編輯頁共用同一顆，樣式才不會三個地方各長各的。
 *
 * ⚠️ 刻意**全部中性、沒有顏色**。2026/09/10 Ray 看到成品後拍板：
 *    把第一個專長用顏色標出來，讀起來像「他只會這一項」——其餘專長被那顆色塊比下去，
 *    等於幫教練縮小了他自己填的範圍。排在第一個本身就已經是「主專長」的表達，
 *    不需要再加一層視覺強調。**要加顏色回來之前先跟他確認。**
 *
 * 沒有 "use client"：它不用任何 hook，server 與 client component 都能直接用。
 */
export default function SpecialtyChip({
  name, className = "", title,
}: {
  name: string;
  className?: string;
  title?: string;
}) {
  return (
    <span title={title}
      className={`inline-block rounded-full border border-line bg-panel2 text-tx shadow-e1 ${className}`}>
      {name}
    </span>
  );
}
