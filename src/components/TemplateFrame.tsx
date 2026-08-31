"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UI_SCALE_KEY, normalizeScale } from "@/lib/uiScale";

// 示範範本的規劃畫面。同一個元件服務兩邊：
//   後台（/admin/templates/…）  傳 save → 可編輯，自動存回。
//   教練端（/dashboard/templates/…）不傳 save → 純唯讀展示。
//
// ⚠️ 為什麼不直接用 PlanEditor：那支綁死了 savePlanDataAction（走 ownedClient()，
//    範本的 coach_id 是 null，寫不進去）以及註記／諮詢場次那一整套通道
//    （那些掛在「客戶」身上，範本沒有客戶）。硬塞進去只會讓兩種情境互相牽制，
//    而 PlanEditor 是每天都在用的東西，不該為了範本冒險。
//
// ⚠️ 註記與諮詢在範本上一律不支援。iframe 端的註記是樂觀更新（先畫出來再等父層存），
//    父層若默不作聲，那則假註記會一直留在畫面上假裝存好了——所以這裡要**明確回錯**
//    （lantu:noteerr），讓 iframe 收掉它並顯示原因。

type SaveState = "idle" | "saving" | "saved" | "error";

const NOTE_UNSUPPORTED = "示範範本不支援註記與諮詢紀錄——它不是任何一位真實客戶。";

export default function TemplateFrame({
  title,
  subtitle,
  backHref,
  backLabel,
  data,
  uiScale = 100,
  note,
  save,
}: {
  title: string;
  /** 副標。多個年度版本時這裡放版本切換連結，所以收 ReactNode 不只是字串。 */
  subtitle?: React.ReactNode;
  backHref: string;
  backLabel: string;
  data: unknown;
  uiScale?: number;
  /** 頂欄橫幅要說的話（唯讀時是「這是共用範本」，後台是「你改的是全公司共用的那一份」）。 */
  note: string;
  /** 傳了就是可編輯。唯讀端不要傳。 */
  save?: (data: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<unknown>(null);
  const saveGen = useRef(0);
  const [state, setState] = useState<SaveState>("idle");
  const readOnly = !save;

  /** 存回 DB，失敗指數退避重試（同 PlanEditor：最常見的失敗是網路瞬斷）。 */
  const doSave = useCallback(async () => {
    if (!save) return;
    const gen = ++saveGen.current;
    const backoff = [1000, 2000, 4000];
    setState("saving");
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await save(latest.current);
        if (saveGen.current !== gen) return; // 已被新的一輪接手
        if (r.ok) {
          setState("saved");
          return;
        }
        // 伺服器明確說不（權限、格式）——重試同一份資料只會得到同一個答案。
        setState("error");
        return;
      } catch {
        if (saveGen.current !== gen) return;
        if (attempt >= backoff.length) {
          setState("error");
          return;
        }
        await new Promise((r) => setTimeout(r, backoff[attempt]));
        if (saveGen.current !== gen) return;
      }
    }
  }, [save]);

  useEffect(() => {
    function currentScale() {
      try {
        return normalizeScale(localStorage.getItem(UI_SCALE_KEY) ?? uiScale);
      } catch {
        return normalizeScale(uiScale);
      }
    }

    function post(msg: unknown) {
      iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
    }

    function postInit() {
      post({
        type: "lantu:init",
        data,
        uiScale: currentScale(),
        readOnly,
        readOnlyNote: note,
        // 範本沒有客戶編號（createTemplate 刻意不發號），報告書表頭那一格留白。
        clientCode: null,
        notes: [],
        session: null,
        past: [],
        noteAccess: "none",
      });
    }

    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data as { type?: string; op?: string; data?: unknown; noteId?: string; sessionId?: string; input?: { blockKey?: string; body?: string } } | null;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "lantu:ready") {
        postInit();
        return;
      }
      // 註記／諮詢：一律回錯，不能沉默（見檔頭說明）。
      if (msg.type === "lantu:note" || msg.type === "lantu:session") {
        post({
          type: "lantu:noteerr",
          op: msg.op,
          id: msg.noteId ?? msg.sessionId ?? null,
          message: NOTE_UNSUPPORTED,
          blockKey: msg.input?.blockKey,
          body: msg.input?.body,
        });
        return;
      }
      if (msg.type === "lantu:save") {
        if (readOnly) return;
        latest.current = msg.data;
        setState("saving");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void doSave(), 700);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, uiScale, readOnly, note, doSave]);

  /**
   * 存檔狀態回報給 iframe（v12 App 的頂列會顯示「儲存中… / 已儲存 HH:MM / 儲存失敗」）。
   *
   * 為什麼要送：這條狀態字原本只在父層工具列上，教練一捲進規劃裡就看不到了——
   * Ray 回報的「沒有特別儲存的動作，不確定有沒有存到」就是這個。
   * ⚠️ iframe 自己不能宣稱「已儲存」：它只知道訊息送出去了，寫進 DB 的是這一層。
   */
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "lantu:savestate", state },
      window.location.origin,
    );
  }, [state]);

  // 還沒存完就離站＝這一段編輯直接消失。
  useEffect(() => {
    if (readOnly) return;
    if (state !== "saving" && state !== "error") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state, readOnly]);

  const statusText: Record<SaveState, string> = {
    idle: "",
    saving: "儲存中…",
    saved: "已儲存",
    error: "儲存失敗",
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#081a2b]">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0d2b45] border-b border-white/10 text-[#eef2f7]">
        <Link href={backHref} className="text-sm text-[#a9bccf] hover:text-[#eef2f7]">← {backLabel}</Link>
        <span className="text-sm font-bold">{title}</span>
        {subtitle && <span className="text-[12px] text-[#a9bccf]">{subtitle}</span>}
        <span
          className={
            "text-[11px] font-bold px-2 py-0.5 rounded border " +
            (readOnly
              ? "border-[#c99a5b]/60 text-[#e0bd8b] bg-[#c99a5b]/10"
              : "border-[#3b82f6]/60 text-[#8fb8ff] bg-[#3b82f6]/10")
          }
          title={note}
        >
          {readOnly ? "示範範本 · 唯讀" : "編輯全公司共用範本"}
        </span>
        <div className="flex-1" />
        {!readOnly && (
          <span className={"text-xs " + (state === "saved" ? "text-[#7bbf6a]" : "text-[#6b7d8f]")}>
            {state === "error" ? "" : statusText[state]}
          </span>
        )}
      </div>

      {state === "error" && !readOnly && (
        <div
          role="alert"
          className="sticky top-0 z-40 flex flex-wrap items-center gap-3 px-4 py-2.5 bg-[#5b1f22] text-[#ffd7d8] border-b border-[#ff9d9f]/40"
        >
          <span className="text-[13px] font-bold">
            ⚠️ 儲存失敗——這一段修改<b className="underline">還沒進資料庫</b>。請不要關掉這個分頁。
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void doSave()}
            className="text-[13px] font-bold rounded-md px-3 py-1 bg-[#ffd7d8] text-[#5b1f22] hover:bg-white"
          >
            立即重試
          </button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src="/lantu-app.html?embed=1"
        title={title}
        className="flex-1 w-full border-0"
        onLoad={() =>
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "lantu:init",
              data,
              uiScale: normalizeScale(uiScale),
              readOnly,
              readOnlyNote: note,
              clientCode: null,
              notes: [],
              session: null,
              past: [],
              noteAccess: "none",
            },
            window.location.origin,
          )
        }
      />
    </div>
  );
}
