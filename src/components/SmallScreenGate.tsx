"use client";

import { useState } from "react";

/**
 * 小螢幕守門。
 *
 * ⚠️ 這不是「不支援手機」的藉口，是一個刻意的產品決定：
 *    編輯一份規劃是**建構型**工作——上百個欄位、要互相對照、要比較——在 390px 上做，
 *    做不完而且會做錯。與其把桌機版壓小讓人以為可以用，不如明說「這一段請用電腦」。
 *
 * ⚠️ 但一定要留覆寫：用寬度判斷會誤傷「在電腦上把視窗縮小」的人，
 *    被硬擋住而且沒有出口是更糟的體驗。所以講理由、給出口，不上鎖。
 *
 * ⚠️ 用 CSS 斷點決定預設可見性，不用 JS 量視窗寬：伺服器端算不出視窗寬度，
 *    用 JS 偵測會先畫錯一幀再跳一下。
 */
export default function SmallScreenGate({
  title,
  reason,
  children,
}: {
  title: string;
  reason: string;
  children: React.ReactNode;
}) {
  const [force, setForce] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // 沒有剪貼簿權限（或非安全來源）就算了——下面本來就把網址印出來讓人自己抄。
      setCopied(false);
    }
  }

  return (
    <>
      {!force && (
        <div className="flex-1 overflow-y-auto px-6 py-10 sm:hidden">
          <div className="mx-auto max-w-sm text-center">
            <div className="mb-4 text-4xl">🖥️</div>
            <h2 className="mb-2 font-serif text-xl text-tx">{title}</h2>
            <p className="mb-6 text-sm leading-relaxed text-tx2">{reason}</p>

            <button
              type="button"
              onClick={copyLink}
              className="min-h-[48px] w-full rounded-lg bg-brand px-5 font-bold text-onbrand"
            >
              {copied ? "已複製連結 ✓" : "複製這一頁的連結"}
            </button>
            <p className="mt-2 text-11 leading-relaxed text-tx3">
              在電腦上登入後貼上這條連結，就會直接開到同一份規劃。
            </p>

            <button
              type="button"
              onClick={() => setForce(true)}
              className="mt-6 min-h-[44px] text-13 text-tx2 underline underline-offset-4 hover:text-tx"
            >
              我知道，還是要在這個螢幕上開
            </button>
          </div>
        </div>
      )}

      <div className={`${force ? "flex" : "hidden sm:flex"} min-h-0 flex-1 flex-col`}>{children}</div>
    </>
  );
}
