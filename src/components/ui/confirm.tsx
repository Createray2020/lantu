"use client";

import { createRoot } from "react-dom/client";
import { useId } from "react";
import Modal from "./Modal";

/**
 * 取代全站 22 處原生 `confirm()`。
 *
 * ⚠️ 為什麼非換不可：瀏覽器的原生對話框**完全不受 `--ui-scale` 影響**。
 *    已經把介面調成「特大」的老花使用者，看到的確認框還是系統預設字級——
 *    而那正是「要不要刪掉這筆」這種最需要看清楚的一步。老花友善在這裡破功。
 *    順帶它也套不到深／淺主題，切成淺色版後會跳出一個系統灰框。
 *
 * 用法刻意保持和原生一樣好寫，只多一個 await：
 *    if (await confirmDialog("刪除此年度版本？")) { … }
 *
 * 實作用 createRoot 自己掛一個節點，而不是在 layout 放 <ConfirmHost>：
 * 這樣任何檔案 import 就能用，不必先確認自己在哪棵樹底下。
 */
export function confirmDialog(
  message: string,
  opts: { title?: string; okLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  // SSR / 測試環境沒有 document：回 false（＝當作使用者取消），不要丟例外。
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    const done = (v: boolean) => {
      resolve(v);
      // 等這一輪 render 收尾再卸載，否則 React 會警告在 render 期間 unmount。
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };

    root.render(<ConfirmBody message={message} {...opts} onDone={done} />);
  });
}

function ConfirmBody({
  message,
  title = "請確認",
  okLabel = "確定",
  cancelLabel = "取消",
  danger = false,
  onDone,
}: {
  message: string;
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onDone: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <Modal open onClose={() => onDone(false)} labelledBy={id} width="max-w-md">
      <div className="px-5 py-4 border-b border-line">
        <h2 id={id} className="text-base font-bold">
          {title}
        </h2>
      </div>
      <p className="px-5 py-4 text-sm text-tx2 leading-relaxed whitespace-pre-line">{message}</p>
      <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onDone(false)}
          className="rounded-lg border border-line2 text-tx2 hover:text-tx text-sm font-bold px-4 py-2"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => onDone(true)}
          className={`rounded-lg text-sm font-bold px-4 py-2 ${
            danger ? "bg-danger-solid text-onsolid" : "bg-brand text-onbrand"
          }`}
        >
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
