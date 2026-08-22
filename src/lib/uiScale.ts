// 介面縮放（老花友善）的共用常數與工具。
// 純資料，client 與 server 都吃這一份 —— 級距散在兩處遲早會對不上。

export const UI_SCALES = [
  { value: 100, label: "標準", hint: "預設字級" },
  { value: 115, label: "大", hint: "字與版面放大 15%" },
  { value: 130, label: "特大", hint: "字與版面放大 30%" },
] as const;

export const UI_SCALE_KEY = "lantu.uiScale";
export const DEFAULT_UI_SCALE = 100;

export function normalizeScale(n: unknown): number {
  const v = Math.round(Number(n));
  return UI_SCALES.some((s) => s.value === v) ? v : DEFAULT_UI_SCALE;
}

/**
 * 在 <head> 內先跑一次，於首次繪製前就把縮放套上去。
 * 沒有它的話，登入頁與官網（未登入、拿不到帳號設定）會先用 100% 畫一次再跳成 130%，
 * 對需要放大字的人來說那一下閃動最刺眼。
 */
export const UI_SCALE_BOOT_SCRIPT = `(function(){try{
var v=parseInt(localStorage.getItem(${JSON.stringify(UI_SCALE_KEY)})||"100",10);
if(v>=100&&v<=200)document.documentElement.style.setProperty("--ui-scale",String(v/100));
}catch(e){}})();`;
