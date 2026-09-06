"use client";

import { useEffect } from "react";
import Link from "next/link";

// 路由層例外的接住點。
//
// 改版前沒有這支，資料庫連不上或任何未預期例外都會退回 Next 的通用錯誤畫面——
// 白底、英文、跟產品完全不同的長相，教練看到只會以為整個系統掛了。
// 這裡給的是同一套視覺 ＋ 一顆真的能救回現場的「重試」（reset 會重跑該路由的 render）。
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 留在瀏覽器 console，回報時請教練截圖 digest 就查得到對應的伺服器紀錄。
    console.error("[lantu] 頁面發生例外：", error);
  }, [error]);

  return (
    <div className="flex-1 bg-canvas text-tx min-h-screen grid place-items-center px-6">
      <div className="max-w-md w-full rounded-xl border border-line bg-panel px-6 py-6 shadow-e1" role="alert">
        <h1 className="text-lg font-bold mb-2">這一頁沒有載入成功</h1>
        <p className="text-sm text-tx2 leading-relaxed mb-5">
          通常是連線或資料庫暫時不穩。先按重試；連續兩次都失敗的話，
          把下面那串代碼一起回報，工程端才查得到對應的伺服器紀錄。
        </p>
        {error.digest && (
          <p className="text-11 font-mono text-tx3 mb-5 break-all">代碼 {error.digest}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-brand text-onbrand text-sm font-bold px-4 py-2"
          >
            重試
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-line2 text-tx2 hover:text-tx text-sm font-bold px-4 py-2"
          >
            回系統首頁
          </Link>
        </div>
      </div>
    </div>
  );
}
