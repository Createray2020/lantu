// 深色／淺色主題的共用常數與工具。
// 純資料，client 與 server 都吃這一份 —— 兩份定義遲早會對不上（字級那組就是這樣寫的）。

export const THEMES = [
  { value: "dark", label: "深色", hint: "深海金線：深藍底、金色點綴" },
  { value: "light", label: "淺色", hint: "高對比晨嵐：白面板、墨藍主色，預設" },
] as const;

export type ThemeName = (typeof THEMES)[number]["value"];

export const THEME_KEY = "lantu.theme";
// 2026/11/01 Ray：預設改成淺色（高對比晨嵐），深色（深海金線）保留給要的人自己切。
export const DEFAULT_THEME: ThemeName = "light";

export function normalizeTheme(v: unknown): ThemeName {
  return v === "dark" ? "dark" : "light";
}

/**
 * 在 <head> 內、首次繪製前就把主題套上去。
 * 沒有它的話，選淺色的人每次導頁都會先看到一整片深藍再跳成白色 —— 那一下閃光比字級的更刺眼，
 * 因為整個畫面的底色都在翻。
 *
 * ⚠️ 只寫 data-theme="light"，深色是不加屬性的狀態——CSS 結構沿用（裸 :root＝深色），
 *    但 2026/11/01 起預設是淺色：<html> 伺服器端就帶 data-theme="light"，這段只在選了深色時把它拿掉。
 *    script 沒跑到時看到的是完整的淺色版，不是半套。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});
if(t==="dark")document.documentElement.removeAttribute("data-theme");
else document.documentElement.setAttribute("data-theme","light");
}catch(e){}})();`;
