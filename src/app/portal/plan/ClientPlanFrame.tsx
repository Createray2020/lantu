"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { UI_SCALE_KEY, normalizeScale } from "@/lib/uiScale";
import { addMyNoteAction, deleteMyNoteAction, listMyNotesAction } from "./actions";
import type { NoteRow, NoteInput } from "@/lib/notes";

// 客戶端唯讀檢視：把自己的 case 餵進 /lantu-app.html?embed=1&role=client。
// 握手同教練端：iframe 'lantu:ready' → 父層 postMessage 'lantu:init'。客戶唯讀，不接 save。
// 客戶端沒有帳號欄位存字級，就吃 localStorage（官網頂欄那顆切換寫的同一個 key）。
function readScale() {
  try {
    return normalizeScale(localStorage.getItem(UI_SCALE_KEY) ?? 100);
  } catch {
    return 100;
  }
}

export default function ClientPlanFrame({ data, clientCode }: { data: unknown; clientCode?: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // 客戶看得到的註記＝教練勾了「客戶可見」的 ＋ 他自己寫的。
  // noteAccess 固定 'client'：他只寫得到事實層的區塊，而且永遠不能勾客戶可見。
  const notesRef = useRef<NoteRow[]>([]);

  useEffect(() => {
    // targetOrigin 一律指定本站 origin（教練端 PlanEditor 已是如此）。
    // 用 "*" 廣播的是含姓名/統編/保單號/資產負債的完整財務資料，而且下面還有 350ms×8 次重試。
    function post() {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "lantu:init",
          data,
          uiScale: readScale(),
          clientCode: clientCode ?? null,
          notes: notesRef.current,
          session: null,
          noteAccess: "client",
        },
        window.location.origin,
      );
    }
    function pushNotes() {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "lantu:notes", notes: notesRef.current, session: null, noteAccess: "client" },
        window.location.origin,
      );
    }
    async function reload() {
      try {
        notesRef.current = await listMyNotesAction();
        pushNotes();
      } catch {
        /* 註記讀失敗不該讓整份藍圖看不了 */
      }
    }
    void reload();

    async function onNote(m: { type: string; op?: string; input?: NoteInput; noteId?: string }) {
      try {
        if (m.type === "lantu:note" && m.op === "add" && m.input) {
          const r = await addMyNoteAction(m.input);
          if (r.ok) {
            notesRef.current = [...notesRef.current, r.note];
            pushNotes();
          }
        } else if (m.type === "lantu:note" && m.op === "del" && m.noteId) {
          const ok = await deleteMyNoteAction(m.noteId);
          if (ok) {
            notesRef.current = notesRef.current.filter((x) => x.id !== m.noteId);
            pushNotes();
          }
        }
        // lantu:session 不處理：開場／結束諮詢只有主責教練能做。
      } catch {
        /* 略 */
      }
    }

    function onMsg(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const m = e.data as { type?: string; op?: string; input?: NoteInput; noteId?: string } | null;
      if (m?.type === "lantu:ready") post();
      else if (m?.type === "lantu:note") void onNote(m as { type: string; op?: string; input?: NoteInput; noteId?: string });
    }
    window.addEventListener("message", onMsg);
    // 重試灌入，直到 iframe 就緒（避免握手時機錯過）。
    let tries = 0;
    const iv = setInterval(() => {
      post();
      if (++tries >= 8) clearInterval(iv);
    }, 350);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(iv);
    };
  }, [data, clientCode]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#081a2b]">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0d2b45] border-b border-white/10 text-[#eef2f7]">
        <Link href="/portal" className="text-sm text-[#a9bccf] hover:text-[#eef2f7]">← 回我的首頁</Link>
        <span className="text-sm font-bold">我的財務藍圖</span>
        <div className="flex-1" />
        <SignOutButton redirectUrl="/">
          <button className="text-xs text-[#a7bacb] hover:text-white border border-white/15 rounded px-2 py-1">登出</button>
        </SignOutButton>
      </div>
      <iframe
        ref={iframeRef}
        src="/lantu-app.html?embed=1&role=client"
        title="我的財務藍圖"
        className="flex-1 w-full border-0"
        onLoad={() =>
          iframeRef.current?.contentWindow?.postMessage(
            { type: "lantu:init", data, uiScale: readScale(), clientCode: clientCode ?? null },
            window.location.origin,
          )
        }
      />
    </div>
  );
}
