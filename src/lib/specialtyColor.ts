// 專長領域的顏色：專長名稱 → 固定的一個顏色。
//
// 為什麼是「名稱 hash」而不是後台再設定一次顏色：
// 專長清單本身已經住在制度設定裡（settings.specialties）。再開一組「顏色設定」，
// 就多了一個要維護、而且會跟清單不同步的地方——新增一個專長卻沒人去指定顏色時，
// 畫面上會出現一顆沒有顏色的色塊，而且不會噴錯。用名稱決定顏色，新增專長就自動有色，
// 同一個專長在官網首頁、教練卡片、編輯頁永遠是同一色。
//
// ⚠️ 回傳的是 CSS 變數字串（給 style 用），不是 Tailwind class。
//    Tailwind 4 是靜態掃描原始碼的，`bg-c${n}` 這種在執行期組出來的 class 名稱
//    根本不會被產生出來——畫面會完全沒有顏色，而且一樣不噴錯。
//    專案裡 portal/page.tsx 的 FACE_COLORS 已經是同一個做法。

/** 分類色盤，取自 globals.css 的 --c1…--c6（深淺兩套主題各自定義，這裡不必分岔）。 */
export const SPECIALTY_COLOR_VARS = [
  "var(--c1)",
  "var(--c2)",
  "var(--c3)",
  "var(--c4)",
  "var(--c5)",
  "var(--c6)",
] as const;

/**
 * 穩定的字串 hash（FNV-1a 32 bit）。
 * 「穩定」在這裡是硬需求：server component 算一次、client component 再算一次，
 * 兩邊不一樣就會是 hydration mismatch。所以不能用任何帶亂數或時間的東西。
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 專長 → 顏色（CSS 變數字串）。空字串給一個中性色，不要讓它撞進色盤裡。 */
export function specialtyColor(name: string): string {
  const key = (name ?? "").trim();
  if (!key) return "var(--tx3)";
  return SPECIALTY_COLOR_VARS[hash(key) % SPECIALTY_COLOR_VARS.length];
}

/**
 * 主專長＝陣列的第一個。
 *
 * 順序是教練在「我的檔案」裡拖曳決定的，一路從 coach_profiles.specialties（text[]）
 * 原封不動傳到官網——text[] 本來就有序，saveMyProfileAction 的 clean() 用的 Set 也保序。
 * 所以這裡不需要另一個「主專長」欄位，也就不會有「欄位與順序打架」這種第二個真相。
 */
export function primarySpecialty(list: readonly string[] | null | undefined): string | null {
  return list?.[0] ?? null;
}
