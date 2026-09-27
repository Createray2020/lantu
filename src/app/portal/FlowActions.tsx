"use client";

// 願景處理流程：客戶端的「我的行動清單」（/portal 首頁）。
//
// 只有教練把流程走到執行期（c.flow.step = S7／S8）才會出現。客戶自己標每個動作
// 做到哪——待／到位／部分／沒動——教練回訪對帳（Step 8）時拿來當佐證；
// 判定仍以里程碑（實際可投資資產 vs 規劃線）為主，這裡的勾選是並列的第二把尺。
import { useState, useTransition } from "react";
import { setMyActionStatusAction } from "./actions";
import type { FlowActionRow } from "@/lib/flowActions";

const STATES: { k: string; label: string }[] = [
  { k: "planned", label: "待" },
  { k: "done", label: "到位" },
  { k: "partial", label: "部分" },
  { k: "none", label: "沒動" },
];

export default function FlowActions({ items }: { items: FlowActionRow[] }) {
  const [rows, setRows] = useState(items);
  const [, startTransition] = useTransition();
  if (!rows.length) return null;
  const done = rows.filter((r) => r.state === "done").length;

  function mark(id: string, state: string) {
    const prev = rows.find((r) => r.id === id)?.state ?? "planned";
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, state } : r)));
    startTransition(async () => {
      const r = await setMyActionStatusAction(id, state);
      if (!r.ok) setRows((rs) => rs.map((x) => (x.id === id ? { ...x, state: prev } : x)));
    });
  }

  return (
    <div className="max-w-2xl mx-auto mb-6 rounded-xl border border-line bg-panel2 overflow-hidden shadow-e1" data-testid="flow-actions">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-13 font-bold text-brand2">我的行動清單</span>
        <span className="text-11 text-tx2">{done} / {rows.length} 到位 · 做到哪就標到哪，教練回訪時會一起看</span>
      </div>
      {rows.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-line">
          <span className="text-11 px-2 py-0.5 rounded-full border border-line2 text-tx2 shrink-0">{a.laneLabel}</span>
          <span className="flex-1 min-w-0">
            <span className={`text-13 ${a.state === "done" ? "text-tx3 line-through" : "text-tx"}`}>{a.name}</span>
            {a.amount && <span className="block text-11 text-tx3 mt-0.5 tabular-nums">{a.amount}</span>}
          </span>
          <span className="inline-flex rounded-full border border-line2 overflow-hidden shrink-0">
            {STATES.map((s) => (
              <button
                key={s.k}
                type="button"
                onClick={() => mark(a.id, s.k)}
                className={`px-2.5 py-1 text-12 ${a.state === s.k ? (s.k === "done" ? "bg-ok text-onbrand" : "bg-brand text-onbrand") : "text-tx2"}`}
              >
                {s.label}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
