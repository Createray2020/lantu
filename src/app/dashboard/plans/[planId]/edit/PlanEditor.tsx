"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { savePlanDataAction } from "../../../actions";
import { UI_SCALE_KEY, normalizeScale } from "@/lib/uiScale";
import { LICENSE_LOCKED_MESSAGE } from "@/lib/license";

// 唯讀有兩種來源，提示文字必須分開：協作教練沒有「期限」問題，
// 給他看「請聯繫管理員延長期限」只會讓他去找錯的人。
const RO_NOTE = {
  license: LICENSE_LOCKED_MESSAGE,
  collab: "共同執案（唯讀）：這份報告書由主責教練維護，你的修改不會被儲存。",
} as const;
const RO_BADGE = { license: "唯讀", collab: "協作唯讀" } as const;

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
  uiScale = 100,
  readOnly = false,
  readOnlyReason = "license",
  clientCode = null,
}: {
  planId: string;
  clientId: string;
  year: number;
  label: string | null;
  data: unknown;
  uiScale?: number;
  readOnly?: boolean;
  /** 唯讀的原因：license＝使用期限到期；collab＝我是被邀來共同執案的協作教練。 */
  readOnlyReason?: "license" | "collab";
  /** 客戶編號：報告書／方案書／診斷書的表頭要印它。 */
  clientCode?: string | null;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<unknown>(null);
  const [state, setState] = useState<SaveState>("idle");

  useEffect(() => {
    // 規劃器是 px 版面，父層的 rem 縮放對它無效 —— 一併把字級與唯讀狀態送進去。
    // 以 localStorage 為準：使用者剛在頂欄按過字級，帳號欄位還沒重新讀進來。
    function currentScale() {
      try {
        return normalizeScale(localStorage.getItem(UI_SCALE_KEY) ?? uiScale);
      } catch {
        return normalizeScale(uiScale);
      }
    }

    function postInit() {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "lantu:init", data, uiScale: currentScale(), readOnly, readOnlyNote: RO_NOTE[readOnlyReason], clientCode: clientCode ?? null },
        window.location.origin,
      );
    }

    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data as { type?: string; data?: unknown } | null;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "lantu:ready") {
        postInit();
      } else if (msg.type === "lantu:save") {
        if (readOnly) return; // 到期唯讀：不寫回（server action 也會擋，這裡只是不要一直跳「儲存失敗」）
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
  }, [planId, data, uiScale, readOnly, readOnlyReason, clientCode]);

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
        {readOnly && (
          <span
            className={
              "text-[11px] font-bold px-2 py-0.5 rounded border " +
              (readOnlyReason === "collab"
                ? "border-[#3b82f6]/60 text-[#8fb8ff] bg-[#3b82f6]/10"
                : "border-[#e5484d]/60 text-[#ff9d9f] bg-[#e5484d]/10")
            }
            title={RO_NOTE[readOnlyReason]}
          >
            {RO_BADGE[readOnlyReason]}
          </span>
        )}
        <div className="flex-1" />
        <Link href={`/dashboard/plans/${planId}/history`} className="text-xs text-[#a9bccf] hover:text-[#eef2f7] mr-3">版本紀錄</Link>
        <span className={"text-xs " + (state === "error" ? "text-[#d9773f]" : state === "saved" ? "text-[#7bbf6a]" : "text-[#6b7d8f]")}>
          {statusText[state]}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        src="/lantu-app.html?embed=1"
        title={`嵐途規劃 ${year}`}
        className="flex-1 w-full border-0"
        onLoad={() =>
          iframeRef.current?.contentWindow?.postMessage(
            { type: "lantu:init", data, uiScale: normalizeScale(uiScale), readOnly, readOnlyNote: RO_NOTE[readOnlyReason], clientCode: clientCode ?? null },
            window.location.origin,
          )
        }
      />
    </div>
  );
}
