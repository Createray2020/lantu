"use client";

import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import UiScaleToggle from "./UiScaleToggle";

// 顯示設定（深淺色＋字級）的側邊懸浮鈕（2026/09/25 Ray）。
// 官網與客戶端的頂欄要留給內容與導覽，這兩組切換原本擺在頂欄正中間，太搶眼。
// 收成畫面右側一顆小小的「Aa」，點開才看到；看不清楚字的人仍然一眼找得到。
// 切換本身沿用 ThemeToggle / UiScaleToggle（模組級 store），行為與改版前完全一樣。
export default function DisplayPrefsFab() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label="顯示設定"
          className="mr-2 rounded-xl border border-line bg-panel shadow-e1 p-3 flex flex-col gap-2.5"
        >
          <div className="text-xs text-tx3">顯示設定</div>
          <ThemeToggle compact />
          <UiScaleToggle compact />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="顯示設定：深淺色與字級"
        title="顯示設定：深淺色與字級"
        className={`grid place-items-center w-9 h-11 rounded-l-xl border border-r-0 border-line bg-panel/90 backdrop-blur text-sm font-serif font-bold ${
          open ? "text-brand2" : "text-tx3 hover:text-tx"
        }`}
      >
        Aa
      </button>
    </div>
  );
}
