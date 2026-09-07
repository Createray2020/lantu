import { specialtyColor } from "@/lib/specialtyColor";

/**
 * 專長色塊。官網首頁、教練卡片、編輯頁共用同一顆，顏色與樣式才不會三個地方各長各的。
 *
 * primary＝主專長（教練拖到第一個的那一個）：帶顏色、粗體。
 * 其餘專長維持中性——三個以上全部上色就沒有任何一個被「點出來」，
 * 而 Ray 要的正是「一眼看到主專長是什麼」。
 *
 * 沒有 "use client"：它不用任何 hook，server 與 client component 都能直接用。
 */
export default function SpecialtyChip({
  name, primary = false, className = "", title,
}: {
  name: string;
  primary?: boolean;
  className?: string;
  title?: string;
}) {
  if (!primary) {
    return (
      <span title={title}
        className={`inline-block rounded-full border border-line bg-panel2 text-tx shadow-e1 ${className}`}>
        {name}
      </span>
    );
  }
  const c = specialtyColor(name);
  return (
    <span title={title}
      className={`inline-block rounded-full border font-bold shadow-e1 ${className}`}
      style={{
        color: c,
        backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
      }}>
      {name}
    </span>
  );
}
