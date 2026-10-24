"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ui/confirm";
import { importPassportAction } from "../../actions";
import type { WishesForCoach } from "@/lib/clientPlan";

// 「客戶的想法」分頁：客戶在人生護照上存下的每一筆願望（帶時間），
// 與教練軌最新一份反推出來的基準並排標差異。主責可以把任一筆「帶入年度版」（只補空白）。
// 2026/10/24 Ray 定案：教練軌是真相、護照是投影；這一頁是客戶把想法傳回教練的唯一通道。
export default function Wishes({ data, readOnly, passportExists }: { data: WishesForCoach; readOnly: boolean; passportExists: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function bringIn(revisionId?: string) {
    if (!data.targetPlanId) return;
    setMsg(null);
    const pre = await importPassportAction(data.targetPlanId, { revisionId, preview: true });
    if (!pre.ok) { setMsg({ kind: "err", text: pre.error }); return; }
    if (!pre.imported.length) { setMsg({ kind: "ok", text: `年度版 ${data.targetPlanYear} 已經有這些項目了，沒有可以補的空白。` }); return; }
    const ok = await confirmDialog(`會補進年度版 ${data.targetPlanYear} 的項目（只補空白，教練已填的不動）：\n\n・${pre.imported.join("\n・")}`);
    if (!ok) return;
    start(async () => {
      const r = await importPassportAction(data.targetPlanId!, { revisionId });
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: `已帶入 ${r.imported.length} 項。` });
      router.refresh();
    });
  }

  const btn = "rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs uppercase tracking-wider text-tx3">客戶的想法</h3>
        <div className="flex-1" />
        {!readOnly && passportExists && data.targetPlanId && (
          <button className={btn + " bg-panel text-tx2 border border-line"} disabled={pending} onClick={() => bringIn()}>
            從人生護照帶入年度版 {data.targetPlanYear}
          </button>
        )}
      </div>
      <p className="text-11 text-tx3 -mt-2">
        客戶在人生護照上拉動只是試算；按了「存成我的願望」才會出現在這裡。差異是跟你目前年度版反推出來的五面向比。
      </p>
      {msg && <div className={"text-sm " + (msg.kind === "ok" ? "text-ok" : "text-danger")}>{msg.text}</div>}

      {!passportExists && <Empty>這位客戶還沒做過人生護照。</Empty>}
      {passportExists && data.wishes.length === 0 && <Empty>客戶還沒存過願望。</Empty>}

      {data.wishes.map((w, i) => (
        <div key={w.revisionId} className="bg-panel border border-line rounded-lg px-4 py-3 shadow-e1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-bold">
              {new Date(w.savedAt).toLocaleString("zh-TW", { hour12: false })}
              {i === 0 && <span className="ml-2 text-10 text-ok">最新</span>}
            </div>
            <div className="text-11 text-tx3">{w.editorName ?? "客戶"}</div>
            <div className="flex-1" />
            <div className="text-11 text-tx3">每月應存 <b className="text-tx text-sm tabular-nums">{w.summary.total}</b></div>
            {!readOnly && data.targetPlanId && (
              <button className={btn + " bg-brand text-onbrand"} disabled={pending} onClick={() => bringIn(w.revisionId)}>帶入年度版</button>
            )}
          </div>
          <div className="grid sm:grid-cols-5 gap-x-4 gap-y-1 mt-2 text-xs">
            {([["購屋", w.summary.house], ["購車", w.summary.car], ["退休", w.summary.retire], ["扶養", w.summary.support], ["旅遊", w.summary.travel]] as const).map(([l, v]) => (
              <div key={l}><span className="text-tx3">{l}</span> <span className="text-tx2 tabular-nums">{v}</span></div>
            ))}
          </div>
          {w.diffs.length > 0 ? (
            <div className="mt-3 rounded-md bg-canvas/60 border border-line px-3 py-2">
              <div className="text-10 tracking-[0.18em] text-brand mb-1">跟你目前的規劃不一樣的地方</div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                {w.diffs.map((d, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-tx3 w-36 shrink-0">{d.label}</span>
                    <span className="text-tx2 tabular-nums line-through decoration-tx3/60">{d.from}</span>
                    <span className="text-tx3">→</span>
                    <span className="text-brand2 tabular-nums font-bold">{d.to}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            data.targetPlanId && <div className="mt-2 text-11 text-tx3">跟你目前的規劃一致。</div>
          )}
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line2 px-4 py-6 text-center text-sm text-tx2">{children}</div>;
}
