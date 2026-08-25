"use client";

import { useState, useTransition } from "react";
import { saveAnDefaultsAction, resetAnDefaultsAction, type ActionResult } from "./actions";

// 分析模組預設順序的後台面板。
//
// 為什麼用 ↑ ↓ 而不是拖曳：這一頁一次只會動一兩個模組，按鈕不用瞄準、不吃觸控板手感，
// 也可以直接在 jsdom 測到（拖曳要模擬 dataTransfer，測起來脆）。iframe 那邊的拖曳保持原樣，
// 那是教練現場快速調整的場合，需求不一樣。
//
// ⚠️ 存的是「整串順序」而不是逐列 sortOrder：中途離開不會留下排到一半的資料。

export type BoardRow = { k: string; t: string; cond?: string; hidden: boolean };

const btn =
  "rounded-lg border border-white/15 px-2.5 py-1 text-sm text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-30 disabled:hover:bg-transparent";

export default function AnalysisDefaultBoard({ rows, builtin }: { rows: BoardRow[]; builtin: string[] }) {
  const [list, setList] = useState<BoardRow[]>(rows);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>, okMsg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setMsg(okMsg); setErr(null); after?.(); }
      else { setErr(r.error); setMsg(null); }
    });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setList(next); setDirty(true); setMsg(null);
  };

  const toggle = (i: number) => {
    const next = list.slice();
    next[i] = { ...next[i], hidden: !next[i].hidden };
    setList(next); setDirty(true); setMsg(null);
  };

  const save = () =>
    run(
      () => saveAnDefaultsAction(list.map((r) => r.k), list.filter((r) => r.hidden).map((r) => r.k)),
      "已存檔。教練端最慢一分鐘內重新整理就會看到（那支設定 API 有一分鐘的邊緣快取）",
      () => setDirty(false),
    );

  // 回復系統內建＝把 DB 那些列刪掉。畫面同步回內建順序、全部顯示。
  const resetAll = () =>
    run(() => resetAnDefaultsAction(), "已回復系統內建順序", () => {
      const byK = new Map(list.map((r) => [r.k, r]));
      setList(builtin.map((k) => ({ ...(byK.get(k) as BoardRow), hidden: false })));
      setDirty(false);
    });

  const hiddenCount = list.filter((r) => r.hidden).length;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-5">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2">分析模組 · 預設順序</h2>
        <span className="text-xs text-[#6f869c]">
          共 {list.length} 個模組{hiddenCount > 0 ? `，其中 ${hiddenCount} 個預設收起` : ""}
        </span>
      </div>
      <p className="text-xs text-[#6f869c] mb-4 leading-relaxed">
        這是全平台教練<b className="text-[#a9bccf]">打開任何客戶分析頁時的起手順序</b>。
        教練現場仍可自己拖曳、隱藏——那份偏好記在他自己的電腦、逐客戶各自記憶，
        <b className="text-[#e0bd8b]">這裡改了不會回頭覆蓋他已經調過的客戶</b>；
        他按分析頁上的「恢復預設」，才會重新吃這一份。
        「預設收起」只是不顯示在畫面上，教練按 ＋ 隨時能把它叫回來。
      </p>

      {(msg || err) && <p className={`text-sm mb-3 ${err ? "text-[#ff9b9b]" : "text-[#8fc0a3]"}`}>{err ?? msg}</p>}

      <ol className="mb-4">
        {list.map((r, i) => (
          <li
            key={r.k}
            data-k={r.k}
            className={
              "flex items-center gap-3 px-3 py-2 border-b border-white/8 " + (r.hidden ? "opacity-45" : "")
            }
          >
            <span className="w-6 text-right text-xs text-[#6f869c] tabular-nums">{i + 1}</span>
            <span className="flex-1 min-w-0">
              <span className="text-sm">{r.t}</span>
              {r.cond && <span className="ml-2 text-[11px] text-[#6f869c]">（{r.cond}）</span>}
              {r.hidden && <span className="ml-2 text-[11px] text-[#e0bd8b]">預設收起</span>}
            </span>
            <button className={btn} onClick={() => move(i, -1)} disabled={i === 0 || pending} title="往上">↑</button>
            <button className={btn} onClick={() => move(i, 1)} disabled={i === list.length - 1 || pending} title="往下">↓</button>
            <button
              className={btn + " w-24"}
              onClick={() => toggle(i)}
              disabled={pending}
              title={r.hidden ? "改成預設顯示" : "改成預設收起"}
            >
              {r.hidden ? "預設收起" : "預設顯示"}
            </button>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          className="rounded-lg bg-[#c99a5b] px-4 py-2 text-sm font-bold text-[#08202a] disabled:opacity-40"
          onClick={save}
          disabled={pending || !dirty}
        >
          {pending ? "存檔中…" : dirty ? "儲存預設順序" : "已是最新"}
        </button>
        <button className={btn} onClick={resetAll} disabled={pending}>回復系統內建順序</button>
        {dirty && <span className="text-xs text-[#e0bd8b]">有未存檔的變更</span>}
      </div>
    </div>
  );
}
