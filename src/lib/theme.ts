// 深色／淺色主題的共用常數與工具。
// 純資料，client 與 server 都吃這一份 —— 兩份定義遲早會對不上（字級那組就是這樣寫的）。

export const THEMES = [
  { value: "dark", label: "深色", hint: "深藍底，預設" },
  { value: "light", label: "淺色", hint: "白面板、淡藍灰底" },
] as const;

export type ThemeName = (typeof THEMES)[number]["value"];

export const THEME_KEY = "lantu.theme";
export const DEFAULT_THEME: ThemeName = "dark";

export function normalizeTheme(v: unknown): ThemeName {
  return v === "light" ? "light" : "dark";
}

/**
 * 在 <head> 內、首次繪製前就把主題套上去。
 * 沒有它的話，選淺色的人每次導頁都會先看到一整片深藍再跳成白色 —— 那一下閃光比字級的更刺眼，
 * 因為整個畫面的底色都在翻。
 *
 * ⚠️ 只寫 data-theme="light"，深色是不加屬性的預設值。
 *    這樣即使這段 script 沒跑到（舊瀏覽器、CSP 擋掉），畫面仍然是完整的深色版而不是半套。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});
if(t==="light")document.documentElement.setAttribute("data-theme","light");
}catch(e){}})();`;
