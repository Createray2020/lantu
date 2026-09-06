"use client";

import { useEffect, useSyncExternalStore, useTransition } from "react";
import { THEMES, THEME_KEY, DEFAULT_THEME, normalizeTheme, type ThemeName } from "@/lib/theme";
import { setThemeAction } from "@/app/themeAction";

// 深色／淺色切換。刻意與字級切換（UiScaleToggle）長得一樣、放在一起 ——
// 它們是同一類東西：跟著教練帳號走的「介面偏好」，不是業務設定。
//
// 三個地方要同時生效，缺一個就會出現「這台電腦是淺色、換一台又變深色」：
//   1. <html data-theme>  → Next 這邊所有頁面（globals.css 的 token 直接翻）
//   2. localStorage       → 下次載入在首次繪製前就套上（見 layout.tsx 的 boot script），
//                           未登入的官網頁也吃得到
//   3. 帳號欄位 theme     → persist 時才寫；換一台電腦、換一個瀏覽器仍是同一個設定
// 另外規劃器是獨立文件，父層的 CSS 變數進不去，走 postMessage（見 broadcastToFrames）。
//
// 目前值放在模組級的小 store 而不是 useState：同一頁可能同時有兩顆（頂欄與頁內），
// 用 store 才會一起亮起來。

let cache: ThemeName | null = null;
const subs = new Set<() => void>();

function readLocal(): ThemeName {
  if (cache == null) {
    try {
      cache = normalizeTheme(localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME);
    } catch {
      cache = DEFAULT_THEME; // 無痕模式讀 localStorage 會丟例外
    }
  }
  return cache;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => void subs.delete(cb);
}

function applyDom(v: ThemeName) {
  const el = document.documentElement;
  // 深色＝不加屬性。這樣屬性掉了畫面仍是完整的深色版，而不是半深半淺。
  if (v === "light") el.setAttribute("data-theme", "light");
  else el.removeAttribute("data-theme");
  // 瀏覽器分頁工具列的顏色。layout.tsx 的 viewport.themeColor 是靜態的，
  // 不跟著切換就會出現「白色頁面配深藍瀏覽器邊框」。
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", v === "light" ? "#f4f6f8" : "#0d2b45");
  broadcastToFrames(v);
}

function setTheme(v: ThemeName) {
  const n = normalizeTheme(v);
  const changed = cache !== n;
  cache = n;
  try {
    localStorage.setItem(THEME_KEY, n);
  } catch {
    /* 無痕模式寫入會丟例外，不該讓整個頂欄壞掉 */
  }
  applyDom(n);
  if (changed) subs.forEach((f) => f());
}

export default function ThemeToggle({
  initial = DEFAULT_THEME,
  persist = false,
  compact = false,
}: {
  initial?: ThemeName;
  /** 登入者：把選擇存回帳號。官網未登入時為 false。 */
  persist?: boolean;
  compact?: boolean;
}) {
  const [, startTransition] = useTransition();
  const theme = useSyncExternalStore(subscribe, readLocal, () => normalizeTheme(initial));

  useEffect(() => {
    // 登入者：帳號設定是權威，蓋回本機（換裝置時本機值可能是舊的或空的）。
    // 未登入：以本機為準，別把它重設回深色。
    if (persist) setTheme(initial);
    else applyDom(readLocal());
  }, [initial, persist]);

  function pick(v: ThemeName) {
    setTheme(v);
    if (persist) startTransition(() => void setThemeAction(v).catch(() => {}));
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-line2 px-1 py-1 shrink-0"
      title="切換深色／淺色介面"
    >
      {!compact && (
        <span className="text-tx3 text-[10px] font-bold px-1 select-none">介面</span>
      )}
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => pick(t.value)}
          title={t.hint}
          aria-label={`${t.label}介面`}
          aria-pressed={theme === t.value}
          className={`px-2 py-1 rounded text-[11px] font-bold transition leading-none min-h-[26px] ${
            theme === t.value ? "bg-brand text-onbrand" : "text-tx2 hover:text-tx"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// 規劃器（/lantu-app.html）是獨立文件，父層的 CSS 變數進不去，要自己收訊息換屬性。
function broadcastToFrames(v: ThemeName) {
  document.querySelectorAll("iframe").forEach((f) => {
    try {
      f.contentWindow?.postMessage({ type: "lantu:theme", theme: v }, window.location.origin);
    } catch {
      /* 跨網域 iframe（Clerk 等）會丟例外，略過 */
    }
  });
}
