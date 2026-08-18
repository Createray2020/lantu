"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

// 客戶端唯讀檢視：把自己的 case 餵進 /lantu-app.html?embed=1&role=client。
// 握手同教練端：iframe 'lantu:ready' → 父層 postMessage 'lantu:init'。客戶唯讀，不接 save。
export default function ClientPlanFrame({ data }: { data: unknown }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    // targetOrigin 一律指定本站 origin（教練端 PlanEditor 已是如此）。
    // 用 "*" 廣播的是含姓名/統編/保單號/資產負債的完整財務資料，而且下面還有 350ms×8 次重試。
    function post() {
      iframeRef.current?.contentWindow?.postMessage({ type: "lantu:init", data }, window.location.origin);
    }
    function onMsg(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const m = e.data as { type?: string } | null;
      if (m?.type === "lantu:ready") post();
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
  }, [data]);

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
        onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "lantu:init", data }, window.location.origin)}
      />
    </div>
  );
}
