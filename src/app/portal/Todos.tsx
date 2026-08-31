"use client";

// 客戶端的待辦清單（/portal 首頁）。
//
// Ray 2026/08/31：「我們應該會有一個待補齊的清單就可以了，然後這個清單內容
// 要在客戶那邊的待辦清單裡面出現。我們也不會一開始先收集完文件才開始。」
// —— 所以這裡刻意**不是**一張「要交齊的文件表」，而是一份會慢慢變短的清單：
//    沒有全部完成不代表不能開始規劃，未完成的項目只是還沒補上。
import { useState, useTransition } from "react";
import { toggleMyTodoAction } from "./actions";
import type { ClientTodo } from "@/lib/clientTodos";

export default function Todos({ items }: { items: ClientTodo[] }) {
  const [rows, setRows] = useState(items);
  const [, startTransition] = useTransition();
  const open = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);

  if (!rows.length) return null;

  function toggle(id: string, next: boolean) {
    // 樂觀更新：勾了要當場變灰，不然客戶會以為沒反應而連按好幾次。
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, done: next } : r)));
    startTransition(async () => {
      const r = await toggleMyTodoAction(id, next);
      if (!r.ok) setRows((prev) => prev.map((x) => (x.id === id ? { ...x, done: !next } : x)));
    });
  }

  const Row = ({ t }: { t: ClientTodo }) => (
    <label key={t.id} className="flex items-start gap-3 px-4 py-2.5 border-t border-white/8 cursor-pointer">
      <input
        type="checkbox"
        checked={t.done}
        onChange={(e) => toggle(t.id, e.target.checked)}
        className="mt-[3px] w-[16px] h-[16px] accent-[#c99a5b] shrink-0"
      />
      <span className="flex-1 min-w-0">
        <span className={`text-[13.5px] ${t.done ? "text-[#6f869c] line-through" : "text-[#cdd9e5]"}`}>{t.title}</span>
        {(t.owner || t.dueDate) && (
          <span className="block text-[11px] text-[#6f869c] mt-0.5">
            {t.owner ? `由 ${t.owner} 處理` : ""}
            {t.owner && t.dueDate ? " · " : ""}
            {t.dueDate ? `${t.dueDate} 前` : ""}
          </span>
        )}
      </span>
    </label>
  );

  return (
    <div className="max-w-2xl mx-auto mb-6 rounded-xl border border-white/10 bg-[#12334f] overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-[13px] font-bold text-[#e0bd8b]">我的待辦</span>
        <span className="text-[11.5px] text-[#a7bacb]">
          {open.length > 0 ? `還有 ${open.length} 項待補` : "都完成了"}
        </span>
      </div>
      {open.map((t) => (
        <Row key={t.id} t={t} />
      ))}
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer px-4 py-2 text-[11.5px] text-[#6f869c] list-none border-t border-white/8">
            已完成 {done.length} 項
          </summary>
          {done.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </details>
      )}
      <p className="px-4 py-2.5 text-[11px] text-[#6f869c] border-t border-white/8">
        清單會隨著規劃一起長出來，<b className="text-[#a7bacb]">不必等全部補齊才開始</b>——缺哪一項，
        只是那一塊的試算會先用預估值。
      </p>
    </div>
  );
}
