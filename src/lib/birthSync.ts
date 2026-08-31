/**
 * 生日的兩個家：clients.birth_date（客戶主檔，新增客戶時填的）與
 * plans.data.profile.birth（規劃內容，家庭成員卡片填的）。
 *
 * 2026/08/31 之前這兩份完全沒接，所以教練建完客戶、進到規劃器還要把同一個生日
 * 再打一次（Ray 回報）。現在：
 *   · 主檔 → 規劃：lantu:init 帶 birthDate，規劃裡還空著時才寫入（不覆蓋教練改過的）
 *   · 規劃 → 主檔：updatePlanData 存檔時回寫（只在不一樣時才寫）
 *
 * 這支只做「從一份 case 讀出本人的生日」，刻意抽成純函式：資料層那一支要 mock db 才測得到。
 */

/**
 * 讀出本人的生日；格式不對或年份荒謬就回 null。
 *
 * ⚠️ 只認 YYYY-MM-DD 且年份 1900–2100。規劃器的 <input type=date> 在打字途中
 *    會送出 0001-05-06 這種「格式正確但荒謬」的中間值——那種東西寫進客戶主檔
 *    就是一筆永遠沒人發現的髒資料。
 */
export function caseBirthDate(data: unknown): string | null {
  const o = data as { profile?: { birth?: unknown } } | null;
  const raw = o?.profile?.birth;
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1900 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return m[0];
}
