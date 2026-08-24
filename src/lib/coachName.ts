// 教練顯示名稱的規則（2026/08/24 Ray 拍板：教練可以自己改名字，全站都要換）。
//
// 為什麼需要這條規則：`coaches.name` 是 **Clerk 的鏡像** —— `ensureCoach()` 每次導頁都會用
// Clerk 的 firstName+lastName 把它覆寫回去，所以「讓教練改名字」不能寫那一欄，
// 下一次導頁就被蓋掉。教練自填的名字存在 `coaches.display_name`。
//
// ⚠️ 這個檔案**刻意保持純的**（不 import drizzle、不 import schema、不 import Clerk）：
//    它被「我的公開檔案」那個 client component 引用，一旦拉進 drizzle／schema，
//    整份 pg-core 就會被打包進瀏覽器。
//    SQL 版在 Shared/db/schema.ts 的 `coachDisplayName`，兩者語意必須一致
//    （coachName.test.ts 對拍空字串／全空白這些邊界）。

/** 自填顯示名稱的長度上限（Ray 2026/08/24：只限長度，其餘不管）。 */
export const DISPLAY_NAME_MAX = 20;

/** 純函式版：自填 → Clerk 姓名 → email → 「教練」。 */
export function displayNameOf(
  c: { displayName?: string | null; name?: string | null; email?: string | null } | null,
): string {
  const self = (c?.displayName ?? "").trim();
  if (self) return self;
  const clerk = (c?.name ?? "").trim();
  if (clerk) return clerk;
  return (c?.email ?? "").trim() || "教練";
}
