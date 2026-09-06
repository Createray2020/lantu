"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 全站唯一的彈窗殼。
 *
 * 改版前四個彈窗（新增客戶／階段導覽／頭像裁切／風險測驗）各自手刻
 * `fixed inset-0 + 遮罩 + onClick 關閉`，沒有一個標 role="dialog"，
 * 其中三個連 Esc 都關不掉，也沒有人把焦點移進去——用鍵盤的人按下去之後
 * 焦點還留在背景那顆按鈕上，Tab 會跑到被遮住的畫面裡。
 *
 * ⚠️ 三件事缺一不可，而且缺了都不會噴錯：
 *    1. role="dialog" + aria-modal → 螢幕報讀器才知道進入了對話框情境
 *    2. Esc 關閉                   → 鍵盤使用者唯一的逃生口
 *    3. 焦點移入 ＋ 關閉時還回原處  → 不然關掉之後焦點會掉回 <body>
 */
export default function Modal({
  open = true,
  onClose,
  labelledBy,
  label,
  width = "max-w-lg",
  children,
}: {
  open?: boolean;
  onClose: () => void;
  /** 標題元素的 id（有標題時用這個，語意比 aria-label 好） */
  labelledBy?: string;
  /** 沒有可見標題時的替代說明 */
  label?: string;
  width?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;

    // 焦點移進面板。優先給第一個可聚焦元素，都沒有就給面板本身（tabIndex -1）。
    const first = panel.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (first ?? panel.current)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // 焦點圈在面板裡：到頭了就繞回去，不要跑進被遮住的背景。
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    // 背景不要跟著捲動——手機上尤其明顯。
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      // ⚠️ 不能用 grid place-items-center：面板比容器高的時候，置中會讓它「往上下兩邊」
      //    同時溢出，而捲動捲不到被推出上緣的那一段——標題與前幾個欄位就永遠碰不到。
      //    手機叫出鍵盤後可視高度只剩約 400px，這是必發不是邊角案例。
      //    items-start ＋ 面板 my-auto：放得下時仍然置中，放不下時從頂端開始、整份捲得到。
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/60 px-4 py-8 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`my-auto w-full ${width} rounded-xl border border-line bg-panel shadow-e3 outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
