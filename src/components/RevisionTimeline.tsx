"use client";

import { useState } from "react";

// 雙軌合併時間軸的一列。restorable 由 server 端算好——
// 「誰能回復哪一軌」是權限規則，不該讓 client 元件自己判斷。
export type TimelineItem = {
  id: string;
  planId: string;
  track: string;           // coach / client
  planLabel: string | null;
  planYear: number;
  editorType: string;      // coach / client
  editorName: string | null;
  createdAt: string;       // ISO（server component 傳過來要可序列化）
  restorable: boolean;
};

type Props = {
  items: TimelineItem[];
  onRestore: (planId: string, revisionId: string) => Promise<{ ok: boolean; error?: string }>;
  /** 看時間軸的人是誰，用來把「教練／客戶」講成「我」。 */
  viewerType: "coach" | "client";
};

const trackLabel = (t: string) => (t === "client" ? "人生護照" : "年度版");

export default function RevisionTimeline({ items, onRestore, viewerType }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function doRestore(it: TimelineItem) {
    setBusy(it.id); setErr(null);
    try {
      const res = await onRestore(it.planId, it.id);
      if (res.ok) {
        window.location.reload();
      } else {
        setErr(res.error || "回復失敗，請重試");
        setBusy(null); setConfirming(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "回復失敗，請重試");
      setBusy(null); setConfirming(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-[#a7bacb] text-sm">尚無版本紀錄。存檔一次就會留下一版。</p>;
  }

  return (
    <div>
      {err && <div className="mb-3 rounded-lg border border-[#ff9b9b]/40 bg-[#ff9b9b]/10 px-4 py-2.5 text-sm text-[#ff9b9b]">⚠ {err}</div>}
      <ul className="space-y-2">
        {items.map((it, i) => {
          const isLatest = i === 0;
          const mine = it.editorType === viewerType;
          return (
            <li
              key={it.id}
              className={`rounded-xl border px-4 py-3 ${
                it.track === "client"
                  ? "bg-[#12334f] border-[#2fb0a8]/30"
                  : "bg-[#0d2b45] border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span
                      className={`text-[10.5px] px-2 py-0.5 rounded border ${
                        it.track === "client"
                          ? "border-[#2fb0a8]/50 text-[#2fb0a8]"
                          : "border-[#c99a5b]/50 text-[#c99a5b]"
                      }`}
                    >
                      {trackLabel(it.track)}
                    </span>
                    {it.track === "coach" && (
                      <span className="text-[11px] text-[#6f869c]">{it.planLabel || `${it.planYear} 版`}</span>
                    )}
                    {isLatest && (
                      <span className="text-[10.5px] px-2 py-0.5 rounded bg-[#c99a5b] text-[#08202a] font-bold">目前版本</span>
                    )}
                  </div>
                  <div className="text-[12.5px] text-[#a7bacb] mt-1">
                    {mine ? "我" : it.editorType === "client" ? "客戶" : "教練"}
                    {it.editorName ? `．${it.editorName}` : ""}
                    ．{new Date(it.createdAt).toLocaleString("zh-TW", { hour12: false })}
                  </div>
                </div>

                {/* 目前版本沒有「回復到自己」的意義，所以只有非最新的才給按鈕 */}
                {it.restorable && !isLatest && (
                  confirming === it.id ? (
                    <span className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setConfirming(null)}
                        disabled={busy === it.id}
                        className="text-[12.5px] text-[#a7bacb] hover:text-white px-3 py-1.5 rounded-lg border border-white/15"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => doRestore(it)}
                        disabled={busy === it.id}
                        className="text-[12.5px] font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] disabled:opacity-60 px-3 py-1.5 rounded-lg"
                      >
                        {busy === it.id ? "回復中…" : "確定回復"}
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setConfirming(it.id); setErr(null); }}
                      className="shrink-0 text-[12.5px] text-[#a7bacb] hover:text-white px-3 py-1.5 rounded-lg border border-white/15"
                    >
                      回復這一版
                    </button>
                  )
                )}
              </div>
              {confirming === it.id && (
                <p className="mt-2 text-[11.5px] text-[#6f869c]">
                  會把這一版的內容變成目前版本。中間的版本不會消失，回復本身也會留一筆紀錄，隨時能再回來。
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
