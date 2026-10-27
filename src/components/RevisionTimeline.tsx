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
  /** 報告書版本標籤（2026/10/28）：draft／revised／final；labelable＝主責教練可標 */
  label?: string | null;
  labelNote?: string | null;
  labeledAt?: string | null;
  labelable?: boolean;
};
const LABEL_TEXT: Record<string, string> = { draft: "初稿", revised: "修改版", final: "最終版" };

type Props = {
  items: TimelineItem[];
  onRestore: (planId: string, revisionId: string) => Promise<{ ok: boolean; error?: string }>;
  onLabel?: (planId: string, revisionId: string, label: string | null) => Promise<{ ok: boolean; error?: string }>;
  /** 看時間軸的人是誰，用來把「教練／客戶」講成「我」。 */
  viewerType: "coach" | "client";
};

const trackLabel = (t: string) => (t === "client" ? "人生護照" : "年度版");

export default function RevisionTimeline({ items, onRestore, onLabel, viewerType }: Props) {
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
    return <p className="text-tx2 text-sm">尚無版本紀錄。存檔一次就會留下一版。</p>;
  }

  return (
    <div>
      {err && <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">⚠ {err}</div>}
      <ul className="space-y-2">
        {items.map((it, i) => {
          const isLatest = i === 0;
          const mine = it.editorType === viewerType;
          return (
            <li
              key={it.id}
              className={`rounded-xl border px-4 py-3 ${
                it.track === "client"
                  ? "bg-panel2 border-teal/30"
                  : "bg-panel border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span
                      className={`text-10 px-2 py-0.5 rounded border ${
                        it.track === "client"
                          ? "border-teal/50 text-teal"
                          : "border-brand/50 text-brand"
                      }`}
                    >
                      {trackLabel(it.track)}
                    </span>
                    {it.track === "coach" && (
                      <span className="text-11 text-tx3">{it.planLabel || `${it.planYear} 版`}</span>
                    )}
                    {isLatest && (
                      <span className="text-10 px-2 py-0.5 rounded bg-brand text-onbrand font-bold">目前版本</span>
                    )}
                    {it.label && (
                      <span className={`text-10 px-2 py-0.5 rounded font-bold ${it.label === "final" ? "bg-ok text-onsolid" : "border border-brand2/60 text-brand2"}`} title={it.labelNote ?? undefined}>
                        報告書{LABEL_TEXT[it.label] ?? it.label}{it.labeledAt ? `・${new Date(it.labeledAt).toLocaleDateString("zh-TW")}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-tx2 mt-1">
                    {mine ? "我" : it.editorType === "client" ? "客戶" : "教練"}
                    {it.editorName ? `．${it.editorName}` : ""}
                    ．{new Date(it.createdAt).toLocaleString("zh-TW", { hour12: false })}
                  </div>
                </div>

                {it.labelable && onLabel && (
                  <select
                    className="shrink-0 text-xs bg-field border border-line2 rounded-md px-2 py-1 text-tx"
                    value={it.label ?? ""}
                    disabled={busy === it.id}
                    onChange={async (e) => {
                      const v = e.target.value || null;
                      setBusy(it.id); setErr(null);
                      const res = await onLabel(it.planId, it.id, v);
                      if (res.ok) window.location.reload(); else { setErr(res.error || "標記失敗"); setBusy(null); }
                    }}
                    title="報告書版本標籤：客戶看得到最終版與交付日"
                  >
                    <option value="">（不標）</option>
                    <option value="draft">初稿</option>
                    <option value="revised">修改版</option>
                    <option value="final">最終版</option>
                  </select>
                )}
                {/* 目前版本沒有「回復到自己」的意義，所以只有非最新的才給按鈕 */}
                {it.restorable && !isLatest && (
                  confirming === it.id ? (
                    <span className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setConfirming(null)}
                        disabled={busy === it.id}
                        className="text-xs text-tx2 hover:text-tx px-3 py-1.5 rounded-lg border border-line2"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => doRestore(it)}
                        disabled={busy === it.id}
                        className="text-xs font-bold text-onbrand bg-brand hover:bg-brand2 disabled:opacity-60 px-3 py-1.5 rounded-lg"
                      >
                        {busy === it.id ? "回復中…" : "確定回復"}
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setConfirming(it.id); setErr(null); }}
                      className="shrink-0 text-xs text-tx2 hover:text-tx px-3 py-1.5 rounded-lg border border-line2"
                    >
                      回復這一版
                    </button>
                  )
                )}
              </div>
              {confirming === it.id && (
                <p className="mt-2 text-11 text-tx3">
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
