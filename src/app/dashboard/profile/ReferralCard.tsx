"use client";

// 教練「我的推薦連結」（2026/10/20 Ray 定案：推薦來源標記）。
// 連結帶教練編號，落地在公開護照頁；客戶從這裡進來、之後建帳號，會記下「是你帶進來的」。
// ⚠️ 這張卡講的是來源，不是歸屬——文案裡要把這件事說清楚，免得教練以為掃了碼客戶就是他的。
import { useState } from "react";
import type { ReferralStats } from "@/lib/referral";

export default function ReferralCard({ url, qrSvg, stats }: { url: string; qrSvg: string; stats: ReferralStats }) {
  const referred = stats.total;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪貼簿不可用（非 https／權限）時退回選取
      const el = document.getElementById("refUrl") as HTMLInputElement | null;
      el?.select();
    }
  }
  return (
    <div className="mb-5 rounded-xl border border-line bg-panel2 px-4 py-3 flex flex-wrap gap-4 items-start">
      <div
        className="w-[112px] h-[112px] shrink-0 rounded-lg bg-white p-1.5 [&>svg]:w-full [&>svg]:h-full"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
        aria-label="推薦連結 QR Code"
      />
      <div className="flex-1 min-w-[220px]">
        <div className="text-xs text-tx2">我的推薦連結</div>
        <div className="flex gap-2 mt-1">
          <input id="refUrl" readOnly value={url}
            className="flex-1 min-w-0 bg-field border border-line rounded-lg px-2.5 py-1.5 text-13 font-mono text-tx" />
          <button type="button" onClick={copy}
            className="shrink-0 text-13 font-bold text-onbrand bg-brand hover:bg-brand2 px-3 py-1.5 rounded-lg">
            {copied ? "已複製" : "複製"}
          </button>
        </div>
        <p className="text-xs text-tx2 mt-2 leading-relaxed">
          客戶掃碼或點連結會直接進入「人生護照」免費試算；之後他建立帳號時，系統會記下
          <b className="text-tx">是你帶進來的</b>（目前 <b className="text-brand2">{referred}</b> 位）。
          這是<b className="text-tx">來源紀錄</b>，不是指定教練——客戶要掛在你名下，仍然是他輸入你的教練編號、你按接受那一條路。
        </p>
        {stats.total > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["帶進來", stats.total], ["存了護照", stats.passport], ["已掛教練", stats.linked], ["掛在我名下", stats.mine]].map(([l, v]) => (
                <div key={String(l)} className="rounded-lg bg-panel px-2 py-1.5">
                  <div className="text-11 text-tx2">{l}</div>
                  <div className="text-lg font-bold text-tx">{v}</div>
                </div>
              ))}
            </div>
            <ul className="mt-2 text-12 text-tx2 divide-y divide-line">
              {stats.recent.map((r, i) => (
                <li key={i} className="flex justify-between gap-3 py-1">
                  <span className="text-tx truncate">{r.name}</span>
                  <span className="shrink-0">{r.at ? new Date(r.at).toLocaleDateString("zh-TW") : ""} · {r.state}</span>
                </li>
              ))}
            </ul>
            <p className="text-11 text-tx3 mt-1">「已掛教練」是掛上任何一位教練（派案閘決定），「掛在我名下」才是你的客戶。</p>
          </div>
        )}
      </div>
    </div>
  );
}
