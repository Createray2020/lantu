"use client";

import { useEffect, useSyncExternalStore, useTransition } from "react";
import { UI_SCALES, UI_SCALE_KEY, DEFAULT_UI_SCALE, normalizeScale } from "@/lib/uiScale";
import { setUiScaleAction } from "@/app/uiScaleAction";

// 字級切換（老花友善）。三檔：標準 / 大 / 特大。
// 官網（未登入）與教練端頂欄共用同一顆 —— 兩份實作遲早會有一邊忘了改。
//
// 三個地方要同時生效，缺一個就會出現「有些畫面放大了、有些沒有」：
//   1. CSS 變數 --ui-scale  → Next 這邊所有頁面（Tailwind 全是 rem，字與間距一起放大）
//   2. localStorage         → 下次載入在首次繪製前就套上（見 layout.tsx 的 boot script），
//                             未登入的官網頁也吃得到
//   3. 帳號欄位 ui_scale    → persist 時才寫；換一台電腦、換一個瀏覽器仍是同一個設定
// 另外規劃器是 iframe 裡的 px 版面，rem 對它無效，改用 zoom（見 broadcastToFrames）。
//
// 目前值放在模組級的小 store 而不是 useState：同一頁可能同時有兩顆（頂欄與頁內），
// 用 store 才會一起亮起來，也才不必在 effect 裡 setState。

let cache: number | null = null;
const subs = new Set<() => void>();

function readLocal(): number {
  if (cache == null) {
    try {
      cache = normalizeScale(localStorage.getItem(UI_SCALE_KEY) ?? DEFAULT_UI_SCALE);
    } catch {
      cache = DEFAULT_UI_SCALE; // 無痕模式讀 localStorage 會丟例外
    }
  }
  return cache;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => void subs.delete(cb);
}

function applyDom(v: number) {
  document.documentElement.style.setProperty("--ui-scale", String(v / 100));
  broadcastToFrames(v);
}

function setScale(v: number) {
  const n = normalizeScale(v);
  const changed = cache !== n;
  cache = n;
  try {
    localStorage.setItem(UI_SCALE_KEY, String(n));
  } catch {
    /* 無痕模式寫入會丟例外，不該讓整個頂欄壞掉 */
  }
  applyDom(n);
  if (changed) subs.forEach((f) => f());
}

export default function UiScaleToggle({
  initial = DEFAULT_UI_SCALE,
  persist = false,
  compact = false,
}: {
  initial?: number;
  /** 登入者：把選擇存回帳號。官網未登入時為 false。 */
  persist?: boolean;
  compact?: boolean;
}) {
  const [, startTransition] = useTransition();
  const scale = useSyncExternalStore(subscribe, readLocal, () => normalizeScale(initial));

  useEffect(() => {
    // 登入者：帳號設定是權威，蓋回本機（換裝置時本機值可能是舊的或空的）。
    // 未登入：以本機為準，別把它重設回 100。
    if (persist) setScale(initial);
    else applyDom(readLocal());
  }, [initial, persist]);

  function pick(v: number) {
    setScale(v);
    if (persist) startTransition(() => void setUiScaleAction(v).catch(() => {}));
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-white/15 px-1 py-0.5 shrink-0"
      title="調整字級（老花友善）"
    >
      {!compact && (
        <span className="text-[#7d93a8] text-[10px] font-bold px-1 select-none">字級</span>
      )}
      {UI_SCALES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => pick(s.value)}
          title={s.hint}
          aria-label={`字級${s.label}`}
          aria-pressed={scale === s.value}
          className={`px-1.5 py-0.5 rounded font-bold transition leading-none ${
            scale === s.value ? "bg-[#c99a5b] text-[#08202a]" : "text-[#a9bccf] hover:text-[#eef2f7]"
          }`}
          style={{ fontSize: `${10 + (s.value - 100) * 0.14}px` }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// 規劃器（/lantu-app.html）是獨立文件，父層的 CSS 變數進不去，
// 而且它整份版面是 px 寫死的 —— 用 zoom 才會等比放大。
function broadcastToFrames(v: number) {
  document.querySelectorAll("iframe").forEach((f) => {
    try {
      f.contentWindow?.postMessage({ type: "lantu:uiscale", scale: v }, window.location.origin);
    } catch {
      /* 跨網域 iframe（Clerk 等）會丟例外，略過 */
    }
  });
}
