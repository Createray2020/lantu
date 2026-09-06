// 導頁時的過場。
//
// 改版前全站沒有任何 loading.tsx，所有頁面又都是 force-dynamic 的 async server component，
// 於是每次換頁瀏覽器就顯示自己的預設空白——在一個底色是深藍的產品裡，那是一下刺眼的白閃。
// 這裡只畫底色與一條細進度條，刻意不做骨架畫面：各頁結構差太多，假骨架比空白更干擾。
export default function Loading() {
  return (
    <div className="flex-1 bg-canvas text-tx min-h-screen grid place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden="true" className="opacity-70">
          <path d="M15 12 L15 33 L34 33" className="stroke-tx2" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 24 A13 13 0 0 1 36 16" className="stroke-brand" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
        <div className="h-[3px] w-40 rounded-full bg-panel2 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-brand animate-[lantuSlide_1.1s_ease-in-out_infinite]" />
        </div>
        <span className="text-tx3 text-xs">載入中…</span>
      </div>
    </div>
  );
}
