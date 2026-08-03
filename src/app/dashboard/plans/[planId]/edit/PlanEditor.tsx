"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { savePlanDataAction } from "../../../actions";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

// v12 App（/lantu-app.html?embed=1）以 iframe 載入。
// 握手：iframe onLoad / 'lantu:ready' → 父層 postMessage 'lantu:init' 灌入 data；
// iframe 每次 save() → 'lantu:save'，父層 debounce 後呼叫 savePlanDataAction 存回 DB。
export default function PlanEditor({
  planId,
  clientId,
  year,
  label,
  data,
}: {
  planId: string;
  clientId: string;
  year: number;
  label: string | null;
  data: unknown;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<unknown>(null);
  const [state, setState] = useState<SaveState>("idle");

  useEffect(() => {
    function postInit() {
      iframeRef.current?.contentWindow?.postMessage({ type: "lantu:init", data }, window.location.origin);
    }

    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data as { type?: string; data?: unknown } | null;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "lantu:ready") {
        postInit();
      } else if (msg.type === "lantu:save") {
        latest.current = msg.data;
        setState("saving");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          try {
            await savePlanDataAction(planId, latest.current);
            setState("saved");
          } catch {
            setState("error");
          }
        }, 700);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [planId, data]);

  const statusText: Record<SaveState, string> = {
    idle: "",
    dirty: "未儲存",
    saving: "儲存中…",
    saved: "已儲存",
    error: "儲存失敗",
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#081a2b]">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0d2b45] border-b border-white/10 text-[#eef2f7]">
        <Link
          href={`/dashboard/clients/${clientId}`}
          onClick={() => router.refresh()}
          className="text-sm text-[#a9bccf] hover:text-[#eef2f7]"
        >
          ← 返回客戶
        </Link>
        <span className="text-sm font-bold">{year} 年度版本{label ? ` · ${label}` : ""}</span>
        <div className="flex-1" />
        <span className={"text-xs " + (state === "error" ? "text-[#d9773f]" : state === "saved" ? "text-[#7bbf6a]" : "text-[#6b7d8f]")}>
          {statusText[state]}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        src="/lantu-app.html?embed=1"
        title={`嵐途規劃 ${year}`}
        className="flex-1 w-full border-0"
        onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "lantu:init", data }, window.location.origin)}
      />
    </div>
  );
}
