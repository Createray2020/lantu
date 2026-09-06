"use client";

import type { ReactNode } from "react";

/**
 * 送出鈕的四態（閒置 / 送出中 / 成功 / 失敗）。
 *
 * 改版前同一件事有三種完整度：人生護照做到四態＋轉圈，新增客戶與儲存個人檔案
 * 只把文字換成「處理中…」，後台則什麼都沒有——按下去畫面完全沒反應，
 * 於是有人會連按三次，然後產生三筆。
 */
export default function SubmitButton({
  state = "idle",
  children,
  idleLabel,
  pendingLabel = "處理中…",
  doneLabel = "已完成",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  state?: "idle" | "pending" | "done" | "error";
  idleLabel?: ReactNode;
  pendingLabel?: string;
  doneLabel?: string;
}) {
  const label = children ?? idleLabel;
  return (
    <button
      {...rest}
      disabled={rest.disabled || state === "pending"}
      aria-busy={state === "pending"}
      className={`inline-flex items-center justify-center gap-2 rounded-lg text-sm font-bold px-4 py-2 min-h-[36px] transition disabled:opacity-50 disabled:cursor-not-allowed ${
        state === "error" ? "bg-danger-solid text-onsolid" : "bg-brand text-onbrand"
      } ${className}`}
    >
      {state === "pending" && (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity=".28" />
          <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {state === "pending" ? pendingLabel : state === "done" ? doneLabel : label}
    </button>
  );
}
